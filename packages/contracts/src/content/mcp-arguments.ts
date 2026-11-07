import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "@lacecms/content";
import * as v from "valibot";
import {
  identifierSchema,
  expectedRevisionSchema,
  idempotencyKeySchema,
} from "../shared/primitives.js";
import { collectionFieldFiltersSchema } from "./collection-queries.js";
import { contentEntryListQuerySchema } from "./entries.js";
import { createContentEntryRequestSchema, saveDraftRequestSchema } from "./entry-requests.js";

/** MCP envelopes compose canonical body/query contracts; no actor fields. */
export const mcpToolArgumentSchemas = Object.freeze({
  list_content_models: v.strictObject({}),
  list_entries: v.strictObject({
    ...contentEntryListQuerySchema.entries,
    modelKey: identifierSchema,
    filters: v.optional(collectionFieldFiltersSchema),
    limit: v.optional(
      v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(MAX_PAGE_SIZE)),
      DEFAULT_PAGE_SIZE,
    ),
  }),
  get_entry: v.strictObject({ entryId: identifierSchema }),
  publish_entry: v.strictObject({
    entryId: identifierSchema,
    expectedRevision: expectedRevisionSchema,
    idempotencyKey: v.optional(idempotencyKeySchema),
  }),
  create_entry: v.strictObject({
    ...createContentEntryRequestSchema.entries,
    modelKey: identifierSchema,
  }),
  save_draft: v.strictObject({
    ...saveDraftRequestSchema.entries,
    entryId: identifierSchema,
    expectedRevision: expectedRevisionSchema,
  }),
});

/** Filter structure and metadata-dependent issues are enforced by the shared
 * application query policy, preserving the same first error paths as REST.
 * Discovery still advertises the typed filter schema above. */
export const mcpListEntriesEnvelopeSchema = v.strictObject({
  ...mcpToolArgumentSchemas.list_entries.entries,
  filters: v.optional(v.unknown()),
});
