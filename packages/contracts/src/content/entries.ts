import {
  FIELD_KEY_PATTERN,
  FIELD_KEY_SOURCE,
  MAX_ENTRY_SEARCH_LENGTH,
  MAX_SLUG_LENGTH,
  MAX_TITLE_LENGTH,
} from "@lacecms/content";
import * as v from "valibot";
import { jsonObjectSchema } from "../shared/json.js";
import {
  identifierSchema,
  nonNegativeIntegerSchema,
  isoTimestampSchema,
  opaqueCursorSchema,
  pageLimitQuerySchema,
  cursorPageSchema,
} from "../shared/primitives.js";
import { contentBlockSchema } from "./blocks.js";
import { contentModelRouteSchema } from "./models.js";
import { seoValueSchema } from "./seo.js";

export const actorSchema = v.strictObject({
  id: identifierSchema,
  role: v.picklist(["admin", "editor", "viewer"]),
});

const snapshotFields = {
  blocks: v.array(contentBlockSchema),
  createdAt: isoTimestampSchema,
  entryId: identifierSchema,
  fields: jsonObjectSchema,
  id: identifierSchema,
  revision: nonNegativeIntegerSchema,
  /** Present for entries of models with SEO enabled. */
  seo: v.optional(seoValueSchema),
  slug: v.optional(identifierSchema),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_TITLE_LENGTH)),
  updatedAt: isoTimestampSchema,
  updatedBy: actorSchema,
};

export const draftSnapshotSchema = v.strictObject({ ...snapshotFields, state: v.literal("draft") });
export const publishedSnapshotSchema = v.strictObject({
  ...snapshotFields,
  state: v.literal("published"),
});
export const contentSnapshotSchema = v.union([draftSnapshotSchema, publishedSnapshotSchema]);

/** A human-readable actor reference that lets clients avoid rendering raw IDs. */
export const actorSummarySchema = v.strictObject({
  displayName: v.pipe(v.string(), v.minLength(1), v.maxLength(320)),
  id: identifierSchema,
});

export const contentEntrySchema = v.strictObject({
  draft: draftSnapshotSchema,
  id: identifierSchema,
  model: contentModelRouteSchema,
  published: v.optional(publishedSnapshotSchema),
});

/** Admin-only entry representation that also names the draft's last editor. */
export const adminContentEntrySchema = v.strictObject({
  ...contentEntrySchema.entries,
  updatedBy: actorSummarySchema,
});

export const publicationOutcomeSchema = v.picklist(["published", "replayed"]);
export const buildDispatchOutcomeSchema = v.variant("status", [
  v.strictObject({ status: v.literal("queued"), targetVersion: nonNegativeIntegerSchema }),
  v.strictObject({ status: v.literal("not-dispatched") }),
]);
export const publishContentEntryResultSchema = v.strictObject({
  build: buildDispatchOutcomeSchema,
  entry: adminContentEntrySchema,
  publication: publicationOutcomeSchema,
});

export const unpublicationOutcomeSchema = v.picklist(["unpublished", "replayed"]);
export const unpublishContentEntryResultSchema = v.strictObject({
  build: buildDispatchOutcomeSchema,
  entry: adminContentEntrySchema,
  unpublication: unpublicationOutcomeSchema,
});

export const contentEntryStatusSchema = v.picklist(["changed", "draft", "published"]);
export const contentEntrySystemSortSchema = v.picklist([
  "-publishedAt",
  "-title",
  "-updatedAt",
  "publishedAt",
  "title",
  "updatedAt",
]);
export const contentEntrySortSchema = v.union([
  contentEntrySystemSortSchema,
  v.pipe(v.string(), v.regex(new RegExp(`^-?field:${FIELD_KEY_SOURCE}$`, "u"))),
]);
export { MAX_ENTRY_SEARCH_LENGTH } from "@lacecms/content";

export const listValueSchema = v.union([v.string(), v.pipe(v.number(), v.finite()), v.boolean()]);
export const listValuesSchema = v.record(
  v.pipe(v.string(), v.regex(FIELD_KEY_PATTERN)),
  listValueSchema,
);

function hasConsistentPublicationState<
  Value extends {
    readonly publishedAt?: string | undefined;
    readonly publishedSnapshotId?: string | undefined;
    readonly status: "changed" | "draft" | "published";
  },
>(value: Value): boolean {
  const published = value.publishedAt !== undefined && value.publishedSnapshotId !== undefined;
  const unpublished = value.publishedAt === undefined && value.publishedSnapshotId === undefined;
  return value.status === "draft" ? unpublished : published;
}

