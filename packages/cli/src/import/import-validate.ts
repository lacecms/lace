import { readFile, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeDraftCandidate } from "@lacecms/application";
import type { CompleteDraftInput, NormalizedDraftCandidate } from "@lacecms/application";
import type { NormalizedContentModel, RuntimeConfigProjection } from "@lacecms/config";
import {
  blockKeyAt,
  IMPORT_FILE,
  ImportError,
  MAX_IMPORT_FILE_BYTES,
  modelRuleIssues,
  parseImportPackage,
  pointer,
} from "./import-format.js";
import type { ImportEntry, ImportIssue, ImportModelFacts, ImportPackage } from "./import-format.js";
import { inspectPackageMedia } from "./import-files.js";
import type { PackageMedia } from "./import-files.js";
import { collectReferences, placeholderResolver, rewriteReferences } from "./import-references.js";
import type { EntryReference, FieldShapes, Resolver } from "./import-references.js";

/** The project's runtime configuration as `lace import` uses it. */
export interface ImportConfiguration {
  readonly blocks: RuntimeConfigProjection["blocks"];
  readonly models: ReadonlyMap<string, NormalizedContentModel>;
}

/** One entry that passed local validation. */
export interface ValidatedEntry {
  readonly entry: ImportEntry;
  readonly index: number;
  readonly model: NormalizedContentModel;
  readonly references: readonly EntryReference[];
  readonly willPublish: boolean;
}

export interface ValidatedPackage {
  readonly root: string;
  readonly pkg: ImportPackage;
  readonly config: ImportConfiguration;
  readonly media: PackageMedia;
  readonly entries: readonly ValidatedEntry[];
}

/** Loads the root lace.config.ts like `lace content sync`. */
export async function loadImportConfiguration(cwd: string): Promise<ImportConfiguration> {
  let module: unknown;
  try {
    module = await import(pathToFileURL(resolve(cwd, "lace.config.ts")).href);
  } catch {
    throw new ImportError(
      "IMPORT_SETTINGS",
      "Could not load root lace.config.ts; run lace import from the CMS project root.",
    );
  }
  const runtime = (module as { default?: { runtime?: Partial<RuntimeConfigProjection> } }).default
    ?.runtime;
  if (!Array.isArray(runtime?.content) || typeof runtime.blocks?.get !== "function")
    throw new ImportError("IMPORT_SETTINGS", "Invalid root lace.config.ts.");
  return {
    blocks: runtime.blocks,
    models: new Map(runtime.content.map((model) => [model.key, model])),
  };
}

export function modelFacts(model: NormalizedContentModel): ImportModelFacts {
  return {
    key: model.key,
    kind: model.kind,
    ...(model.kind === "collection" && model.route === undefined ? { routeLess: true } : {}),
    seo: model.kind !== "global" && model.seo !== undefined,
  };
}

export function blockShapes(config: ImportConfiguration) {
  return (type: string): FieldShapes | undefined =>
    config.blocks.get(type)?.fields as FieldShapes | undefined;
}

/** The complete draft for an entry with references resolved by `resolve`. */
export function draftInput(
  entry: ImportEntry,
  model: NormalizedContentModel,
  config: ImportConfiguration,
  resolve: Resolver,
): CompleteDraftInput {
  const rewritten = rewriteReferences(
    entry,
    model.fields as FieldShapes,
    blockShapes(config),
    resolve,
  );
  return {
    title: entry.title ?? model.label ?? model.key,
    ...(entry.slug === undefined ? {} : { slug: entry.slug }),
    fields: rewritten.fields as CompleteDraftInput["fields"],
    blocks: entry.blocks.map((block, index) => ({
      ...(block.anchor === undefined ? {} : { anchor: block.anchor }),
      ...(block.className === undefined ? {} : { className: block.className }),
      data: rewritten.blocks[index]!.data as CompleteDraftInput["fields"],
      ...(block.hidden === undefined ? {} : { hidden: block.hidden }),
      key: blockKeyAt(block, index) as CompleteDraftInput["blocks"][number]["key"],
      position: index + 1,
      schemaVersion: config.blocks.get(block.type)?.version ?? 1,
      ...(rewritten.blocks[index]!.settings === undefined
        ? {}
        : { settings: rewritten.blocks[index]!.settings as CompleteDraftInput["fields"] }),
      type: block.type,
    })),
    ...(rewritten.seo === undefined ? {} : { seo: rewritten.seo }),
  };
}

