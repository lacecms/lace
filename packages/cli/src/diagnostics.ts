import { CliError, EXIT, type Command, type Target } from "./index.js";
import { UpgradeError } from "./upgrade-input.js";
import { BlockError } from "./blocks-registry.js";

export type Operation =
  | Command
  | "upgrade"
  | "doctor"
  | "cloudflare preflight"
  | "add block"
  | "cli";
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
export interface Diagnostic {
  readonly operation: Operation;
  readonly reason: string;
  readonly nextAction: string;
}

/** Recognize command words only; never interpolate supplied arguments. */
export function identifyOperation(argv: readonly string[]): Operation {
  if (argv[0] === "cloudflare" && argv[1] === "preflight") return "cloudflare preflight";
  if (argv[0] === "doctor") return "doctor";
  if (argv[0] === "upgrade") return "upgrade";
  if (argv[0] === "add" && argv[1] === "block") return "add block";
  const words = argv.filter(
    (word, index) =>
      !word.startsWith("--") &&
      argv[index - 1] !== "--target" &&
      argv[index - 1] !== "--operator-env",
  );
  const command = words.slice(0, 2).join(" ");
  return command === "db migrate" ||
    command === "content sync" ||
    command === "auth bootstrap" ||
    command === "env prepare"
    ? command
    : "cli";
}

export function filesystemKind(error: unknown): DiagnosticKind | undefined {
  let current = error;
  for (let depth = 0; depth < 4 && current !== null && typeof current === "object"; depth += 1) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (code === "EACCES" || code === "EPERM" || code === "SQLITE_READONLY" || code === "EROFS")
      return "permission";
    if (code === "ENOTDIR" || code === "EISDIR" || code === "EEXIST" || code === "SQLITE_CANTOPEN")
      return "path";
    if (code === "SQLITE_BUSY" || code === "SQLITE_LOCKED") return "locked";
    current = cause;
  }
  return undefined;
}

/** Bounded traversal of cause chains; raw messages are never returned. */
export function missingLedger(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth += 1) {
    if (
      /\bno such table: (?:main\.)?(?:__drizzle_migrations|d1_migrations)\b/u.test(current.message)
    )
      return true;
    current = current.cause;
  }
  return false;
}

