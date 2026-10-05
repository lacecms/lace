import type { DiagnosticKind } from "./diagnostics.js";
export const packageName = "@lacecms/cli";

export { planUpgrade, presentUpgradePlan } from "./upgrade.js";
export type { UpgradePlan, UpgradeDecision, UpgradeAction } from "./upgrade.js";
export { UpgradeError, validateUpgradeManifest } from "./upgrade-input.js";
export type { UpgradeManifest } from "./upgrade-input.js";
export { applyUpgrade } from "./upgrade-apply.js";
export { rollbackUpgrade } from "./upgrade-rollback.js";
export type { ApplyOptions, UpgradeOutcome } from "./upgrade-apply.js";
export type { UpgradeInstructions } from "./upgrade-instructions.js";

export const EXIT = Object.freeze({
  OK: 0,
  PENDING: 2,
  USAGE: 3,
  CONFIG: 4,
  SCHEMA: 5,
  OPERATION: 6,
} as const);
export type Target = "node" | "cloudflare-local" | "cloudflare-remote";
export type Command = "db migrate" | "content sync" | "auth bootstrap" | "env prepare";

export interface CliOptions {
  readonly check: boolean;
  readonly command: Command;
  readonly json: boolean;
  readonly target: Target;
  readonly operatorEnv?: string;
}

export class CliError extends Error {
  public constructor(
    readonly code: "USAGE" | "CONFIG" | "SCHEMA_OUTDATED" | "OPERATION_FAILED" | "SYNC_PENDING",
    message: string,
    readonly exitCode: number,
    readonly diagnosticKind?: DiagnosticKind,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export const usage =
  "Usage: lace <db migrate|content sync [--check]|auth bootstrap> [--target node|cloudflare-local|cloudflare-remote] [--operator-env <path> (remote only)] [--json]\n       lace env prepare [--target cloudflare-local] [--json]";

export function parseArguments(argv: readonly string[]): CliOptions {
  const words: string[] = [];
  let target: Target = "node";
  let targetSeen = false;
  let operatorEnv: string | undefined;
  let check = false;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--target") {
      const next = argv[++index];
      if (targetSeen || !["node", "cloudflare-local", "cloudflare-remote"].includes(next ?? ""))
        throw new CliError("USAGE", usage, EXIT.USAGE);
      target = next as Target;
      targetSeen = true;
    } else if (item === "--operator-env") {
      const next = argv[++index];
      if (operatorEnv !== undefined || !next || next.startsWith("--"))
        throw new CliError("USAGE", usage, EXIT.USAGE);
      operatorEnv = next;
    } else if (item === "--check") {
      if (check) throw new CliError("USAGE", usage, EXIT.USAGE);
      check = true;
    } else if (item === "--json") {
      if (json) throw new CliError("USAGE", usage, EXIT.USAGE);
      json = true;
    } else if (item?.startsWith("--")) {
      throw new CliError("USAGE", usage, EXIT.USAGE);
    } else if (item !== undefined) {
      words.push(item);
    }
  }
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
