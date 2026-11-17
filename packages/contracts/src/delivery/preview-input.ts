import * as v from "valibot";
import { previewGenerationIdSchema, previewLogicalPathSchema } from "../preview/commands.js";
import { identifierSchema, isoTimestampSchema } from "../shared/primitives.js";
import { buildExportSchema, exportEntrySchema } from "./build-export.js";
import { publicMediaSchema } from "./public.js";

const media = v.omit(publicMediaSchema, ["url"]);
const mediaDictionary = v.pipe(
  v.record(identifierSchema, media),
  v.check((items) => Object.entries(items).every(([id, item]) => id === item.id)),
);

/** The runner's detached rendering input. Use the scoped claim to fetch original media by ID. */
export const frozenPreviewInputSchema = v.strictObject({
  schemaVersion: v.literal(1),
  generationId: previewGenerationIdSchema,
  capturedAt: isoTimestampSchema,
  revision: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  siteUrl: v.pipe(v.string(), v.maxLength(2048)),
  target: v.strictObject({
    ...v.omit(exportEntrySchema, ["publishedAt"]).entries,
    path: previewLogicalPathSchema,
  }),
  targetMedia: mediaDictionary,
  context: v.strictObject({ ...buildExportSchema.entries, media: mediaDictionary }),
});

export type FrozenPreviewInput = v.InferOutput<typeof frozenPreviewInputSchema>;
