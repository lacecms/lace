import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
export const appDirectory = fileURLToPath(new URL("../..", import.meta.url));
const wrangler = join(appDirectory, "node_modules", ".bin", "wrangler");

/** The checked-in `wrangler.jsonc` fields the bundle build rewrites. */
export interface WorkerConfig {
  readonly main: string;
  readonly assets: Readonly<Record<string, unknown>>;
  readonly d1_databases: readonly Readonly<Record<string, unknown>>[];
  readonly [key: string]: unknown;
}

/** Wrangler configuration is JSONC: whole-line comments and trailing commas only. */
export function parseJsonc(text: string): unknown {
  return JSON.parse(
    text
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n")
      .replace(/,(\s*[}\]])/gu, "$1"),
  );
}

export async function readWorkerConfig(): Promise<WorkerConfig> {
  const config = parseJsonc(await readFile(join(appDirectory, "wrangler.jsonc"), "utf8"));
  return config as WorkerConfig;
}

export interface WorkerBundle {
  readonly assetsDirectory: string;
  readonly bundle: string;
  readonly config: WorkerConfig;
  readonly directory: string;
  readonly dispose: () => Promise<void>;
}

/**
 * Bundles the checked-in Worker with a Wrangler dry-run. A stand-in assets
 * directory keeps the admin build optional; `assets` files are written into it.
 */
export async function buildWorkerBundle({
  assets = { "index.html": "<!doctype html>" },
}: {
  readonly assets?: Readonly<Record<string, string | Uint8Array>>;
} = {}): Promise<WorkerBundle> {
  const config = await readWorkerConfig();
  const directory = await mkdtemp(join(tmpdir(), "lace-worker-bundle-"));
  const assetsDirectory = join(directory, "assets");
  await mkdir(assetsDirectory);
  for (const [path, content] of Object.entries(assets)) {
    await mkdir(join(assetsDirectory, path, ".."), { recursive: true });
    await writeFile(join(assetsDirectory, path), content);
  }
  const configPath = join(directory, "wrangler.json");
  await writeFile(
    configPath,
    JSON.stringify({
      ...config,
      $schema: undefined,
      assets: { ...config.assets, directory: assetsDirectory },
      d1_databases: config.d1_databases.map(
        ({ migrations_dir: _ignored, ...database }) => database,
      ),
      main: join(appDirectory, config.main),
    }),
  );
  const outdir = join(directory, "out");
  await run(wrangler, ["deploy", "--dry-run", "--config", configPath, "--outdir", outdir], {
    cwd: appDirectory,
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  return {
    assetsDirectory,
    bundle: await readFile(join(outdir, "index.js"), "utf8"),
    config,
    directory,
    dispose: () => rm(directory, { force: true, recursive: true }),
  };
}
