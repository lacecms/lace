import { isInternalLinkTargetId, MAX_LINK_RESOLVE_IDS, MAX_TITLE_LENGTH } from "@lacecms/content";
import * as v from "valibot";
import { identifierSchema, opaqueCursorSchema, jsonPointerSchema } from "../shared/primitives.js";

/** Opaque CMS identity, including encoded punctuation and Unicode in entry tokens. */
export const linkTargetIdSchema = v.pipe(
  identifierSchema,
  v.check((value: string) => isInternalLinkTargetId(value)),
);
export const linkImpactActionSchema = v.picklist(["delete", "unpublish"]);
export const linkImpactAcknowledgmentSchema = v.strictObject({
  receipt: opaqueCursorSchema,
  acknowledgePublishedLinks: v.literal(true),
});
const linkPageLimitSchema = v.optional(
  v.pipe(v.string(), v.regex(/^(?:[1-9]|[1-4][0-9]|50)$/u), v.transform(Number), v.maxValue(50)),
  "20",
);
export const linkTargetQuerySchema = v.strictObject({
  modelKey: v.optional(identifierSchema),
  status: v.optional(v.picklist(["published", "unpublished"])),
  search: v.optional(v.pipe(v.string(), v.maxLength(100), v.trim())),
  after: v.optional(opaqueCursorSchema),
  limit: linkPageLimitSchema,
});
export const resolveLinkTargetsRequestSchema = v.strictObject({
  ids: v.pipe(
    v.array(linkTargetIdSchema),
    v.maxLength(MAX_LINK_RESOLVE_IDS),
    v.check((ids) => new Set(ids).size === ids.length, "IDs must be distinct."),
  ),
});
export const linkImpactQuerySchema = v.pipe(
  v.strictObject({
    action: linkImpactActionSchema,
    after: v.optional(opaqueCursorSchema),
    limit: linkPageLimitSchema,
    sourceEntryId: v.optional(linkTargetIdSchema),
    snapshotId: v.optional(linkTargetIdSchema),
    locationsAfter: v.optional(opaqueCursorSchema),
  }),
  v.check((value) => {
    const locations =
      value.sourceEntryId !== undefined ||
      value.snapshotId !== undefined ||
      value.locationsAfter !== undefined;
    return (
      !locations ||
      (value.sourceEntryId !== undefined &&
        value.snapshotId !== undefined &&
        value.after === undefined)
    );
  }, "Use either source pagination or a complete source/snapshot location query."),
);
const routableTargetEntries = {
  id: linkTargetIdSchema,
  modelKey: identifierSchema,
  modelKind: v.picklist(["page", "collection"]),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_TITLE_LENGTH)),
};
export const routableLinkTargetSchema = v.variant("state", [
  v.strictObject({ ...routableTargetEntries, state: v.literal("published"), path: v.string() }),
  v.strictObject({ ...routableTargetEntries, state: v.literal("unpublished") }),
]);
export const linkTargetStatusSchema = v.union([
  routableLinkTargetSchema,
  v.strictObject({ id: linkTargetIdSchema, state: v.literal("missing") }),
  v.strictObject({
    id: linkTargetIdSchema,
    modelKey: identifierSchema,
    state: v.literal("non-routable"),
  }),
]);
export const linkTargetPageSchema = v.strictObject({
  items: v.pipe(v.array(routableLinkTargetSchema), v.maxLength(50)),
  nextCursor: v.optional(opaqueCursorSchema),
});
export const linkTargetStatusesSchema = v.pipe(
  v.record(linkTargetIdSchema, linkTargetStatusSchema),
  v.check(
    (items) =>
      Object.keys(items).length <= 200 &&
      Object.entries(items).every(([id, item]) => id === item.id),
  ),
);
export const linkUsageLocationSchema = v.strictObject({
  sourceKey: identifierSchema,
  area: v.picklist(["fields", "data"]),
  pointer: v.pipe(jsonPointerSchema, v.minLength(1)),
  delivered: v.boolean(),
});
export const linkUsageSourceSchema = v.strictObject({
  entryId: linkTargetIdSchema,
  snapshotId: linkTargetIdSchema,
  modelKey: identifierSchema,
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_TITLE_LENGTH)),
  phase: v.picklist(["draft", "published"]),
  locations: v.pipe(v.array(linkUsageLocationSchema), v.maxLength(10)),
  nextLocationsCursor: v.optional(opaqueCursorSchema),
});
const linkImpactEntries = {
  hasPublishedUsages: v.boolean(),
  receipt: opaqueCursorSchema,
  nextCursor: v.optional(opaqueCursorSchema),
};
export const linkImpactPageSchema = v.variant("mode", [
  v.strictObject({
    ...linkImpactEntries,
    mode: v.literal("sources"),
    sources: v.pipe(v.array(linkUsageSourceSchema), v.maxLength(50)),
  }),
  v.strictObject({
    ...linkImpactEntries,
    mode: v.literal("locations"),
    sourceEntryId: linkTargetIdSchema,
    snapshotId: linkTargetIdSchema,
    locations: v.pipe(v.array(linkUsageLocationSchema), v.maxLength(50)),
  }),
]);
export type LinkTargetStatusDto = v.InferOutput<typeof linkTargetStatusSchema>;
export type LinkTargetPageDto = v.InferOutput<typeof linkTargetPageSchema>;
export type LinkTargetStatusesDto = v.InferOutput<typeof linkTargetStatusesSchema>;
export type LinkImpactPageDto = v.InferOutput<typeof linkImpactPageSchema>;
export type LinkImpactAcknowledgmentDto = v.InferOutput<typeof linkImpactAcknowledgmentSchema>;
export type LinkUsageLocationDto = v.InferOutput<typeof linkUsageLocationSchema>;
export type LinkUsageSourceDto = v.InferOutput<typeof linkUsageSourceSchema>;

export const internalLinkManifestLocationSchema = v.pipe(
  v.strictObject({
    sourceKey: identifierSchema,
    area: v.picklist(["fields", "data"]),
    pointer: v.pipe(jsonPointerSchema, v.minLength(1)),
    targetId: linkTargetIdSchema,
  }),
  v.check((value) => (value.area === "fields") === (value.sourceKey === "$fields")),
);
export const internalLinkManifestSchema = v.pipe(
  v.array(internalLinkManifestLocationSchema),
  v.maxLength(200),
  v.check(
    (items) =>
      new Set(items.map((item) => JSON.stringify([item.sourceKey, item.area, item.pointer])))
        .size === items.length,
    "Each source location must occur once.",
  ),
);
export type InternalLinkManifestDto = v.InferOutput<typeof internalLinkManifestSchema>;
