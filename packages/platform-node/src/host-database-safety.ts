import { execFile } from "node:child_process";
import { access, realpath } from "node:fs/promises";
import { dirname, posix, relative, resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
/** Deliberately select only the database setting, never the full environment. */
const containerFormat =
  '{"running":{{json .State.Running}},"service":{{json (index .Config.Labels "com.docker.compose.service")}},' +
  '"workingDirectory":{{json .Config.WorkingDir}},"databasePaths":[' +
  '{{range .Config.Env}}{{if eq (index (split . "=") 0) "LACE_DATABASE_PATH"}}{{json .}},{{end}}{{end}}null],' +
  '"mounts":{{json .Mounts}}}';

interface ContainerStorage {
  readonly running: boolean;
  readonly service: string;
  readonly workingDirectory: string;
  readonly databasePaths: readonly string[];
  readonly mounts: readonly {
    readonly Type: string;
    readonly Source: string;
    readonly Destination: string;
  }[];
}

function parseContainer(value: unknown): ContainerStorage {
  if (typeof value !== "object" || value === null) throw new Error();
  const row = value as Partial<Record<keyof ContainerStorage, unknown>>;
  if (
    typeof row.running !== "boolean" ||
    typeof row.service !== "string" ||
    !row.service ||
    typeof row.workingDirectory !== "string" ||
    !Array.isArray(row.databasePaths) ||
    row.databasePaths.at(-1) !== null ||
    !Array.isArray(row.mounts)
  )
    throw new Error();
  const databasePaths = row.databasePaths.slice(0, -1);
  if (
    databasePaths.some(
      (path) => typeof path !== "string" || !path.startsWith("LACE_DATABASE_PATH="),
    )
  )
    throw new Error();
  const mounts = row.mounts.map((mount: unknown) => {
    if (typeof mount !== "object" || mount === null) throw new Error();
    const item = mount as Record<string, unknown>;
    if (
      typeof item.Type !== "string" ||
      !["bind", "volume", "tmpfs"].includes(item.Type) ||
      typeof item.Destination !== "string" ||
      !posix.isAbsolute(item.Destination) ||
      (item.Type === "bind" && (typeof item.Source !== "string" || !posix.isAbsolute(item.Source)))
    )
      throw new Error();
    return {
      Type: item.Type,
      Destination: posix.normalize(item.Destination),
      Source: typeof item.Source === "string" ? item.Source : "",
    };
  });
  return {
    running: row.running,
    service: row.service,
    workingDirectory: row.workingDirectory,
    databasePaths,
    mounts,
  };
}

async function hostDatabase(container: ContainerStorage): Promise<string | undefined> {
  if (!container.running) return undefined;
  const settings = container.databasePaths;
  if (settings.length === 0) {
    if (container.service === "api" || container.service === "dispatcher") throw new Error();
    return undefined;
  }
  if (settings.length !== 1) throw new Error();
  const configured = settings[0]!.slice("LACE_DATABASE_PATH=".length);
  if (!configured || configured.includes("\0")) throw new Error();
  if (configured === ":memory:") return undefined;
  if (!posix.isAbsolute(configured) && !posix.isAbsolute(container.workingDirectory))
    throw new Error();
  const database = posix.resolve(container.workingDirectory || "/", configured);
  // Nested mounts shadow their parents, including named volumes over source binds.
  const matches = container.mounts
    .filter(
      (mount) =>
        database === mount.Destination ||
        database.startsWith(mount.Destination === "/" ? "/" : `${mount.Destination}/`),
    )
    .sort((left, right) => right.Destination.length - left.Destination.length);
  const mount = matches[0];
  if (!mount) return undefined; // Container-only storage cannot be this host file.
  if (matches[1]?.Destination === mount.Destination) throw new Error();
  if (mount.Type !== "bind") return undefined;
  return canonical(resolve(mount.Source, posix.relative(mount.Destination, database)));
}
export class HostDatabaseSafetyError extends Error {
  public constructor(readonly reason: "compose-active" | "compose-inspection") {
    super("Host SQLite safety check refused access.");
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/** Resolve symlinked parents even before the selected database exists. */
async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const parent = dirname(path);
    if (parent === path) throw error;
    return resolve(await canonical(parent), relative(parent, path));
  }
}

export async function assertHostDatabaseSafe(input: {
  readonly databasePath: string;
  readonly cwd?: string;
  readonly inspect?: (args: readonly string[]) => Promise<string>;
  readonly inContainer?: boolean;
}): Promise<void> {
  if (input.databasePath === ":memory:") return;
  const cwd = input.cwd ?? process.cwd();
  const container = input.inContainer ?? (await exists("/.dockerenv"));
  if (container) return;
  const compose = await Promise.all(
    ["compose.yml", "compose.yaml", "docker-compose.yml", "docker-compose.yaml"].map((name) =>
      exists(resolve(cwd, name)),
    ),
  );
  if (!compose.some(Boolean)) return;
  const inspect =
    input.inspect ??
    (async (args: readonly string[]) => {
      const result = await execute("docker", [...args], {
        timeout: 5000,
        maxBuffer: 1024 * 1024,
        encoding: "utf8",
      });
      return result.stdout;
    });
  try {
    const selected = await canonical(resolve(cwd, input.databasePath));
    const raw = await inspect([
      "ps",
      "--filter",
      "label=com.docker.compose.project",
      "--format",
      "{{.ID}}",
    ]);
    const ids = raw.trim() ? raw.trim().split(/\s+/u) : [];
    if (ids.length > 256 || ids.some((id) => !/^[a-f0-9]{12,64}$/u.test(id))) throw new Error();
    if (new Set(ids).size !== ids.length) throw new Error();
    if (ids.length === 0) return;
    const records = (await inspect(["inspect", "--format", containerFormat, ...ids]))
      .trim()
      .split("\n");
    if (records.length !== ids.length) throw new Error();
    for (const record of records) {
      const database = await hostDatabase(parseContainer(JSON.parse(record)));
      if (database === selected) throw new HostDatabaseSafetyError("compose-active");
    }
  } catch (error) {
    if (error instanceof HostDatabaseSafetyError) throw error;
    throw new HostDatabaseSafetyError("compose-inspection");
  }
}
