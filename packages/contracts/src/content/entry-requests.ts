import * as v from "valibot";
import { jsonObjectSchema } from "../shared/json.js";
import { identifierSchema, expectedRevisionSchema } from "../shared/primitives.js";
import { contentBlockSchema } from "./blocks.js";
import { seoInputSchema } from "./seo.js";
import { linkImpactAcknowledgmentSchema } from "./links.js";

const editableDraftFields = {
  blocks: v.array(contentBlockSchema),
  fields: jsonObjectSchema,
  /** Absent or `null` stores no SEO values; refused for a model without SEO. */
  seo: v.optional(v.nullable(seoInputSchema)),
  slug: v.optional(identifierSchema),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
};

export const createContentEntryRequestSchema = v.strictObject(editableDraftFields);
export const saveDraftRequestSchema = v.strictObject({
  ...editableDraftFields,
  expectedRevision: v.optional(expectedRevisionSchema),
});
export const publishContentEntryRequestSchema = v.strictObject({
  expectedRevision: v.optional(expectedRevisionSchema),
});
export const deleteContentEntryRequestSchema = v.strictObject({
  expectedRevision: v.optional(expectedRevisionSchema),
  linkImpact: v.optional(linkImpactAcknowledgmentSchema),
});
export const unpublishContentEntryRequestSchema = v.strictObject({
  expectedPublishedSnapshotId: identifierSchema,
  linkImpact: v.optional(linkImpactAcknowledgmentSchema),
});
export const revertContentEntryRequestSchema = v.strictObject({
  expectedRevision: v.optional(expectedRevisionSchema),
});
export const duplicateContentEntryRequestSchema = v.strictObject({
  expectedRevision: v.optional(expectedRevisionSchema),
});