export function failureDiagnostic(
  operation: Operation,
  code: string,
  target: Target = "node",
  kind?: DiagnosticKind,
): Diagnostic {
  const worker = operation === "env prepare" && target === "cloudflare-local";
  const envFile = worker ? "worker/.dev.vars" : ".env";
  const catalog: Record<string, readonly [string, string]> = {
    "compose-active": [
      "A running Compose service uses the selected SQLite storage.",
      "Stop api and dispatcher (and any other matching storage consumer), keep them stopped during maintenance, then retry and restart them.",
    ],
    "compose-inspection": [
      "Compose storage safety could not be established.",
      "Restore local Docker inspection, stop api and dispatcher during maintenance, and retry. No database was opened.",
    ],
    "operator-file": [
      "The selected operator file cannot be safely loaded.",
      "Use --operator-env with a private regular non-symlink file, owner-only permissions and unique supported assignments; preserve existing credentials.",
    ],
    "env-exists": [
      `The ${envFile} destination already exists; preparation refuses to overwrite it.`,
      `Keep the existing ${envFile} and review its settings privately. Preparation does not rotate credentials; do not delete an active installation's configuration to rerun it.`,
    ],
    "env-template": worker
      ? [
          "The local worker/.dev.vars.example is missing or is not a valid regular template.",
          "Restore a regular non-symlink worker/.dev.vars.example with one single-line LACE_AUTH_SECRET= assignment (copy it from a freshly generated --cloudflare project), then retry lace env prepare --target cloudflare-local.",
        ]
      : [
          "The local .env.example is missing or is not a valid regular template.",
          "Restore a regular non-symlink .env.example with one single-line NAME=value assignment for LACE_AUTH_SECRET, LACE_MINIO_ROOT_ACCESS_KEY, LACE_MINIO_ROOT_SECRET, LACE_BUILDER_SECRET and LACE_BUILD_TOKEN, then retry lace env prepare.",
        ],
    "env-filesystem": [
      "Local environment preparation could not read, stage or publish its protected file.",
      `Check project directory permissions and support for local hard links, then retry lace env prepare. Preserve any existing ${envFile}; remove private .lace-env-* remnants only after confirming no preparation is running.`,
    ],
    permission: [
      "Filesystem access was denied or the database is read-only.",
      "Check permissions for the selected database/project and parent directories; grant the command's user the required access and retry.",
    ],
    path: [
      "The selected filesystem path cannot be used as a database or directory.",
      "Check LACE_DATABASE_PATH or the selected project path; ensure parent components are directories and the destination has the expected file type, then retry.",
    ],
    locked: [
      "The selected database is locked by another operation.",
      "Wait for the current database operation to finish, then retry against the same target.",
    ],
    "setup-complete": [
      "First-administrator setup has already completed.",
      "Sign in with the existing administrator at /admin/; bootstrap cannot issue another setup token.",
    ],
    "project-config": [
      "The root lace.config.ts could not be loaded or is invalid.",
      "Check the root lace.config.ts export and its field/model definitions using a compatible config package; correct it and repeat content sync.",
    ],
    "d1-auth": [
      "Cloudflare rejected D1 authorization.",
      "Check CLOUDFLARE_API_TOKEN permissions and the selected CLOUDFLARE_ACCOUNT_ID and LACE_D1_DATABASE_ID; retry only the explicitly selected target.",
    ],
    "d1-unavailable": [
      "Cloudflare D1 or its local persisted state is unavailable.",
      "Check connectivity or access to LACE_CLOUDFLARE_PERSIST_TO for the selected target and retry; do not switch to a remote target implicitly.",
    ],
    "d1-response": [
      "Cloudflare D1 returned an unsuccessful or invalid response.",
      "Check the selected D1 binding and provider availability; retry the same target after resolving the provider failure.",
    ],
    wrangler: [
      "The configured Wrangler migration process could not complete.",
      "Check the installed Wrangler executable, LACE_WRANGLER_CONFIG DB binding and explicit local/remote target; verify access and retry.",
    ],
    USAGE: [
      "Command arguments or target selection are invalid.",
      "Run lace --help (or lace upgrade --help), correct the arguments and select a supported target explicitly.",
    ],
    CONFIG: [
      "Required configuration is missing or invalid.",
      "Set the named settings for the selected target and check the configuration/binding names in the message; retry without changing targets implicitly.",
    ],
    SCHEMA_OUTDATED: [
      "The selected database is missing or its migration ledger is outdated.",
      `Run lace db migrate --target ${target} with the same settings, then retry the original command.`,
    ],
    SYNC_PENDING: [
      "Configuration synchronization is pending or the checked plan is invalid.",
      "Review the synchronization report and resolve incompatible changes; then explicitly run lace content sync for the same target and repeat --check.",
    ],
    SYNC_BLOCKED: [
      "Configuration changes are incompatible with stored content.",
      "Review the reported model conflicts and restore compatible configuration or plan an explicit content migration; repeat content sync after resolving them.",
    ],
    UPGRADE_INPUT: [
      "Upgrade inputs are missing, incompatible or unsafe.",
      "Check the reported manifest/input issue and select a pristine compatible template with safe regular paths; keep site/ and lace.config.ts user-owned.",
    ],
    UPGRADE_INSPECTION: [
      "Upgrade inputs could not be inspected safely.",
      "Check filesystem access and regular file/directory paths in the selected project/template, then retry the review.",
    ],
    UPGRADE_CONFLICTS: [
      "Managed files conflict with the selected upgrade template.",
      "Review the reported diffs or .lace/conflicts/ artifacts; preserve local edits and explicitly choose reviewed working bytes, then rerun the dry run before apply. Do not bypass conflicts by changing baseline hashes.",
    ],
    UPGRADE_BUSY: [
      "Another upgrade owns the lock or ownership is uncertain.",
      "Inspect .lace/upgrade/lock.json and lock-access.json; verify no owner is active before documented manual lock recovery, then retry.",
    ],
    UPGRADE_RECOVERY: [
      "Recorded upgrade recovery cannot safely continue.",
      "Preserve .lace/upgrade/ and unexpected working edits; inspect the reported state and repeat matching --apply or --rollback in the recorded direction.",
    ],
    UPGRADE_RECOVERY_PENDING: [
      "An interrupted upgrade has pending recovery.",
      "Inspect .lace/upgrade/ and resume matching --apply or --rollback in the recorded direction before deploying.",
    ],
    BLOCK_USAGE: [
      "Block selection or command arguments are invalid.",
      "Run lace add block --help, name registry or configured block types (or --all) and retry.",
    ],
    BLOCK_INPUT: [
      "The selected site, its lace.site.json or a block path cannot be used safely.",
      "Select the Astro project root with --site <dir>, keep lace.site.json paths relative inside the site without symbolic links, and retry; nothing was overwritten.",
    ],
    BLOCK_FRAMEWORK: [
      "The site framework has no Lace block support yet.",
      "Use an Astro site, or set framework to astro in lace.site.json or with --framework astro if the detection was wrong.",
    ],
    BLOCK_CONFIG: [
      "The project configuration or custom block definitions could not be used.",
      "Run the command from the CMS project root that contains lace.config.ts, and record the module exporting custom defineBlock values as definitions in lace.site.json.",
    ],
    BLOCK_REGISTRY: [
      "The block registry bundled with this CLI is missing or invalid.",
      "Reinstall @lacecms/cli at the release version and retry; do not edit its bundled registry.",
    ],
    BLOCKS_CONFLICTS: [
      "Some block files, the block map or block versions conflict with the requested installation.",
      "Review the reported diffs (or .new files from --write-new), merge the registry changes into your edited files or add the printed block map lines yourself; edited files are never overwritten.",
    ],
    UPGRADE_APPLY: [
      "Upgrade or rollback could not complete safely.",
      "Preserve .lace/upgrade/; resolve filesystem access or the reported artifact conflict, then repeat matching --apply or --rollback in the recorded direction.",
    ],
  };
  const [reason, nextAction] = catalog[kind ?? code] ?? [
    "The operation failed for an unrecognized reason.",
    "Check access, configuration and service availability for the selected target; preserve database and upgrade recovery data before retrying the same command.",
  ];
  return { operation, reason, nextAction };
}

export function describeFailure(error: unknown, operation: Operation, target: Target = "node") {
  const known =
    error instanceof CliError || error instanceof UpgradeError || error instanceof BlockError;
  const code = known ? error.code : "OPERATION_FAILED";
  return {
    ok: false,
    code,
    message: known ? error.message : "Operation failed.",
    ...failureDiagnostic(
      operation,
      code,
      target,
      error instanceof CliError ? error.diagnosticKind : filesystemKind(error),
    ),
    exitCode:
      error instanceof CliError
        ? error.exitCode
        : error instanceof BlockError
          ? error.code === "BLOCK_USAGE"
            ? EXIT.USAGE
            : error.code === "BLOCK_REGISTRY"
              ? EXIT.OPERATION
              : EXIT.CONFIG
          : error instanceof UpgradeError && error.code === "UPGRADE_INPUT"
            ? EXIT.CONFIG
            : EXIT.OPERATION,
  };
}

export function diagnosticText(diagnostic: Diagnostic): string {
  return `Operation: ${diagnostic.operation}\nReason: ${diagnostic.reason}\nRecovery: ${diagnostic.nextAction}`;
}
