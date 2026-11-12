export type DiagnosticKind =
  | "compose-active"
  | "compose-inspection"
  | "permission"
  | "path"
  | "locked"
  | "setup-complete"
  | "d1-auth"
  | "d1-unavailable"
  | "d1-response"
  | "wrangler"
  | "env-exists"
  | "env-template"
  | "env-filesystem"
  | "project-config"
  | "operator-file";

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
    readonly code:
      | "USAGE"
      | "CONFIG"
      | "SCHEMA_OUTDATED"
      | "SCHEMA_UNSUPPORTED"
      | "OPERATION_FAILED"
      | "SYNC_PENDING",
    message: string,
    readonly exitCode: number,
    readonly diagnosticKind?: DiagnosticKind,
  ) {
    super(message);
    this.name = "CliError";
  }
}
