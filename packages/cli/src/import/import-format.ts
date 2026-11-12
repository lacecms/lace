import * as v from "valibot";

/** Stable `lace import` result codes; never carry supplied values. */
export type ImportCode =
  | "IMPORT_USAGE"
  | "IMPORT_SETTINGS"
  | "IMPORT_INVALID"
  | "IMPORT_CONFIG_MISMATCH"
  | "IMPORT_CONFLICT"
  | "IMPORT_UNAUTHORIZED"
  | "IMPORT_RATE_LIMITED"
  | "IMPORT_FAILED";

/** One problem located by a JSON Pointer into `lace-import.json`. */
export interface ImportIssue {
  readonly pointer: string;
  readonly message: string;
}

export class ImportError extends Error {
  public constructor(
    readonly code: ImportCode,
    message: string,
    readonly issues: readonly ImportIssue[] = [],
  ) {
    super(message);
    this.name = "ImportError";
  }
}

export const IMPORT_FILE = "lace-import.json";
export const MAX_IMPORT_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_IMPORT_ITEMS = 5_000;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export function pointer(...segments: readonly (string | number)[]): string {
  return segments
    .map((segment) => `/${String(segment).replaceAll("~", "~0").replaceAll("/", "~1")}`)
    .join("");
}

const keySchema = v.pipe(
  v.string(),
  v.regex(KEY_PATTERN, "A key must be 1 to 128 letters, digits, dots, underscores or hyphens."),
);
const jsonObjectSchema = v.record(v.string(), v.unknown());
const nameSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(255));
const focalCoordinateSchema = v.pipe(v.number(), v.minValue(0), v.maxValue(1));

export const importMediaSchema = v.strictObject({
  key: keySchema,
  file: v.pipe(v.string(), v.minLength(1), v.maxLength(1024)),
  alt: v.optional(v.nullable(v.string())),
  caption: v.optional(v.nullable(v.string())),
  focalPoint: v.optional(
    v.nullable(v.strictObject({ x: focalCoordinateSchema, y: focalCoordinateSchema })),
  ),
  tags: v.optional(v.pipe(v.array(v.string()), v.maxLength(100))),
});

export const importBlockSchema = v.strictObject({
  type: nameSchema,
  key: v.optional(nameSchema),
  data: jsonObjectSchema,
  settings: v.optional(jsonObjectSchema),
  anchor: v.optional(v.string()),
  className: v.optional(v.string()),
  hidden: v.optional(v.boolean()),
});

export const importEntrySchema = v.strictObject({
  key: keySchema,
  model: nameSchema,
  slug: v.optional(v.string()),
  title: v.optional(v.string()),
  fields: jsonObjectSchema,
  blocks: v.pipe(v.array(importBlockSchema), v.maxLength(1_000)),
  seo: v.optional(jsonObjectSchema),
  publish: v.optional(v.boolean()),
});

/** Structural schema of format v1; model rules are checked against lace.config.ts. */
export const importPackageSchema = v.strictObject({
  $schema: v.optional(v.string()),
  formatVersion: v.literal(1),
  media: v.pipe(v.array(importMediaSchema), v.maxLength(MAX_IMPORT_ITEMS)),
  entries: v.pipe(v.array(importEntrySchema), v.maxLength(MAX_IMPORT_ITEMS)),
});

export type ImportMedia = v.InferOutput<typeof importMediaSchema>;
export type ImportBlock = v.InferOutput<typeof importBlockSchema>;
export type ImportEntry = v.InferOutput<typeof importEntrySchema>;
export type ImportPackage = v.InferOutput<typeof importPackageSchema>;

/** A block's explicit key, or `b<n>` from its 1-based position. */
export function blockKeyAt(block: ImportBlock, index: number): string {
  return block.key ?? `b${index + 1}`;
}

function invalid(issues: readonly ImportIssue[]): never {
  throw new ImportError(
    "IMPORT_INVALID",
    `${IMPORT_FILE} is invalid (${issues.length} ${issues.length === 1 ? "issue" : "issues"}).`,
    issues,
  );
}

