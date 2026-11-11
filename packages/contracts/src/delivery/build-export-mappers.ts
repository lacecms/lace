import * as v from "valibot";
import type { OpaqueCursorDto } from "../shared/primitives.js";
import { BUILD_EXPORT_FORMAT_VERSION, exportSeoSchema } from "./build-export.js";
import type {
  BuildExportDto,
  BuildExportFirstPageDto,
  BuildExportContinuationPageDto,
} from "./build-export.js";
import {
  publicEntryOptions,
  toPublicEntryDto,
  toPublicGlobalDto,
  toPublicMediaDictionary,
  toPublicRecordDto,
} from "./public-mappers.js";
import type {
  PublicEntrySource,
  PublicGlobalSource,
  PublicMediaUrl,
  PublicRecordSource,
} from "./public-mappers.js";

export interface BuildExportSource {
  readonly entries: readonly PublicEntrySource[];
  readonly globals?: readonly PublicGlobalSource[];
  readonly records: readonly PublicRecordSource[];
  readonly version: number;
}

/** One page read from the build-export port. */
export interface BuildExportPageSource extends BuildExportSource {
  readonly nextCursor?: string;
}

/** The export's SEO configuration section. */
export type ExportSeoDto = v.InferOutput<typeof exportSeoSchema>;

function exportSeoDto(seo: ExportSeoDto): ExportSeoDto {
  return {
    defaults: seo.defaults === null ? null : { ...seo.defaults },
    models: Object.fromEntries(
      Object.keys(seo.models)
        .sort()
        .map((key) => [key, { ...seo.models[key]! }]),
    ),
  };
}

function exportPageEntries(
  value: BuildExportPageSource,
  urlFor: PublicMediaUrl,
  seoModels: ReadonlySet<string>,
): BuildExportContinuationPageDto {
  const globals = value.globals ?? [];
  return {
    entries: value.entries.map(({ entry, path, internalLinks = [] }) =>
      toPublicEntryDto(entry, path, { ...publicEntryOptions(entry, { seoModels }), internalLinks }),
    ),
    formatVersion: BUILD_EXPORT_FORMAT_VERSION,
    media: toPublicMediaDictionary(
      [
        ...value.entries.flatMap((item) => item.media),
        ...value.records.flatMap((item) => item.media),
        ...globals.flatMap((item) => item.media),
      ],
      urlFor,
    ),
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor as OpaqueCursorDto }),
    records: value.records.map(({ entry, internalLinks }) =>
      toPublicRecordDto(entry, internalLinks),
    ),
    version: value.version,
  };
}

/** Converts the first build-export page; it alone carries globals and the SEO section. */
export function toBuildExportFirstPageDto(
  value: BuildExportPageSource,
  urlFor: PublicMediaUrl,
  seo: ExportSeoDto = { defaults: null, models: {} },
): BuildExportFirstPageDto {
  return {
    ...exportPageEntries(value, urlFor, new Set(Object.keys(seo.models))),
    globals: (value.globals ?? []).map(({ entry, internalLinks }) =>
      toPublicGlobalDto(entry, internalLinks),
    ),
    seo: exportSeoDto(seo),
  };
}

/** Converts a build-export continuation page; it never carries globals or SEO. */
export function toBuildExportContinuationPageDto(
  value: BuildExportPageSource,
  urlFor: PublicMediaUrl,
  seo: ExportSeoDto = { defaults: null, models: {} },
): BuildExportContinuationPageDto {
  if (value.globals !== undefined)
    throw new TypeError("A build-export continuation page never carries globals.");
  return exportPageEntries(value, urlFor, new Set(Object.keys(seo.models)));
}

/** Converts a complete content source to the assembled export consumers and tests compare. */
export function toBuildExportDto(
  value: BuildExportSource,
  urlFor: PublicMediaUrl,
  seo: ExportSeoDto = { defaults: null, models: {} },
): BuildExportDto {
  const { nextCursor: _nextCursor, ...page } = toBuildExportFirstPageDto(
    {
      entries: value.entries,
      globals: value.globals ?? [],
      records: value.records,
      version: value.version,
    },
    urlFor,
    seo,
  );
  return page;
}
