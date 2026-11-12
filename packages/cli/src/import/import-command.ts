import { parseFlags } from "../shared/parse-flags.js";
import { join, resolve } from "node:path";
import { EXIT } from "../shared/cli.js";
import { applyPlan } from "./import-apply.js";
import type { ApplySummary } from "./import-apply.js";
import { ImportClient, parseApiOrigin } from "./import-client.js";
import { ImportError } from "./import-format.js";
import type { ImportCode, ImportIssue } from "./import-format.js";
import { checkCredential, checkServerConfiguration, planImport } from "./import-plan.js";
import type { ImportPlan } from "./import-plan.js";
import { ImportState, STATE_FILE } from "./import-state.js";
import { loadImportConfiguration, validatePackage } from "./import-validate.js";
import { importUsage } from "./import-usage.js";

export { importUsage };

export interface ImportOptions {
  readonly directory: string;
  readonly url?: string;
  readonly publish: boolean;
  readonly dryRun: boolean;
  readonly validateOnly: boolean;
  readonly overwrite: boolean;
  readonly state?: string;
  readonly json: boolean;
}

function usage(): never {
  throw new ImportError("IMPORT_USAGE", importUsage);
}

/** argv excludes the leading `import` word. */
export function parseImportArguments(argv: readonly string[]): ImportOptions {
  const { seen, positional, values } = parseFlags(argv, {
    boolean: ["--publish", "--dry-run", "--validate-only", "--overwrite", "--json"],
    value: ["--url", "--state"],
    positional: true,
    invalid: usage,
  });
  const url = values.get("--url");
  const state = values.get("--state");
  const validateOnly = seen.has("--validate-only");
  if (
    positional.length !== 1 ||
    (validateOnly &&
      ["--url", "--dry-run", "--overwrite", "--state"].some((flag) => seen.has(flag)))
  )
    usage();
  return {
    directory: positional[0]!,
    ...(url === undefined ? {} : { url }),
    publish: seen.has("--publish"),
    dryRun: seen.has("--dry-run"),
    validateOnly,
    overwrite: seen.has("--overwrite"),
    ...(state === undefined ? {} : { state }),
    json: seen.has("--json"),
  };
}

export const IMPORT_EXIT: Readonly<Record<ImportCode, number>> = Object.freeze({
  IMPORT_USAGE: EXIT.USAGE,
  IMPORT_SETTINGS: EXIT.CONFIG,
  IMPORT_INVALID: EXIT.CONFIG,
  IMPORT_CONFIG_MISMATCH: EXIT.CONFIG,
  IMPORT_CONFLICT: EXIT.PENDING,
  IMPORT_UNAUTHORIZED: EXIT.OPERATION,
  IMPORT_RATE_LIMITED: EXIT.OPERATION,
  IMPORT_FAILED: EXIT.OPERATION,
});

export interface ImportRuntime {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly fetch?: typeof fetch;
  readonly sleep?: (milliseconds: number) => Promise<void>;
  readonly now?: () => number;
  /** Progress lines such as rate-limit waits (stderr in the binary). */
  readonly progress?: (line: string) => void;
}

export interface ImportOutcome {
  readonly ok: boolean;
  readonly code: string;
  readonly message: string;
  readonly exitCode: number;
  readonly json: boolean;
  readonly data?: unknown;
}

interface PlanData {
  readonly media: readonly { key: string; action: string; sameAs?: string }[];
  readonly entries: readonly { key: string; model: string; action: string; publish: string }[];
  readonly publication: string;
  readonly publishOrder: readonly string[];
  readonly summary: Readonly<Record<string, number>>;
}

function count<T>(items: readonly T[], test: (item: T) => boolean): number {
  return items.filter(test).length;
}

export function planData(plan: ImportPlan): PlanData {
  return {
    media: plan.media.map((item) => ({
      key: item.key,
      action: item.action,
      ...(item.sameAs === undefined ? {} : { sameAs: item.sameAs }),
    })),
    entries: plan.entries.map((entry) => ({
      key: entry.key,
      model: entry.model,
      action: entry.action,
      publish: entry.publish,
    })),
    publication: plan.publication,
    publishOrder: plan.publishOrder,
    summary: {
      upload: count(plan.media, (item) => item.action === "upload"),
      mediaUpdate: count(plan.media, (item) => item.action === "update"),
      mediaUnchanged: count(plan.media, (item) => item.action === "unchanged"),
      create: count(plan.entries, (entry) => entry.action === "create"),
      update: count(plan.entries, (entry) => entry.action === "update"),
      unchanged: count(plan.entries, (entry) => entry.action === "unchanged"),
      conflict: count(plan.entries, (entry) => entry.action === "conflict"),
      publish: plan.publishOrder.length,
      published: count(plan.entries, (entry) => entry.publish === "published"),
    },
  };
}