function issuePointer(issue: v.BaseIssue<unknown>): string {
  return pointer(...(issue.path ?? []).map((item) => item.key as string | number));
}

/** Validates structure, limits and key uniqueness; reports every issue at once. */
export function parseImportPackage(value: unknown): ImportPackage {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    invalid([{ pointer: "", message: "must be a JSON object." }]);
  if ((value as { formatVersion?: unknown }).formatVersion !== 1)
    invalid([{ pointer: "/formatVersion", message: "must be 1; this CLI reads format v1." }]);
  const parsed = v.safeParse(importPackageSchema, value);
  if (!parsed.success)
    invalid(
      parsed.issues.map((issue) => ({ pointer: issuePointer(issue), message: issue.message })),
    );
  const issues: ImportIssue[] = [];
  const unique = (keys: readonly (string | undefined)[], at: (index: number) => string) => {
    const seen = new Set<string>();
    for (const [index, key] of keys.entries()) {
      if (key === undefined) continue;
      if (seen.has(key)) issues.push({ pointer: at(index), message: "duplicates an earlier key." });
      seen.add(key);
    }
  };
  const result = parsed.output;
  unique(
    result.media.map((item) => item.key),
    (index) => pointer("media", index, "key"),
  );
  unique(
    result.entries.map((entry) => entry.key),
    (index) => pointer("entries", index, "key"),
  );
  for (const [entryIndex, entry] of result.entries.entries())
    unique(
      entry.blocks.map((block, index) => blockKeyAt(block, index)),
      (index) => pointer("entries", entryIndex, "blocks", index, "key"),
    );
  if (issues.length > 0) invalid(issues);
  return result;
}

/** The model facts that format rules depend on. */
export interface ImportModelFacts {
  readonly key: string;
  readonly kind: "collection" | "global" | "page";
  /** True for a collection without a route: its entries carry no slug. */
  readonly routeLess?: boolean;
  readonly seo: boolean;
}

/**
 * Model-kind rules: slug, title and SEO per kind, one entry per singleton or
 * routed slug; entries of a route-less collection are told apart by key only.
 */
export function modelRuleIssues(
  pkg: ImportPackage,
  models: ReadonlyMap<string, ImportModelFacts>,
): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of pkg.entries.entries()) {
    const at = (...rest: string[]) => pointer("entries", index, ...rest);
    const model = models.get(entry.model);
    if (model === undefined) {
      issues.push({ pointer: at("model"), message: "names no model in lace.config.ts." });
      continue;
    }
    const routed = model.kind === "collection" && model.routeLess !== true;
    if (routed && entry.slug === undefined)
      issues.push({ pointer: at("slug"), message: "is required for a collection entry." });
    if (!routed && entry.slug !== undefined)
      issues.push({
        pointer: at("slug"),
        message:
          model.kind === "collection"
            ? "is not allowed for a collection without a route."
            : `is not allowed for a ${model.kind}.`,
      });
    if (model.kind === "global" && entry.title !== undefined)
      issues.push({ pointer: at("title"), message: "is not allowed for a global." });
    if (model.kind !== "global" && entry.title === undefined)
      issues.push({ pointer: at("title"), message: `is required for a ${model.kind}.` });
    if (entry.seo !== undefined && !model.seo)
      issues.push({ pointer: at("seo"), message: "is not enabled for this model." });
    if (model.kind === "collection" && !routed) continue;
    const identity =
      model.kind === "collection" ? `${entry.model}\u0000${entry.slug}` : entry.model;
    if (seen.has(identity))
      issues.push({
        pointer: at(model.kind === "collection" ? "slug" : "model"),
        message:
          model.kind === "collection"
            ? "duplicates another entry of this model with the same slug."
            : `duplicates another entry of this ${model.kind}.`,
      });
    seen.add(identity);
  }
  return issues;
}