/** Normalizes like the server; throws the server's validation errors. */
export function normalizeDraft(
  draft: CompleteDraftInput,
  model: NormalizedContentModel,
  config: ImportConfiguration,
  mode: "draft" | "publish",
): NormalizedDraftCandidate {
  return normalizeDraftCandidate({ blocks: config.blocks, draft, mode, model });
}

function issuesOf(
  error: unknown,
  at: (path: readonly (string | number)[]) => string,
): ImportIssue[] {
  const issues = (error as { issues?: unknown }).issues;
  if (error instanceof Error && error.name === "ContentValidationError" && Array.isArray(issues))
    return issues.map((issue: { path: readonly (string | number)[]; message: string }) => ({
      pointer: at(issue.path),
      message: issue.message,
    }));
  if (error instanceof Error && error.name === "BlockOrderError")
    return [{ pointer: at(["blocks"]), message: "has an invalid block key or order." }];
  return [{ pointer: at([]), message: "is not a valid draft for its model." }];
}

/** Validates one entry in draft mode, and publish mode when it will publish. */
function entryIssues(validated: ValidatedEntry, config: ImportConfiguration): ImportIssue[] {
  const { entry, index, model, willPublish } = validated;
  const at = (path: readonly (string | number)[]) => pointer("entries", index, ...path);
  const draft = draftInput(entry, model, config, placeholderResolver);
  for (const mode of willPublish ? (["draft", "publish"] as const) : (["draft"] as const)) {
    try {
      normalizeDraft(draft, model, config, mode);
    } catch (error) {
      return issuesOf(error, at);
    }
  }
  return [];
}

async function readPackageJson(root: string): Promise<unknown> {
  const path = join(root, IMPORT_FILE);
  let size: number;
  try {
    const info = await stat(path);
    if (!info.isFile()) throw new Error("not a file");
    size = info.size;
  } catch {
    throw new ImportError(
      "IMPORT_INVALID",
      `The package directory has no readable ${IMPORT_FILE}.`,
    );
  }
  if (size > MAX_IMPORT_FILE_BYTES)
    throw new ImportError("IMPORT_INVALID", `${IMPORT_FILE} exceeds 16 MiB.`, [
      { pointer: "", message: "exceeds 16 MiB." },
    ]);
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    throw new ImportError("IMPORT_INVALID", `${IMPORT_FILE} is not valid JSON.`, [
      { pointer: "", message: "is not valid JSON." },
    ]);
  }
}

/**
 * Reads and validates a package against the project configuration with no
 * network access. Reports every issue at once.
 */
export async function validatePackage(
  directory: string,
  config: ImportConfiguration,
  options: { readonly publish: boolean },
): Promise<ValidatedPackage> {
  let root: string;
  try {
    root = await realpath(directory);
  } catch {
    throw new ImportError("IMPORT_INVALID", "The package directory does not exist.");
  }
  const pkg = parseImportPackage(await readPackageJson(root));
  const facts = new Map([...config.models].map(([key, model]) => [key, modelFacts(model)]));
  const issues = modelRuleIssues(pkg, facts);
  const media = await inspectPackageMedia(root, pkg.media, issues);
  const keys = {
    media: new Set(pkg.media.map((item) => item.key)),
    entries: new Map(
      pkg.entries.flatMap((entry) => {
        const model = config.models.get(entry.model);
        return model === undefined ? [] : [[entry.key, model.kind] as const];
      }),
    ),
  };
  const entries: ValidatedEntry[] = [];
  for (const [index, entry] of pkg.entries.entries()) {
    const model = config.models.get(entry.model);
    if (model === undefined) continue;
    const before = issues.length;
    const references = collectReferences(
      entry,
      index,
      model.fields as FieldShapes,
      blockShapes(config),
      keys,
      issues,
    );
    const validated = {
      entry,
      index,
      model,
      references,
      willPublish: options.publish && entry.publish !== false,
    };
    const ruled = issues.some((issue) => issue.pointer.startsWith(`${pointer("entries", index)}/`));
    if (issues.length === before && !ruled) issues.push(...entryIssues(validated, config));
    entries.push(validated);
  }
  if (issues.length > 0)
    throw new ImportError(
      "IMPORT_INVALID",
      `${IMPORT_FILE} is invalid (${issues.length} ${issues.length === 1 ? "issue" : "issues"}).`,
      issues,
    );
  return { root, pkg, config, media, entries };
}
