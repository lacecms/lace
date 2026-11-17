import type {
  PublicBlockDto,
  PublicEntryDto,
  PublicMediaDto,
  SeoValueDto,
} from "@lacecms/contracts";
import type { LinkDiagnostics, PublishedLinkLookup } from "./internal-links.js";
import type { ResolvedSeo } from "./seo.js";

/**
 * One published block, ordered by `position` within its entry, with its
 * anchor, class name and settings; hidden blocks are never delivered.
 */
export type PublishedBlock = PublicBlockDto;

/** A media item referenced by published content, resolved from the export. */
export interface PublishedMedia extends Readonly<PublicMediaDto> {
  /**
   * The item's public media URL under the API base URL, which the build can
   * always reach; absent when the loader's `optimizeImages` is `false`.
   */
  readonly sourceUrl?: string;
}

/** A resolved media item whose `alt` is the effective alt text of one usage. */
export interface PublishedImage extends PublishedMedia {
  readonly alt: string;
}

/** Lookups over the export's resolved media. */
export interface PublishedMediaLookup {
  /** Returns the image with the usage alt text, else the media alt text, else `""`. */
  image(mediaId: string, usageAlt?: string | null): PublishedImage | undefined;
  media(mediaId: string): PublishedMedia | undefined;
}

/** The published content of one entry; no draft or editorial data is exposed. */
export interface SiteEntry extends PublishedMediaLookup, PublishedLinkLookup {
  readonly internalLinks: readonly Readonly<PublicEntryDto["internalLinks"][number]>[];
  readonly blocks: readonly PublishedBlock[];
  readonly fields: PublicEntryDto["fields"];
  readonly id: string;
  readonly modelKey: string;
  readonly path: string;
  readonly publishedAt?: string | undefined;
  /**
   * Stored SEO values of an entry of an SEO-enabled model, with `null` for
   * unset values; fallbacks and site defaults are not applied.
   */
  readonly seo?: SeoValueDto | undefined;
  readonly slug?: string | undefined;
  readonly title: string;
}

export interface PublishedEntry extends SiteEntry {
  readonly publishedAt: string;
}

/** The published content of one route-less global; no path, slug, or title. */
export interface PublishedGlobal extends PublishedMediaLookup, PublishedLinkLookup {
  readonly internalLinks: readonly Readonly<PublicEntryDto["internalLinks"][number]>[];
  readonly blocks: readonly PublishedBlock[];
  readonly fields: PublicEntryDto["fields"];
  readonly id: string;
  readonly modelKey: string;
  readonly publishedAt: string;
}

/**
 * The published content of one entry of a route-less collection: listed by
 * model key, with a title but no path, slug or SEO group.
 */
export interface PublishedRecord extends PublishedMediaLookup, PublishedLinkLookup {
  readonly internalLinks: readonly Readonly<PublicEntryDto["internalLinks"][number]>[];
  readonly blocks: readonly PublishedBlock[];
  readonly fields: PublicEntryDto["fields"];
  readonly id: string;
  readonly modelKey: string;
  readonly publishedAt: string;
  readonly title: string;
}

/** An immutable view of one published build export. */
export interface SiteView<Entry extends SiteEntry = SiteEntry>
  extends PublishedMediaLookup, PublishedLinkLookup {
  readonly linkDiagnostics: LinkDiagnostics;
  /** Every published entry of every model, sorted by path; no globals. */
  allEntries(): readonly Entry[];
  byPath(path: string): Entry | undefined;
  bySlug(modelKey: string, slug: string): Entry | undefined;
  entries(modelKey: string): readonly Entry[];
  /** The published global of a model, or `undefined` when it is not published. */
  global(modelKey: string): PublishedGlobal | undefined;
  /** False when the deployment switched indexing off (`LACE_SITE_INDEXING=off`). */
  readonly indexing: boolean;
  mediaUrl(mediaId: string): string;
  /**
   * Published records of a route-less collection, newest publication first;
   * empty for any other model. Records never appear in entry lookups or the sitemap.
   */
  records(modelKey: string): readonly PublishedRecord[];
  /** The entry's SEO metadata with fallbacks and site defaults applied. */
  seo(entry: SiteEntry): ResolvedSeo;
  /** The site base URL ending with `/`, or `undefined` when `LACE_BUILD_SITE_URL` is not set. */
  readonly url: string | undefined;
  /** The absolute URL of a public path, or `undefined` without a site URL. */
  urlFor(path: string): string | undefined;
  readonly version: number;
}

export type PublishedSite = SiteView<PublishedEntry>;