export const contentEntrySummarySchema = v.pipe(
  v.strictObject({
    draftRevision: nonNegativeIntegerSchema,
    id: identifierSchema,
    listValues: listValuesSchema,
    modelKey: identifierSchema,
    publishedAt: v.optional(isoTimestampSchema),
    publishedSnapshotId: v.optional(identifierSchema),
    slug: v.optional(identifierSchema),
    status: contentEntryStatusSchema,
    title: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_TITLE_LENGTH)),
    updatedAt: isoTimestampSchema,
    updatedBy: actorSummarySchema,
  }),
  v.check(
    hasConsistentPublicationState,
    "Entry status must agree with its publication snapshot and time.",
  ),
);

export const contentEntryStatusTotalsSchema = v.strictObject({
  all: nonNegativeIntegerSchema,
  changed: nonNegativeIntegerSchema,
  draft: nonNegativeIntegerSchema,
  published: nonNegativeIntegerSchema,
});

export const contentEntryListSchema = v.strictObject({
  ...cursorPageSchema(contentEntrySummarySchema).entries,
  totals: contentEntryStatusTotalsSchema,
});

/** Query parameters accepted by the admin entry list; unknown keys stay ignored. */
export const contentEntryListQuerySchema = v.object({
  filters: v.optional(
    v.pipe(
      v.string(),
      v.description(
        "JSON array, at most 8192 UTF-8 bytes and 16 distinct field conditions. Strict objects carry field and op. All types: isSet/isNotSet with no operands; text/textarea/url: eq or contains with value (1–200 UTF-16 units, literal ASCII-insensitive/non-ASCII-sensitive); boolean: eq with boolean value; number: eq with finite value or range with inclusive optional min/max; select: in with 1–50 distinct configured strings in values (OR); date/datetime: range with inclusive optional from/to (YYYY-MM-DD or explicit-offset ISO instants normalized to UTC). A range needs at least one bound and cannot be inverted. Different fields combine with AND. Missing/null/empty strings are unset; false and zero are present. Only configured draft fields are supported. contains uses ordinary literal LIKE with ESCAPE: Node 200 code units; Cloudflare 48 code units and 50 UTF-8 bytes after escaping percent, underscore and backslash and adding substring wrappers. Text eq uses = COLLATE NOCASE without a pattern budget. Only ASCII case is ignored. Omission or [] means no filters.",
      ),
    ),
  ),
  after: v.optional(
    v.pipe(
      opaqueCursorSchema,
      v.description(
        "Opaque continuation, at most 4096 characters, bound to the canonical query, enabled capabilities, sqlite-like-v1 and runtime limits. Custom string sorts use current-draft/revision anchors: a successful boundary-draft save, deletion or replacement expires the anchor. Invalid or stale continuations return value-free 422 at /after, even for an empty next page. Restart without after while retaining the query.",
      ),
    ),
  ),
  limit: v.optional(pageLimitQuerySchema),
  q: v.optional(
    v.pipe(
      v.string(),
      v.trim(),
      v.maxLength(MAX_ENTRY_SEARCH_LENGTH),
      v.description(
        "Literal title/slug and configured draft-field substring search. ASCII case-insensitive; Cyrillic/non-ASCII case-sensitive. Node/VPS: 200 UTF-16 code units; Cloudflare: 48 code units and 50 UTF-8 bytes in the escaped LIKE pattern including two wrappers. Runtime limits are advertised by admin/content-models. Excess input returns 422 at /q; contains excess at /filters/<index>/value. Never truncated.",
      ),
    ),
  ),
  slug: v.optional(
    v.pipe(
      v.string(),
      v.maxLength(MAX_SLUG_LENGTH),
      v.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*(?![\s\S])/u),
      v.description(
        "Collections only: exact current draft slug (a published slug that differs never matches). Applies to the page and totals, combines with the other parameters and binds continuation cursors. Refused for page and global models.",
      ),
    ),
  ),
  sort: v.optional(contentEntrySortSchema),
  status: v.optional(contentEntryStatusSchema),
});

export type ContentEntryDto = v.InferOutput<typeof contentEntrySchema>;
export type AdminContentEntryDto = v.InferOutput<typeof adminContentEntrySchema>;
export type ActorSummaryDto = v.InferOutput<typeof actorSummarySchema>;
export type ContentEntryStatusDto = v.InferOutput<typeof contentEntryStatusSchema>;
export type ContentEntrySortDto = v.InferOutput<typeof contentEntrySortSchema>;
export type ContentEntryStatusTotalsDto = v.InferOutput<typeof contentEntryStatusTotalsSchema>;
export type ContentEntryListQueryDto = v.InferOutput<typeof contentEntryListQuerySchema>;
export type PublishContentEntryResultDto = v.InferOutput<typeof publishContentEntryResultSchema>;
export type UnpublishContentEntryResultDto = v.InferOutput<
  typeof unpublishContentEntryResultSchema
>;
export type ContentEntryListDto = v.InferOutput<typeof contentEntryListSchema>;
export type ContentEntrySummaryDto = v.InferOutput<typeof contentEntrySummarySchema>;
export type ContentSnapshotDto = v.InferOutput<typeof contentSnapshotSchema>;
