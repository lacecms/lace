import { MAX_MEDIA_USAGE_ENTRIES } from "@lacecms/content";
import { isMediaFocalCoordinate, normalizeMediaText } from "@lacecms/domain";
import * as v from "valibot";
import {
  cursorPageSchema,
  identifierSchema,
  nonNegativeIntegerSchema,
  positiveIntegerSchema,
  isoTimestampSchema,
  mediaSha256Schema,
} from "../shared/primitives.js";
import {
  actorSummarySchema,
  buildDispatchOutcomeSchema,
  contentEntryStatusSchema,
} from "../content/entries.js";
import { mediaTagsInputSchema } from "./queries.js";

const mediaAltSchema = v.pipe(
  v.string(),
  v.check(
    (value) => normalizeMediaText(value, "alt") !== undefined,
    "Alt text must be single-line plain text of at most 1,000 characters.",
  ),
);
const mediaCaptionSchema = v.pipe(
  v.string(),
  v.check(
    (value) => normalizeMediaText(value, "caption") !== undefined,
    "A caption must be plain text of at most 2,000 characters.",
  ),
);
const mediaFocalCoordinateSchema = v.pipe(
  v.number(),
  v.check(
    (value: number) => isMediaFocalCoordinate(value),
    "A focal coordinate must be a number from 0 to 1.",
  ),
);
/** `{0, 0}` is the top-left corner of the displayed image. */
export const mediaFocalPointSchema = v.strictObject({
  x: mediaFocalCoordinateSchema,
  y: mediaFocalCoordinateSchema,
});

export const mediaMetadataSchema = v.strictObject({
  tags: v.pipe(
    v.array(v.pipe(v.string(), v.regex(/^[a-z0-9-]{1,40}(?![\s\S])/u))),
    v.maxLength(20),
    v.check(
      (tags) => tags.every((tag, i) => i === 0 || tags[i - 1]! < tag),
      "Tags must be unique and sorted.",
    ),
  ),
  alt: v.optional(v.pipe(v.string(), v.minLength(1))),
  caption: v.optional(v.pipe(v.string(), v.minLength(1))),
  createdAt: isoTimestampSchema,
  createdBy: actorSummarySchema,
  filename: v.string(),
  focalPoint: v.optional(mediaFocalPointSchema),
  height: v.optional(positiveIntegerSchema),
  id: identifierSchema,
  mimeType: v.string(),
  /** Admin-only SHA-256 of the stored bytes; absent for media uploaded before migration 0015. */
  sha256: v.optional(mediaSha256Schema),
  size: nonNegativeIntegerSchema,
  status: v.picklist(["active", "delete_failed", "deleting"]),
  updatedAt: isoTimestampSchema,
  url: v.string(),
  usageCount: nonNegativeIntegerSchema,
  width: v.optional(positiveIntegerSchema),
});
export const mediaListSchema = cursorPageSchema(mediaMetadataSchema);

const mediaUsageStatesSchema = v.pipe(
  v.array(v.picklist(["draft", "published"])),
  v.minLength(1),
  v.maxLength(2),
  v.check((states) => new Set(states).size === states.length, "Usage states must be unique."),
);
export const mediaUsageLocationSchema = v.variant("source", [
  v.strictObject({
    field: identifierSchema,
    source: v.literal("field"),
    states: mediaUsageStatesSchema,
  }),
  v.strictObject({
    field: v.literal("image"),
    source: v.literal("seo"),
    states: mediaUsageStatesSchema,
  }),
  v.strictObject({
    blockKey: identifierSchema,
    blockType: identifierSchema,
    field: identifierSchema,
    source: v.literal("block"),
    states: mediaUsageStatesSchema,
  }),
]);
export const mediaUsageEntrySchema = v.strictObject({
  entryId: identifierSchema,
  locations: v.pipe(v.array(mediaUsageLocationSchema), v.minLength(1)),
  modelKey: identifierSchema,
  slug: v.optional(identifierSchema),
  status: contentEntryStatusSchema,
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
});
/** Admin media details: metadata plus the bounded entries that use the item. */
export const mediaDetailSchema = v.strictObject({
  ...mediaMetadataSchema.entries,
  usage: v.pipe(v.array(mediaUsageEntrySchema), v.maxLength(MAX_MEDIA_USAGE_ENTRIES)),
});

/**
 * Descriptive metadata patch: an omitted key stays unchanged and `null` clears
 * it. Text is trimmed by the use case; empty text also clears.
 */
export const updateMediaMetadataRequestSchema = v.pipe(
  v.strictObject({
    tags: v.optional(mediaTagsInputSchema),
    alt: v.optional(v.nullable(mediaAltSchema)),
    caption: v.optional(v.nullable(mediaCaptionSchema)),
    focalPoint: v.optional(v.nullable(mediaFocalPointSchema)),
  }),
  v.check(
    (value) => Object.keys(value).length > 0,
    "Supply at least one of alt, caption, focalPoint, or tags.",
  ),
);
export const updateMediaMetadataResultSchema = v.strictObject({
  build: buildDispatchOutcomeSchema,
  media: mediaMetadataSchema,
});

export type MediaMetadataDto = v.InferOutput<typeof mediaMetadataSchema>;
export type MediaListDto = v.InferOutput<typeof mediaListSchema>;
export type MediaDetailDto = v.InferOutput<typeof mediaDetailSchema>;
export type MediaFocalPointDto = v.InferOutput<typeof mediaFocalPointSchema>;
export type UpdateMediaMetadataRequestDto = v.InferOutput<typeof updateMediaMetadataRequestSchema>;
export type UpdateMediaMetadataResultDto = v.InferOutput<typeof updateMediaMetadataResultSchema>;
export type MediaUsageEntryDto = v.InferOutput<typeof mediaUsageEntrySchema>;
export type MediaUsageLocationDto = v.InferOutput<typeof mediaUsageLocationSchema>;
