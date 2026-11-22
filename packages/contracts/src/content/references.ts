import { MAX_LINK_RESOLVE_IDS, MAX_TITLE_LENGTH } from "@lacecms/content";
import * as v from "valibot";
import { identifierSchema, opaqueCursorSchema } from "../shared/primitives.js";
import {
  linkImpactQuerySchema,
  linkTargetIdSchema,
  linkUsageLocationSchema,
  linkUsageSourceSchema,
  resolveLinkTargetsRequestSchema,
} from "./links.js";

export const referenceTargetQuerySchema = v.strictObject({
  modelKey: linkTargetIdSchema,
  search: v.optional(v.pipe(v.string(), v.maxLength(100), v.trim())),
  after: v.optional(opaqueCursorSchema),
  limit: v.optional(
    v.pipe(v.string(), v.regex(/^(?:[1-9]|[1-4][0-9]|50)$/u), v.transform(Number), v.maxValue(50)),
    "20",
  ),
});
export const resolveReferenceTargetsRequestSchema = resolveLinkTargetsRequestSchema;

const targetEntries = {
  id: linkTargetIdSchema,
  modelKey: identifierSchema,
  modelKind: v.picklist(["page", "collection"]),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(MAX_TITLE_LENGTH)),
};
const referenceTargetSchema = v.variant("state", [
  v.strictObject({
    ...targetEntries,
    state: v.literal("published"),
    path: v.optional(v.string()),
  }),
  v.strictObject({ ...targetEntries, state: v.literal("unpublished") }),
]);
export const referenceTargetStatusSchema = v.union([
  referenceTargetSchema,
  v.strictObject({ id: linkTargetIdSchema, state: v.picklist(["missing", "ineligible"]) }),
]);
export const referenceTargetPageSchema = v.strictObject({
  items: v.pipe(v.array(referenceTargetSchema), v.maxLength(50)),
  nextCursor: v.optional(opaqueCursorSchema),
});
type ReferenceTargetStatusDto = v.InferOutput<typeof referenceTargetStatusSchema>;

// Preserve opaque IDs such as "__proto__", which Valibot's record parser drops.
export const referenceTargetStatusesSchema = v.custom<Record<string, ReferenceTargetStatusDto>>(
  (input) => {
    if (input === null || typeof input !== "object" || Array.isArray(input)) return false;
    const entries = Object.entries(input);
    return (
      entries.length <= MAX_LINK_RESOLVE_IDS &&
      entries.every(([id, item]) => {
        const parsed = v.safeParse(referenceTargetStatusSchema, item);
        return parsed.success && parsed.output.id === id;
      })
    );
  },
);
export type ReferenceTargetPageDto = v.InferOutput<typeof referenceTargetPageSchema>;
export type ReferenceTargetStatusesDto = v.InferOutput<typeof referenceTargetStatusesSchema>;

export const referenceImpactQuerySchema = linkImpactQuerySchema;
const referenceImpactEntries = {
  hasPublishedBlockers: v.boolean(),
  hasDraftUsages: v.boolean(),
  receipt: v.optional(opaqueCursorSchema),
  nextCursor: v.optional(opaqueCursorSchema),
};
export const referenceImpactPageSchema = v.variant("mode", [
  v.strictObject({
    ...referenceImpactEntries,
    mode: v.literal("sources"),
    sources: v.pipe(v.array(linkUsageSourceSchema), v.maxLength(50)),
  }),
  v.strictObject({
    ...referenceImpactEntries,
    mode: v.literal("locations"),
    sourceEntryId: linkTargetIdSchema,
    snapshotId: linkTargetIdSchema,
    locations: v.pipe(v.array(linkUsageLocationSchema), v.maxLength(50)),
  }),
]);
export type ReferenceImpactPageDto = v.InferOutput<typeof referenceImpactPageSchema>;

export const referenceImpactAcknowledgmentSchema = v.strictObject({
  receipt: opaqueCursorSchema,
  acknowledgeDraftReferences: v.literal(true),
});
export type ReferenceImpactAcknowledgmentDto = v.InferOutput<
  typeof referenceImpactAcknowledgmentSchema
>;
