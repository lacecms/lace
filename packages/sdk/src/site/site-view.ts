import { effectiveAltText } from "@lacecms/contracts";
import type { BuildExportDto, PublicEntryDto } from "@lacecms/contracts";
import { immutable, publishedLinks } from "./internal-links.js";
import type { PublishedLinkLookup } from "./internal-links.js";
import { resolveSeo, seoText, siteUrlFor } from "./seo.js";
import type { SeoDefaultValues } from "./seo.js";
import type {
  PublishedGlobal,
  PublishedMedia,
  PublishedMediaLookup,
  PublishedRecord,
  PublishedReferenceLookup,
  SiteEntry,
  SiteView,
} from "./types.js";

type EntryData = Omit<PublicEntryDto, "publishedAt"> & { readonly publishedAt?: string };
type ViewEntry<Entry extends EntryData> = Readonly<Omit<Entry, "blocks">> &
  Pick<SiteEntry, "blocks"> &
  PublishedMediaLookup &
  PublishedLinkLookup &
  PublishedReferenceLookup;

interface SiteViewOptions<Entry extends EntryData> {
  readonly exported: Pick<BuildExportDto, "globals" | "records" | "seo" | "version"> & {
    readonly entries: readonly Entry[];
  };
  readonly indexing: boolean;
  readonly siteUrl: string | undefined;
  readonly media: readonly PublishedMedia[];
  readonly missingMediaUrl: (id: string) => string;
  readonly normalizePath?: (path: string) => string;
  readonly failure: (message: string, cause?: unknown) => never;
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/** Assemble detached content into shared route, reference, link, SEO and media lookups. */
export function assembleSiteView<Entry extends EntryData>({
  exported,
  indexing,
  siteUrl,
  media,
  missingMediaUrl,
  normalizePath = (path) => path,
  failure,
}: SiteViewOptions<Entry>): SiteView<ViewEntry<Entry>> {
  const links = (() => {
    try {
      return publishedLinks(exported);
    } catch (cause) {
      return failure("The build export has inconsistent link identities or manifests.", cause);
    }
  })();
  immutable(exported);
  const resolved = new Map<string, PublishedMedia>();
  for (const item of media) {
    resolved.set(item.id, immutable(item));
  }
  const lookup: PublishedMediaLookup = Object.freeze({
    image: (mediaId: string, usageAlt?: string | null) => {
      const item = resolved.get(mediaId);
      return item === undefined
        ? undefined
        : Object.freeze({ ...item, alt: effectiveAltText(usageAlt, item.alt) });
    },
    media: (mediaId: string) => resolved.get(mediaId),
  });
  const byPath = new Map<string, ViewEntry<Entry>>();
  // publishedLinks has already checked identity uniqueness across all export phases.
  const byId = new Map<string, ViewEntry<Entry> | PublishedRecord>();
  const reference = (id: string) => byId.get(id);
  const byModel = new Map<string, ViewEntry<Entry>[]>();
  const bySlug = new Map<string, Map<string, ViewEntry<Entry>>>();
  for (const entry of exported.entries) {
    const { path } = entry;
    const { blocks: unsorted, ...data } = entry;
    const blocks = [...unsorted]
      .sort((left, right) => left.position - right.position)
      .map((block) => Object.freeze(block));
    const published = Object.freeze({
      ...data,
      blocks: Object.freeze(blocks),
      image: lookup.image,
      media: lookup.media,
      link: links.link,
      reference,
    });
    const samePath = byPath.get(path);
    if (samePath !== undefined)
      failure(
        `The build export contains entries ${samePath.id} and ${entry.id} at the same path ${path}.`,
      );
    byPath.set(path, published);
    byId.set(entry.id, published);
    const modelEntries = byModel.get(published.modelKey) ?? [];
    modelEntries.push(published);
    byModel.set(published.modelKey, modelEntries);
    if (published.slug !== undefined) {
      const slugs = bySlug.get(published.modelKey) ?? new Map<string, ViewEntry<Entry>>();
      if (slugs.has(published.slug))
        failure(
          `The build export contains duplicate slug ${published.slug} in model ${published.modelKey}.`,
        );
      slugs.set(published.slug, published);
      bySlug.set(published.modelKey, slugs);
    }
  }
  const globals = new Map<string, PublishedGlobal>();
  for (const global of exported.globals) {
    if (globals.has(global.modelKey) || byModel.has(global.modelKey))
      failure(
        `The build export contains global ${global.modelKey} more than once or also as entries.`,
      );
    globals.set(
      global.modelKey,
      Object.freeze({
        internalLinks: global.internalLinks,
        blocks: Object.freeze(
          [...global.blocks]
            .sort((left, right) => left.position - right.position)
            .map((block) => Object.freeze(block)),
        ),
        fields: global.fields,
        id: global.id,
        image: lookup.image,
        media: lookup.media,
        link: links.link,
        reference,
        modelKey: global.modelKey,
        publishedAt: global.publishedAt,
      }),
    );
  }
  const recordsByModel = new Map<string, PublishedRecord[]>();
  for (const record of exported.records) {
    if (byModel.has(record.modelKey) || globals.has(record.modelKey))
      failure(
        `The build export contains records of ${record.modelKey}, which also has entries or a global.`,
      );
    const modelRecords = recordsByModel.get(record.modelKey) ?? [];
    const published = Object.freeze({
      internalLinks: record.internalLinks,
      blocks: Object.freeze(
        [...record.blocks]
          .sort((left, right) => left.position - right.position)
          .map((block) => Object.freeze(block)),
      ),
      fields: record.fields,
      id: record.id,
      image: lookup.image,
      media: lookup.media,
      link: links.link,
      reference,
      modelKey: record.modelKey,
      publishedAt: record.publishedAt,
      title: record.title,
    });
    byId.set(record.id, published);
    modelRecords.push(published);
    recordsByModel.set(record.modelKey, modelRecords);
  }
  const recordListings = new Map<string, readonly PublishedRecord[]>();
  for (const [modelKey, modelRecords] of recordsByModel) {
    recordListings.set(
      modelKey,
      Object.freeze(
        modelRecords.sort(
          (left, right) =>
            compareCodeUnits(right.publishedAt, left.publishedAt) ||
            compareCodeUnits(right.id, left.id),
        ),
      ),
    );
  }
  const noRecords: readonly PublishedRecord[] = Object.freeze([]);
  const listings = new Map<string, readonly ViewEntry<Entry>[]>();
  for (const [modelKey, modelEntries] of byModel) {
    listings.set(
      modelKey,
      Object.freeze(modelEntries.sort((left, right) => compareCodeUnits(left.path, right.path))),
    );
  }
  const empty: readonly ViewEntry<Entry>[] = Object.freeze([]);
  const all = Object.freeze(
    [...byPath.values()].sort((left, right) => compareCodeUnits(left.path, right.path)),
  );
  const defaultsSource = exported.seo.defaults;
  const defaultsGlobal = defaultsSource === null ? undefined : globals.get(defaultsSource.modelKey);
  let defaults: SeoDefaultValues | undefined;
  if (defaultsSource !== null && defaultsGlobal !== undefined) {
    const value = (key: string | null) =>
      key === null ? undefined : seoText(defaultsGlobal.fields[key]);
    const siteName = value(defaultsSource.siteName);
    const titleTemplate = value(defaultsSource.titleTemplate);
    const description = value(defaultsSource.description);
    const image = value(defaultsSource.image);
    defaults = Object.freeze({
      ...(description === undefined ? {} : { description }),
      ...(image === undefined ? {} : { image }),
      ...(siteName === undefined ? {} : { siteName }),
      ...(titleTemplate === undefined ? {} : { titleTemplate }),
    });
  }
  const mappings = exported.seo.models;
  return Object.freeze({
    link: links.link,
    linkDiagnostics: links.linkDiagnostics,
    allEntries: () => all,
    byPath: (path: string) => byPath.get(normalizePath(path)),
    bySlug: (modelKey: string, slug: string) => bySlug.get(modelKey)?.get(slug),
    entries: (modelKey: string) => listings.get(modelKey) ?? empty,
    global: (modelKey: string) => globals.get(modelKey),
    image: lookup.image,
    indexing,
    media: lookup.media,
    mediaUrl: (mediaId: string) => resolved.get(mediaId)?.url ?? missingMediaUrl(mediaId),
    records: (modelKey: string) => recordListings.get(modelKey) ?? noRecords,
    reference,
    seo: (entry: SiteEntry) =>
      resolveSeo({
        ...(defaults === undefined ? {} : { defaults }),
        entry,
        image: (mediaId: string) => {
          const image = lookup.image(mediaId);
          if (image?.thumbnail === undefined) return image;
          const { thumbnail: _thumbnail, ...metadata } = image;
          return Object.freeze(metadata);
        },
        indexing,
        ...(Object.hasOwn(mappings, entry.modelKey) ? { mapping: mappings[entry.modelKey] } : {}),
        ...(siteUrl === undefined ? {} : { siteUrl }),
      }),
    url: siteUrl,
    urlFor: (path: string) =>
      siteUrl === undefined ? undefined : siteUrlFor(siteUrl, normalizePath(path)),
    version: exported.version,
  });
}