export function presentPlan(data: PlanData): string {
  const lines = ["Media:"];
  for (const item of data.media)
    lines.push(
      `  ${item.action.padEnd(10)} ${item.key}${item.sameAs === undefined ? "" : ` (same file as ${item.sameAs})`}`,
    );
  if (data.media.length === 0) lines.push("  (none)");
  lines.push("Entries:");
  for (const entry of data.entries)
    lines.push(
      `  ${entry.action.padEnd(10)} ${entry.key} (${entry.model})${entry.publish === "published" ? ", already published" : ""}`,
    );
  if (data.entries.length === 0) lines.push("  (none)");
  lines.push(
    data.publication === "skipped"
      ? "Publication: skipped (no --publish)."
      : data.publishOrder.length === 0
        ? "Publication: nothing to publish."
        : `Publication order: ${data.publishOrder.join(", ")}.`,
  );
  const s = data.summary;
  lines.push(
    `Summary: media ${s.upload} upload, ${s.mediaUpdate} update, ${s.mediaUnchanged} unchanged; entries ${s.create} create, ${s.update} update, ${s.unchanged} unchanged, ${s.conflict} conflict; ${s.publish} to publish.`,
  );
  return lines.join("\n");
}

function issueLines(issues: readonly ImportIssue[]): string {
  return issues.map((issue) => `  ${issue.pointer || "/"}: ${issue.message}`).join("\n");
}

function failure(error: ImportError, json: boolean, data?: PlanData): ImportOutcome {
  const message = [
    error.message,
    ...(error.issues.length > 0 ? [issueLines(error.issues)] : []),
    ...(data === undefined || json ? [] : [presentPlan(data)]),
  ].join("\n");
  return {
    ok: false,
    code: error.code,
    message,
    exitCode: IMPORT_EXIT[error.code],
    json,
    ...(error.issues.length > 0 || data !== undefined
      ? {
          data: {
            ...(error.issues.length > 0 ? { issues: error.issues } : {}),
            ...(data === undefined ? {} : { plan: data }),
          },
        }
      : {}),
  };
}

function completion(summary: ApplySummary): string {
  return `Import completed: ${summary.uploaded} media uploaded, ${summary.mediaUpdated} media updated, ${summary.created} entries created, ${summary.saved} drafts saved, ${summary.published} entries published.`;
}

/** Runs `lace import`; ImportErrors become outcomes, anything else propagates. */
export async function runImportCommand(
  argv: readonly string[],
  runtime: ImportRuntime,
  parse: () => ImportOptions = () => parseImportArguments(argv),
): Promise<ImportOutcome> {
  const json = argv.includes("--json");
  let data: PlanData | undefined;
  try {
    const options = parse();
    let origin: string | undefined;
    let token: string | undefined;
    if (!options.validateOnly) {
      token = runtime.env.LACE_IMPORT_TOKEN?.trim();
      const url = options.url ?? runtime.env.LACE_API_BASE_URL?.trim();
      const missing = [
        ...(token ? [] : ["LACE_IMPORT_TOKEN"]),
        ...(url ? [] : ["--url or LACE_API_BASE_URL"]),
      ];
      if (missing.length > 0)
        throw new ImportError("IMPORT_SETTINGS", `Missing configuration: ${missing.join(", ")}.`);
      origin = parseApiOrigin(url!);
    }
    const directory = resolve(runtime.cwd, options.directory);
    const config = await loadImportConfiguration(runtime.cwd);
    const validated = await validatePackage(directory, config, { publish: options.publish });
    if (options.validateOnly)
      return {
        ok: true,
        code: "IMPORT_VALID",
        message: `The import package is valid: ${validated.pkg.media.length} media, ${validated.pkg.entries.length} entries.`,
        exitCode: EXIT.OK,
        json,
        data: { media: validated.pkg.media.length, entries: validated.pkg.entries.length },
      };
    const client = new ImportClient({
      origin: origin!,
      token: token!,
      ...(runtime.fetch === undefined ? {} : { fetch: runtime.fetch }),
      ...(runtime.sleep === undefined ? {} : { sleep: runtime.sleep }),
      ...(runtime.now === undefined ? {} : { now: runtime.now }),
      onWait: (seconds, what) =>
        runtime.progress?.(`${what}: rate limited, waiting ${seconds} s before retrying.`),
    });
    const state = await ImportState.open(
      options.state === undefined
        ? join(validated.root, STATE_FILE)
        : resolve(runtime.cwd, options.state),
      origin!,
    );
    await checkCredential(client, validated, options);
    await checkServerConfiguration(client, validated);
    const plan = await planImport(client, state, validated, options);
    data = planData(plan);
    const conflicts = plan.entries.filter((entry) => entry.action === "conflict");
    if (conflicts.length > 0)
      throw new ImportError(
        "IMPORT_CONFLICT",
        `Drafts changed on the server after the last import: ${conflicts.map((entry) => entry.key).join(", ")}. Nothing was written. Review them in the admin, then rerun with --overwrite to replace them.`,
      );
    if (options.dryRun)
      return {
        ok: true,
        code: "IMPORT_PLANNED",
        message: `${presentPlan(data)}\nDry run: nothing was written.`,
        exitCode: EXIT.OK,
        json,
        data: { plan: data },
      };
    const summary = await applyPlan(client, state, validated, plan);
    return {
      ok: true,
      code: "IMPORT_COMPLETED",
      message: `${presentPlan(data)}\n${completion(summary)}`,
      exitCode: EXIT.OK,
      json,
      data: { plan: data, result: summary },
    };
  } catch (error) {
    if (error instanceof ImportError) return failure(error, json, data);
    throw error;
  }
}
