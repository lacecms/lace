import * as v from "valibot";
import { jsonObjectSchema } from "../shared/json.js";
import {
  identifierSchema,
  isoTimestampSchema,
  positiveIntegerSchema,
  opaqueCursorSchema,
} from "../shared/primitives.js";
import { internalLinkManifestSchema } from "../content/links.js";
import { publicBlockSchema } from "../content/blocks.js";
import { seoValueSchema } from "../content/seo.js";
import { mediaFocalPointSchema } from "../media/metadata.js";

const optionalInternalLinksSchema = v.optional(internalLinkManifestSchema, () => []);

/** One published entry as public consumers see it; no draft or editorial data. */
export const publicEntrySchema = v.strictObject({
  internalLinks: optionalInternalLinksSchema,
  blocks: v.array(publicBlockSchema),
  fields: jsonObjectSchema,
  id: identifierSchema,
  modelKey: identifierSchema,
  path: v.string(),
  publishedAt: isoTimestampSchema,
  /** Stored SEO values of an entry of an SEO-enabled model; absent otherwise. */
  seo: v.optional(seoValueSchema),
  slug: v.optional(identifierSchema),
  title: v.pipe(v.string(), v.minLength(1), v.maxLength(200)),
});

/** A media item referenced by public entries, resolved for rendering. */
export const publicMediaSchema = v.strictObject({
  alt: v.nullable(v.pipe(v.string(), v.minLength(1))),
  caption: v.nullable(v.pipe(v.string(), v.minLength(1))),
  focalPoint: v.nullable(mediaFocalPointSchema),
  height: v.nullable(positiveIntegerSchema),
  id: identifierSchema,
  mimeType: v.string(),
  url: v.string(),
  width: v.nullable(positiveIntegerSchema),
});

/** Resolved media keyed by media ID; each item's `id` equals its key. */
export const publicMediaDictionarySchema = v.pipe(
  v.record(identifierSchema, publicMediaSchema),
  v.check(
    (media) => Object.entries(media).every(([id, item]) => item.id === id),
    "Each media item must be keyed by its own ID.",
  ),
);

/** One published route-less global; no path, slug, title, draft, or editorial data. */
export const publicGlobalSchema = v.strictObject({
  internalLinks: optionalInternalLinksSchema,
  blocks: v.array(publicBlockSchema),
  fields: jsonObjectSchema,
  id: identifierSchema,
  modelKey: identifierSchema,
  publishedAt: isoTimestampSchema,
});

export const publicGlobalContentSchema = v.strictObject({
  global: publicGlobalSchema,
  media: publicMediaDictionarySchema,
});

export const publicContentEntrySchema = v.strictObject({
  entry: publicEntrySchema,
  media: publicMediaDictionarySchema,
});
export const publicContentListSchema = v.strictObject({
  items: v.array(publicEntrySchema),
  media: publicMediaDictionarySchema,
  nextCursor: v.optional(opaqueCursorSchema),
});
export type PublicEntryDto = v.InferOutput<typeof publicEntrySchema>;
export type PublicMediaDto = v.InferOutput<typeof publicMediaSchema>;
export type PublicMediaDictionaryDto = v.InferOutput<typeof publicMediaDictionarySchema>;
export type PublicContentEntryDto = v.InferOutput<typeof publicContentEntrySchema>;
export type PublicGlobalDto = v.InferOutput<typeof publicGlobalSchema>;
export type PublicGlobalContentDto = v.InferOutput<typeof publicGlobalContentSchema>;
export type PublicContentListDto = v.InferOutput<typeof publicContentListSchema>;
