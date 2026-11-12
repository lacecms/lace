import { parseFlags } from "./parse-flags.js";
import { CliError, EXIT, type CliOptions, type Command, type Target } from "./core.js";
export { CliError, EXIT } from "./core.js";
export type { CliOptions, Command, Target } from "./core.js";

export const usage =
  "Usage: lace <db migrate|content sync [--check]|auth bootstrap> [--target node|cloudflare-local|cloudflare-remote] [--operator-env <path> (remote only)] [--json]\n       lace env prepare [--target cloudflare-local] [--json]";

export function parseArguments(argv: readonly string[]): CliOptions {
  const {
    positional: words,
    seen,
    values,
  } = parseFlags(argv, {
    boolean: ["--check", "--json"],
    value: ["--target", "--operator-env"],
    positional: true,
    allowWhitespaceValue: true,
    invalid: () => {
      throw new CliError("USAGE", usage, EXIT.USAGE);
    },
  });
  const targetValue = values.get("--target");
  if (
    targetValue !== undefined &&
    !["node", "cloudflare-local", "cloudflare-remote"].includes(targetValue)
  )
    throw new CliError("USAGE", usage, EXIT.USAGE);
  const target = (targetValue ?? "node") as Target;
  const targetSeen = seen.has("--target");
  const operatorEnv = values.get("--operator-env");
  const check = seen.has("--check");
  const json = seen.has("--json");
  const command = words.join(" ");
  if (
    !["db migrate", "content sync", "auth bootstrap", "env prepare"].includes(command) ||
    (command === "env prepare" && targetSeen && target !== "cloudflare-local") ||
    (check && command !== "content sync") ||
    (operatorEnv !== undefined &&
      (!targetSeen || target !== "cloudflare-remote" || command === "env prepare"))
  )
    throw new CliError("USAGE", usage, EXIT.USAGE);
  return {
    check,
    command: command as Command,
    json,
    target,
    ...(operatorEnv === undefined ? {} : { operatorEnv }),
  };
}

export interface CliEnvironment {
  readonly accountId?: string | undefined;
  readonly apiToken?: string | undefined;
  readonly databaseId?: string | undefined;
  readonly databasePath?: string | undefined;
  readonly persistTo?: string | undefined;
  readonly wranglerConfig?: string | undefined;
}

/** Names invalid settings only; supplied values never enter an error. */
export function loadEnvironment(
  target: Target,
  values: Readonly<Record<string, string | undefined>>,
): CliEnvironment {
  const required =
    target === "node"
      ? ["LACE_DATABASE_PATH"]
      : target === "cloudflare-local"
        ? ["LACE_D1_DATABASE_ID", "LACE_CLOUDFLARE_PERSIST_TO"]
        : ["CLOUDFLARE_ACCOUNT_ID", "LACE_D1_DATABASE_ID", "CLOUDFLARE_API_TOKEN"];
  const missing = required.filter((name) => !values[name]?.trim());
  if (missing.length > 0)
    throw new CliError("CONFIG", `Missing configuration: ${missing.join(", ")}.`, EXIT.CONFIG);
  if (target === "node") return { databasePath: values.LACE_DATABASE_PATH };
  if (target === "cloudflare-local")
    return {
      databaseId: values.LACE_D1_DATABASE_ID,
      persistTo: values.LACE_CLOUDFLARE_PERSIST_TO,
      wranglerConfig: values.LACE_WRANGLER_CONFIG,
    };
  return {
    accountId: values.CLOUDFLARE_ACCOUNT_ID,
    apiToken: values.CLOUDFLARE_API_TOKEN,
    databaseId: values.LACE_D1_DATABASE_ID,
    wranglerConfig: values.LACE_WRANGLER_CONFIG,
  };
}

export function presentResult(
  result: {
    readonly ok: boolean;
    readonly code: string;
    readonly message: string;
    readonly data?: unknown;
    readonly operation?: string;
    readonly reason?: string;
    readonly nextAction?: string;
  },
  json: boolean,
): string {
  return json
    ? JSON.stringify(result)
    : result.operation === undefined
      ? result.message
      : `${result.message}\nOperation: ${result.operation}\nReason: ${result.reason}\nRecovery: ${result.nextAction}`;
}
