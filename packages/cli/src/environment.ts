import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { link, lstat, mkdtemp, open, rm } from "node:fs/promises";
import { join } from "node:path";
import { parseEnv } from "node:util";
import { CliError, EXIT } from "./index.js";

/** The project `.env` or, for `cloudflare-local`, the local Worker variables. */
export type EnvironmentTarget = "project" | "cloudflare-local";

interface Preparation {
  readonly template: string;
  readonly destination: string;
  readonly credentials: () => Readonly<Record<string, string>>;
}

function templateError(path: string): CliError {
  return new CliError("CONFIG", `Cannot use local ${path}.`, EXIT.CONFIG, "env-template");
}

function existingError(path: string): CliError {
  return new CliError(
    "OPERATION_FAILED",
    `Refusing to replace ${path}.`,
    EXIT.OPERATION,
    "env-exists",
  );
}

function accessKey(): string {
  // Uniform rejection sampling yields 20 alphanumeric characters (~119 bits).
  for (;;) {
    const value = randomBytes(15).toString("base64url");
    if (/^[A-Za-z0-9]{20}$/u.test(value)) return value;
  }
}

function projectCredentials(): Readonly<Record<string, string>> {
  return {
    LACE_AUTH_SECRET: randomBytes(32).toString("hex"),
    LACE_MINIO_ROOT_ACCESS_KEY: accessKey(),
    LACE_MINIO_ROOT_SECRET: randomBytes(32).toString("hex"),
    LACE_BUILDER_SECRET: randomBytes(32).toString("hex"),
    LACE_BUILD_TOKEN: "",
  };
}

export const PREPARATIONS: Readonly<Record<EnvironmentTarget, Preparation>> = {
  project: { template: ".env.example", destination: ".env", credentials: projectCredentials },
  "cloudflare-local": {
    template: "worker/.dev.vars.example",
    destination: "worker/.dev.vars",
    credentials: () => ({ LACE_AUTH_SECRET: randomBytes(32).toString("hex") }),
  },
};

/** Keep unrelated bytes intact; never execute or interpolate dotenv contents. */
export function renderEnvironment(
  template: string,
  credentials: Readonly<Record<string, string>> = projectCredentials(),
  templatePath = ".env.example",
): string {
  const controlled = Object.keys(credentials);
  const counts = new Map(controlled.map((name) => [name, 0]));
  let multilineQuote: string | undefined;
  const rendered = template.replace(/[^\r\n]+/gu, (line) => {
    if (multilineQuote !== undefined) {
      if (line.includes(multilineQuote)) multilineQuote = undefined;
      return line;
    }
    const assignment = /^(\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=)(.*)$/u.exec(line);
    if (!assignment) return line;
    const [, prefix, name, rawValue] = assignment;
    if (name === undefined || rawValue === undefined) return line;
    const value = rawValue.trimStart();
    const quote = value[0];
    const multiline =
      (quote === '"' || quote === "'" || quote === "`") && !value.slice(1).includes(quote);
    if (!counts.has(name)) {
      if (multiline) multilineQuote = quote;
      return line;
    }
    if (multiline) throw templateError(templatePath);
    counts.set(name, (counts.get(name) ?? 0) + 1);
    return `${prefix}${credentials[name]}`;
  });
  if (multilineQuote !== undefined || [...counts.values()].some((count) => count !== 1))
    throw templateError(templatePath);
  const parsed = parseEnv(rendered);
  if (controlled.some((name) => parsed[name] !== credentials[name]))
    throw templateError(templatePath);
  return rendered;
}

// Narrow IO injection permits deterministic write/sync/publication fault tests.
const filesystem = { link, lstat, mkdtemp, open, rm };
export async function prepareEnvironment(
  cwd = process.cwd(),
  io: typeof filesystem = filesystem,
  target: EnvironmentTarget = "project",
): Promise<void> {
  const preparation = PREPARATIONS[target];
  let staging: string | undefined;
  try {
    const destination = join(cwd, preparation.destination);
    try {
      await io.lstat(destination);
      throw existingError(preparation.destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    let template: string;
    try {
      const source = await io.open(
        join(cwd, preparation.template),
        constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
      );
      try {
        if (!(await source.stat()).isFile()) throw templateError(preparation.template);
        template = await source.readFile("utf8");
      } finally {
        await source.close();
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT" || code === "ELOOP") throw templateError(preparation.template);
      throw error;
    }
    const content = renderEnvironment(template, preparation.credentials(), preparation.template);
    staging = await io.mkdtemp(join(cwd, ".lace-env-"));
    const stagedPath = join(staging, "prepared");
    const file = await io.open(stagedPath, "wx", 0o600);
    try {
      await file.writeFile(content, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }
    try {
      await io.link(stagedPath, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw existingError(preparation.destination);
      throw error;
    }
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError(
      "OPERATION_FAILED",
      "Environment preparation failed.",
      EXIT.OPERATION,
      "env-filesystem",
    );
  } finally {
    if (staging !== undefined) await io.rm(staging, { recursive: true, force: true });
  }
}
