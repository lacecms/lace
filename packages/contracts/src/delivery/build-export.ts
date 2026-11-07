import { MAX_BUILD_EXPORT_PAGE_SIZE } from "@lacecms/content";
import * as v from "valibot";
import {
  identifierSchema,
  nonNegativeIntegerSchema,
  opaqueCursorSchema,
} from "../shared/primitives.js";
import { internalLinkManifestSchema } from "../content/links.js";
import { modelSeoSchema, seoDefaultsSchema } from "../content/models.js";
import { publicEntrySchema, publicGlobalSchema, publicMediaDictionarySchema } from "./public.js";

/**
 * SEO configuration a site resolver needs: the fallback fields of every
 * SEO-enabled model and the global that maps site defaults.
 */
export const exportSeoSchema = v.strictObject({
  defaults: v.nullable(
    v.strictObject({
      ...seoDefaultsSchema.entries,
      modelKey: identifierSchema,
    }),
  ),
  models: v.record(identifierSchema, modelSeoSchema),
});

/** The structure version of the build export; see the public contract evolution policy. */
export const BUILD_EXPORT_FORMAT_VERSION = 2;
export const buildExportFormatVersionSchema = v.literal(BUILD_EXPORT_FORMAT_VERSION);

export const exportEntrySchema = v.strictObject({
  ...publicEntrySchema.entries,
  internalLinks: internalLinkManifestSchema,
});
export const exportGlobalSchema = v.strictObject({
  ...publicGlobalSchema.entries,
  internalLinks: internalLinkManifestSchema,
});

/**
 * The assembled build export: the union of the pages of one page sequence, as
 * returned by the SDK and compared by tests. The API never sends it whole.
 */
export const buildExportSchema = v.strictObject({
  entries: v.array(exportEntrySchema),
  /** Strict output accepts only the current format; tolerant consumers accept any. */
  formatVersion: buildExportFormatVersionSchema,
  /** Always sent by the API; exports produced before globals existed omit it. */
  globals: v.optional(v.array(exportGlobalSchema), []),
  media: publicMediaDictionarySchema,
  /** Always sent by the API; exports produced before SEO existed omit it. */
  seo: v.optional(exportSeoSchema, { defaults: null, models: {} }),
  version: nonNegativeIntegerSchema,
});

/** Entries one build-export page holds at most, and the default page size. */
export { MAX_BUILD_EXPORT_PAGE_SIZE } from "@lacecms/content";

/** Query parameters of the build-export endpoint; unknown keys are rejected. */
export const buildExportQuerySchema = v.strictObject({
  after: v.optional(opaqueCursorSchema),
  limit: v.optional(
    v.pipe(
      v.string(),
      v.regex(/^[1-9][0-9]{0,2}$/u),
      v.transform(Number),
      v.maxValue(MAX_BUILD_EXPORT_PAGE_SIZE),
    ),
  ),
});

const buildExportPageEntries = {
  /** Routed entries ordered by path, continuing strictly after the cursor's path. */
  entries: v.array(exportEntrySchema),
  formatVersion: buildExportFormatVersionSchema,
  /** Exactly the media delivered by this page's entries (and globals on the first page). */
  media: publicMediaDictionarySchema,
  /** Present exactly when further entries remain. */
  nextCursor: v.optional(opaqueCursorSchema),
  version: nonNegativeIntegerSchema,
};

/** The first build-export page (no `after`): it alone carries `globals` and `seo`. */
export const buildExportFirstPageSchema = v.strictObject({
  ...buildExportPageEntries,
  globals: v.array(exportGlobalSchema),
  seo: exportSeoSchema,
});

/** A build-export continuation page (`after` present): never `globals` or `seo`. */
export const buildExportContinuationPageSchema = v.strictObject(buildExportPageEntries);

export type BuildExportDto = v.InferOutput<typeof buildExportSchema>;
export type BuildExportFirstPageDto = v.InferOutput<typeof buildExportFirstPageSchema>;
export type BuildExportContinuationPageDto = v.InferOutput<
  typeof buildExportContinuationPageSchema
>;
export type BuildExportPageDto = BuildExportFirstPageDto | BuildExportContinuationPageDto;
export type BuildExportQueryDto = v.InferOutput<typeof buildExportQuerySchema>;
