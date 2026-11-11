import type { OpaqueCursorDto } from "../shared/primitives.js";
import type { PublicInternalLinkReference } from "@lacecms/content";
import type { ContentEntry, MediaFocalPoint } from "@lacecms/domain";
import { toIsoTimestamp } from "../shared/primitives.js";
import { publicBlocks } from "../content/blocks.js";
import { toSeoDto } from "../content/seo.js";
import type { SeoMappingOptions } from "../content/seo.js";
import type {
  PublicEntryDto,
  PublicMediaDto,
  PublicMediaDictionaryDto,
  PublicContentEntryDto,
  PublicGlobalDto,
  PublicGlobalContentDto,
  PublicContentListDto,
  PublicRecordDto,
  PublicRecordListDto,
} from "./public.js";

/** A published entry with the media its published snapshot references. */
export interface PublicEntrySource {
  readonly internalLinks: readonly PublicInternalLinkReference[];
  readonly entry: ContentEntry;
  readonly media: readonly PublicMediaSource[];
  readonly path: string;
}

/** The media values a public response may disclose. */
export interface PublicMediaSource {
  readonly alt?: string;
  readonly caption?: string;
  readonly focalPoint?: MediaFocalPoint;
  readonly height?: number;
  readonly id: string;
  readonly mimeType: string;
  readonly width?: number;
}

/** Builds the public media URL of one media ID. */
export type PublicMediaUrl = (mediaId: string) => string;

/** Maps the published snapshot of an entry; the draft is never read. */
export function toPublicEntryDto(
  entry: ContentEntry,
  path: string,
  options: SeoMappingOptions & {
    readonly internalLinks?: readonly PublicInternalLinkReference[];
  } = {},
): PublicEntryDto {
  const snapshot = entry.published;
  if (snapshot === undefined) throw new TypeError("A public entry requires a published snapshot.");
  return {
    internalLinks: (options.internalLinks ?? []).map((item) => ({ ...item })),
    blocks: publicBlocks(snapshot.blocks),
    fields: snapshot.fields,
    id: entry.id,
    modelKey: entry.model.key,
    path,
    publishedAt: toIsoTimestamp(snapshot.createdAt),
    ...(options.seo === true ? { seo: toSeoDto(snapshot.seo) } : {}),
    ...(snapshot.slug === undefined ? {} : { slug: snapshot.slug }),
    title: snapshot.title,
  };
}

/** Keys of the models whose public entries carry `seo`. */
export interface PublicSeoOptions {
  readonly seoModels?: ReadonlySet<string>;
}

export function publicEntryOptions(
  entry: ContentEntry,
  options: PublicSeoOptions,
): SeoMappingOptions {
  return { seo: options.seoModels?.has(entry.model.key) === true };
}

/** Maps the published snapshot of a global; the draft and its title are never read. */
export function toPublicGlobalDto(
  entry: ContentEntry,
  internalLinks: readonly PublicInternalLinkReference[] = [],
): PublicGlobalDto {
  const snapshot = entry.published;
  if (snapshot === undefined) throw new TypeError("A public global requires a published snapshot.");
  return {
    internalLinks: internalLinks.map((item) => ({ ...item })),
    blocks: publicBlocks(snapshot.blocks),
    fields: snapshot.fields,
    id: entry.id,
    modelKey: entry.model.key,
    publishedAt: toIsoTimestamp(snapshot.createdAt),
  };
}

/** Maps the published snapshot of a route-less collection entry; no path or slug. */
export function toPublicRecordDto(
  entry: ContentEntry,
  internalLinks: readonly PublicInternalLinkReference[] = [],
): PublicRecordDto {
  const snapshot = entry.published;
  if (snapshot === undefined) throw new TypeError("A public record requires a published snapshot.");
  return {
    internalLinks: internalLinks.map((item) => ({ ...item })),
    blocks: publicBlocks(snapshot.blocks),
    fields: snapshot.fields,
    id: entry.id,
    modelKey: entry.model.key,
    publishedAt: toIsoTimestamp(snapshot.createdAt),
    title: snapshot.title,
  };
}

export function toPublicMediaDto(media: PublicMediaSource, url: string): PublicMediaDto {
  return {
    alt: media.alt ?? null,
    caption: media.caption ?? null,
    focalPoint:
      media.focalPoint === undefined ? null : { x: media.focalPoint.x, y: media.focalPoint.y },
    height: media.height ?? null,
    id: media.id,
    mimeType: media.mimeType,
    url,
    width: media.width ?? null,
  };
}

/** Deduplicates media by ID into a dictionary whose keys are in code-unit order. */
export function toPublicMediaDictionary(
  media: readonly PublicMediaSource[],
  urlFor: PublicMediaUrl,
): PublicMediaDictionaryDto {
  const byId = new Map<string, PublicMediaSource>();
  for (const item of media) if (!byId.has(item.id)) byId.set(item.id, item);
  const dictionary: Record<string, PublicMediaDto> = {};
  for (const id of [...byId.keys()].sort((left, right) =>
    left < right ? -1 : left > right ? 1 : 0,
  ))
    dictionary[id] = toPublicMediaDto(byId.get(id)!, urlFor(id));
  return dictionary;
}

export function toPublicContentEntryDto(
  value: PublicEntrySource,
  urlFor: PublicMediaUrl,
  options: PublicSeoOptions = {},
): PublicContentEntryDto {
  return {
    entry: toPublicEntryDto(value.entry, value.path, {
      ...publicEntryOptions(value.entry, options),
      ...(value.internalLinks === undefined ? {} : { internalLinks: value.internalLinks }),
    }),
    media: toPublicMediaDictionary(value.media, urlFor),
  };
}

export function toPublicContentListDto(
  value: { readonly items: readonly PublicEntrySource[]; readonly nextCursor?: string },
  urlFor: PublicMediaUrl,
  options: PublicSeoOptions = {},
): PublicContentListDto {
  return {
    items: value.items.map(({ entry, path, internalLinks = [] }) =>
      toPublicEntryDto(entry, path, { ...publicEntryOptions(entry, options), internalLinks }),
    ),
    media: toPublicMediaDictionary(
      value.items.flatMap((item) => item.media),
      urlFor,
    ),
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor as OpaqueCursorDto }),
  };
}

/** A published global and the media its publication references. */
export interface PublicGlobalSource {
  readonly internalLinks: readonly PublicInternalLinkReference[];
  readonly entry: ContentEntry;
  readonly media: readonly PublicMediaSource[];
}

export function toPublicGlobalContentDto(
  value: PublicGlobalSource,
  urlFor: PublicMediaUrl,
): PublicGlobalContentDto {
  return {
    global: toPublicGlobalDto(value.entry, value.internalLinks),
    media: toPublicMediaDictionary(value.media, urlFor),
  };
}

/** A published route-less collection entry and the media its publication references. */
export interface PublicRecordSource {
  readonly internalLinks: readonly PublicInternalLinkReference[];
  readonly entry: ContentEntry;
  readonly media: readonly PublicMediaSource[];
}

export function toPublicRecordListDto(
  value: { readonly items: readonly PublicRecordSource[]; readonly nextCursor?: string },
  urlFor: PublicMediaUrl,
): PublicRecordListDto {
  return {
    items: value.items.map(({ entry, internalLinks }) => toPublicRecordDto(entry, internalLinks)),
    media: toPublicMediaDictionary(
      value.items.flatMap((item) => item.media),
      urlFor,
    ),
    ...(value.nextCursor === undefined ? {} : { nextCursor: value.nextCursor as OpaqueCursorDto }),
  };
}
