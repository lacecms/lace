import { MAX_MEDIA_SEARCH_LENGTH } from "@lacecms/content";
import {
  MAX_MEDIA_TAG_FILTERS,
  MAX_MEDIA_TAG_INPUT_LENGTH,
  MAX_MEDIA_TAG_LENGTH,
  MAX_MEDIA_TAGS_PER_ITEM,
  MEDIA_TAG_PATTERN,
  normalizeMediaTag,
  normalizeMediaTags,
} from "@lacecms/domain";
import * as v from "valibot";
import {
  cursorPageSchema,
  opaqueCursorSchema,
  pageLimitQuerySchema,
  positiveIntegerSchema,
  mediaSha256Schema,
} from "../shared/primitives.js";

export const mediaMimeTypeSchema = v.picklist([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);
export const mediaSortSchema = v.picklist([
  "-createdAt",
  "-filename",
  "-size",
  "createdAt",
  "filename",
  "size",
]);
/** Descriptive text limits in code points, shared with clients that bound their inputs. */
export { MAX_MEDIA_ALT_LENGTH, MAX_MEDIA_CAPTION_LENGTH } from "@lacecms/domain";
/** The server's tag normalization, so clients show the stored form before saving. */
export { normalizeMediaTag } from "@lacecms/domain";
export { effectiveAltText } from "@lacecms/content";
export { MAX_MEDIA_SEARCH_LENGTH } from "@lacecms/content";
export { MAX_MEDIA_USAGE_ENTRIES } from "@lacecms/content";

/** Input tags normalize once; element validation preserves JSON Pointer positions. */
export const mediaTagInputSchema = v.pipe(
  v.string(),
  v.description(
    `A tag of 1–${MAX_MEDIA_TAG_LENGTH} ASCII letters, digits or hyphens after trimming surrounding spaces and lowercasing; at most ${MAX_MEDIA_TAG_INPUT_LENGTH} code points before normalization. Control characters and internal spaces are invalid.`,
  ),
  v.check(
    (value) =>
      [...value].length <= MAX_MEDIA_TAG_INPUT_LENGTH && normalizeMediaTag(value) !== undefined,
    `Use 1–${MAX_MEDIA_TAG_LENGTH} ASCII letters, digits or hyphens.`,
  ),
  v.transform((value) => normalizeMediaTag(value)!),
);
export const mediaTagsInputSchema = v.pipe(
  v.array(mediaTagInputSchema),
  v.rawCheck(({ dataset, addIssue }) => {
    if (!dataset.typed) return;
    const result = normalizeMediaTags(dataset.value);
    if ("issue" in result)
      addIssue({
        message: `Supply at most ${MAX_MEDIA_TAGS_PER_ITEM} distinct tags.`,
        path: [
          {
            type: "array",
            origin: "value",
            input: dataset.value,
            key: result.issue,
            value: dataset.value[result.issue],
          },
        ],
      });
  }),
  v.transform((values) => (normalizeMediaTags(values) as { tags: readonly string[] }).tags.slice()),
);
const mediaFilterTagsSchema = v.pipe(
  v.union([v.string(), v.array(v.string())]),
  v.transform((value) => (typeof value === "string" ? [value] : value)),
  v.pipe(v.array(mediaTagInputSchema), v.maxLength(MAX_MEDIA_TAG_FILTERS)),
  v.transform((tags) => [...new Set(tags)].sort()),
);
export const mediaTagCatalogQuerySchema = v.object({
  after: v.optional(opaqueCursorSchema),
  limit: v.optional(pageLimitQuerySchema),
  q: v.optional(mediaTagInputSchema),
});
export const mediaTagCatalogSchema = cursorPageSchema(
  v.strictObject({
    tag: v.pipe(v.string(), v.regex(MEDIA_TAG_PATTERN)),
    count: positiveIntegerSchema,
  }),
);
export type MediaTagCatalogDto = v.InferOutput<typeof mediaTagCatalogSchema>;

/** Query parameters accepted by the admin media list; unknown keys stay ignored. */
export const mediaListQuerySchema = v.object({
  tag: v.optional(mediaFilterTagsSchema),
  sha256: v.optional(
    v.pipe(
      mediaSha256Schema,
      v.description(
        "Exact SHA-256 of the stored bytes (64 lowercase hex). Restricts the page to active items; media uploaded before migration 0015 never match. Binds continuation cursors.",
      ),
    ),
  ),
  after: v.optional(opaqueCursorSchema),
  limit: v.optional(pageLimitQuerySchema),
  q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(MAX_MEDIA_SEARCH_LENGTH))),
  sort: v.optional(mediaSortSchema),
  type: v.optional(mediaMimeTypeSchema),
});

/** `detach=drafts` removes the item from using drafts before deletion is requested. */
export const mediaDeleteQuerySchema = v.object({
  detach: v.optional(v.picklist(["drafts"])),
});

export type MediaSortDto = v.InferOutput<typeof mediaSortSchema>;
export type MediaMimeTypeDto = v.InferOutput<typeof mediaMimeTypeSchema>;
export type MediaListQueryDto = v.InferOutput<typeof mediaListQuerySchema>;
