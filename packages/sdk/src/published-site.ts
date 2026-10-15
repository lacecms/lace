import { effectiveAltText } from "@lacecms/contracts";
import type {
  BuildExportDto,
  EntityTag,
  PublicBlockDto,
  PublicEntryDto,
  SeoValueDto,
  PublicMediaDto,
} from "@lacecms/contracts";
import {
  createLaceClient,
  LaceHttpError,
  LaceSdkError,
  LaceTransportError,
  LaceUnsupportedExportFormatError,
} from "./client.js";
import type { LaceClient, LaceFetch } from "./client.js";
import { resolveSeo, seoText, siteUrlFor } from "./seo.js";
import type { ResolvedSeo, SeoDefaultValues } from "./seo.js";

/** Environment values the published-site loader understands. */
export type PublishedSiteEnvironment = Readonly<Record<string, string | undefined>>;

/** Stable codes for published-site loader failures. */
export type PublishedSiteErrorCode =
  | "api_unavailable"
  | "invalid_export"
  | "missing_configuration"
  | "rejected_token"
  | "version_mismatch";

export interface PublishedSiteLoaderOptions {
  /** Takes precedence over `LACE_API_BASE_URL`. */
  readonly baseUrl?: string;
  readonly environment?: PublishedSiteEnvironment;
  /** Takes precedence over `LACE_EXPECTED_PUBLISHED_VERSION`. */
  readonly expectedPublishedVersion?: number;
  readonly fetch?: LaceFetch;
  /** Extra text appended to the message of a failure with the matching code. */
  readonly hints?: Readonly<Partial<Record<PublishedSiteErrorCode, string>>>;
  /** Takes precedence over `LACE_SITE_INDEXING` (`on` or `off`; default `on`). */
  readonly indexing?: "off" | "on";
  /** Takes precedence over `LACE_PUBLIC_BASE_URL`. */
  readonly publicBaseUrl?: string;
  /**
   * Revalidates the export with its ETag on every call. Dev servers use this so
   * publications appear on reload; static builds keep one export per loader.
   */
  readonly revalidate?: boolean;
  /** Takes precedence over `LACE_BUILD_SITE_URL`, the public site base URL. */
  readonly siteUrl?: string;
  /** Takes precedence over `LACE_BUILD_TOKEN`. */
  readonly token?: string;
}

/**
 * One published block, ordered by `position` within its entry, with its
 * anchor, class name and settings; hidden blocks are never delivered.
 */
export type PublishedBlock = PublicBlockDto;

/** A media item referenced by published content, resolved from the export. */
export type PublishedMedia = Readonly<PublicMediaDto>;

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
export interface PublishedEntry extends PublishedMediaLookup {
  readonly blocks: readonly PublishedBlock[];
  readonly fields: PublicEntryDto["fields"];
  readonly id: string;
  readonly modelKey: string;
  readonly path: string;
  readonly publishedAt: string;
  /**
   * Stored SEO values of an entry of an SEO-enabled model, with `null` for
   * unset values; fallbacks and site defaults are not applied.
   */
  readonly seo?: SeoValueDto;
  readonly slug?: string;
  readonly title: string;
}

/** The published content of one route-less global; no path, slug, or title. */
export interface PublishedGlobal extends PublishedMediaLookup {
  readonly blocks: readonly PublishedBlock[];
  readonly fields: PublicEntryDto["fields"];
  readonly id: string;
  readonly modelKey: string;
  readonly publishedAt: string;
}

/** An immutable view of one published build export. */
export interface PublishedSite extends PublishedMediaLookup {
  /** Every published entry of every model, sorted by path; no globals. */
  allEntries(): readonly PublishedEntry[];
  byPath(path: string): PublishedEntry | undefined;
  bySlug(modelKey: string, slug: string): PublishedEntry | undefined;
  entries(modelKey: string): readonly PublishedEntry[];
  /** The published global of a model, or `undefined` when it is not published. */
  global(modelKey: string): PublishedGlobal | undefined;
  /** False when the deployment switched indexing off (`LACE_SITE_INDEXING=off`). */
  readonly indexing: boolean;
  mediaUrl(mediaId: string): string;
  /** The entry's SEO metadata with fallbacks and site defaults applied. */
  seo(entry: PublishedEntry): ResolvedSeo;
  /** The site base URL ending with `/`, or `undefined` when `LACE_BUILD_SITE_URL` is not set. */
  readonly url: string | undefined;
  /** The absolute URL of a public path, or `undefined` without a site URL. */
  urlFor(path: string): string | undefined;
  readonly version: number;
}

export type PublishedSiteLoader = () => Promise<PublishedSite>;

export class LacePublishedSiteError extends LaceSdkError {
  public readonly code: PublishedSiteErrorCode;

  public constructor(code: PublishedSiteErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LacePublishedSiteError";
    this.code = code;
  }
}

interface ResolvedConfiguration {
  readonly client: LaceClient;
  readonly expectedVersion?: number;
  readonly indexing: boolean;
  readonly mediaClient: LaceClient;
  /** True when the site configures its own public media origin. */
  readonly publicMediaOrigin: boolean;
  readonly siteUrl?: string;
}

type ExportRead =
  | { readonly changed: false; readonly etag: EntityTag }
  | { readonly changed: true; readonly etag: EntityTag; readonly site: PublishedSite };

function present(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value;
}

/** Normalizes a public site base URL to a trailing slash, or `undefined` when invalid. */
function normalizeSiteUrl(raw: string): string | undefined {
  // A bare `?` or `#` disappears during parsing; refuse it rather than silently dropping it.
  if (raw.includes("?") || raw.includes("#")) return undefined;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return undefined;
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username !== "" || url.password !== "")
    return undefined;
  return url.href.endsWith("/") ? url.href : `${url.href}/`;
}

function compareCodeUnits(left: string, right: string): number {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

/**
 * Creates a framework-neutral loader for the published build export. It reads
 * configuration only from its options, and only when first called.
 */
export function createPublishedSiteLoader(
  options: PublishedSiteLoaderOptions = {},
): PublishedSiteLoader {
  const environment = options.environment ?? {};

  function failure(code: PublishedSiteErrorCode, message: string, cause?: unknown): never {
    const hint = options.hints?.[code];
    throw new LacePublishedSiteError(
      code,
      hint === undefined ? message : `${message} ${hint}`,
      cause === undefined ? undefined : { cause },
    );
  }

  function client(baseUrl: string, setting: string, token?: string): LaceClient {
    try {
      return createLaceClient({
        baseUrl,
        ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
        ...(token === undefined ? {} : { token }),
      });
    } catch (cause) {
      if (cause instanceof TypeError)
        failure(
          "missing_configuration",
          `${setting} must be an absolute HTTP(S) URL without credentials, query, or fragment.`,
          cause,
        );
      throw cause;
    }
  }

  function resolveConfiguration(): ResolvedConfiguration {
    const baseUrl = present(options.baseUrl) ?? present(environment.LACE_API_BASE_URL);
    if (baseUrl === undefined)
      failure(
        "missing_configuration",
        "LACE_API_BASE_URL is not configured. Set it to the origin of the Lace API that serves the published build export.",
      );
    const token = present(options.token) ?? present(environment.LACE_BUILD_TOKEN);
    if (token === undefined)
      failure(
        "missing_configuration",
        "LACE_BUILD_TOKEN is not configured. Create a read-only build token in Lace and provide it to the site build.",
      );
    const publicBaseUrl =
      present(options.publicBaseUrl) ?? present(environment.LACE_PUBLIC_BASE_URL);
    let expectedVersion = options.expectedPublishedVersion;
    const expectedSetting = present(environment.LACE_EXPECTED_PUBLISHED_VERSION);
    if (expectedVersion === undefined && expectedSetting !== undefined) {
      if (!/^\d+$/u.test(expectedSetting.trim()))
        failure(
          "missing_configuration",
          "LACE_EXPECTED_PUBLISHED_VERSION must be a non-negative integer.",
        );
      expectedVersion = Number(expectedSetting.trim());
    }
    if (
      expectedVersion !== undefined &&
      (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0)
    )
      failure(
        "missing_configuration",
        "LACE_EXPECTED_PUBLISHED_VERSION must be a non-negative integer.",
      );
    const rawSiteUrl = present(options.siteUrl) ?? present(environment.LACE_BUILD_SITE_URL);
    const siteUrl = rawSiteUrl === undefined ? undefined : normalizeSiteUrl(rawSiteUrl.trim());
    if (rawSiteUrl !== undefined && siteUrl === undefined)
      failure(
        "missing_configuration",
        "LACE_BUILD_SITE_URL must be an absolute HTTP(S) URL without credentials, query, or fragment.",
      );
    const indexing = (present(options.indexing) ?? present(environment.LACE_SITE_INDEXING))?.trim();
    if (indexing !== undefined && indexing !== "on" && indexing !== "off")
      failure("missing_configuration", "LACE_SITE_INDEXING must be on or off.");
    return {
      client: client(baseUrl, "LACE_API_BASE_URL", token),
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
      indexing: indexing !== "off",
      mediaClient:
        publicBaseUrl === undefined
          ? client(baseUrl, "LACE_API_BASE_URL")
          : client(publicBaseUrl, "LACE_PUBLIC_BASE_URL"),
      publicMediaOrigin: publicBaseUrl !== undefined,
      ...(siteUrl === undefined ? {} : { siteUrl }),
    };
  }

  function buildSite(
    exported: BuildExportDto,
    configuration: ResolvedConfiguration,
  ): PublishedSite {
    const { indexing, mediaClient, publicMediaOrigin, siteUrl } = configuration;
    const resolved = new Map<string, PublishedMedia>();
    for (const item of Object.values(exported.media)) {
      resolved.set(
        item.id,
        Object.freeze({
          ...item,
          focalPoint: item.focalPoint === null ? null : Object.freeze({ ...item.focalPoint }),
          url: publicMediaOrigin ? mediaClient.getPublicMediaUrl(item.id) : item.url,
        }),
      );
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
    const byPath = new Map<string, PublishedEntry>();
    const byModel = new Map<string, PublishedEntry[]>();
    const bySlug = new Map<string, Map<string, PublishedEntry>>();
    for (const entry of exported.entries) {
      const { path } = entry;
      const blocks = [...entry.blocks]
        .sort((left, right) => left.position - right.position)
        .map((block) => Object.freeze(block));
      const published: PublishedEntry = Object.freeze({
        blocks: Object.freeze(blocks),
        fields: entry.fields,
        id: entry.id,
        image: lookup.image,
        media: lookup.media,
        modelKey: entry.modelKey,
        path,
        publishedAt: entry.publishedAt,
        ...(entry.seo === undefined ? {} : { seo: Object.freeze({ ...entry.seo }) }),
        ...(entry.slug === undefined ? {} : { slug: entry.slug }),
        title: entry.title,
      });
      const samePath = byPath.get(path);
      if (samePath !== undefined)
        failure(
          "invalid_export",
          `The build export contains entries ${samePath.id} and ${entry.id} at the same path ${path}.`,
        );
      byPath.set(path, published);
      const modelEntries = byModel.get(published.modelKey) ?? [];
      modelEntries.push(published);
      byModel.set(published.modelKey, modelEntries);
      if (published.slug !== undefined) {
        const slugs = bySlug.get(published.modelKey) ?? new Map<string, PublishedEntry>();
        if (slugs.has(published.slug))
          failure(
            "invalid_export",
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
          "invalid_export",
          `The build export contains global ${global.modelKey} more than once or also as entries.`,
        );
      globals.set(
        global.modelKey,
        Object.freeze({
          blocks: Object.freeze(
            [...global.blocks]
              .sort((left, right) => left.position - right.position)
              .map((block) => Object.freeze(block)),
          ),
          fields: global.fields,
          id: global.id,
          image: lookup.image,
          media: lookup.media,
          modelKey: global.modelKey,
          publishedAt: global.publishedAt,
        }),
      );
    }
    const listings = new Map<string, readonly PublishedEntry[]>();
    for (const [modelKey, modelEntries] of byModel) {
      listings.set(
        modelKey,
        Object.freeze(modelEntries.sort((left, right) => compareCodeUnits(left.path, right.path))),
      );
    }
    const empty: readonly PublishedEntry[] = Object.freeze([]);
    const all = Object.freeze(
      [...byPath.values()].sort((left, right) => compareCodeUnits(left.path, right.path)),
    );
    const defaultsSource = exported.seo.defaults;
    const defaultsGlobal =
      defaultsSource === null ? undefined : globals.get(defaultsSource.modelKey);
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
      allEntries: () => all,
      byPath: (path: string) => byPath.get(path),
      bySlug: (modelKey: string, slug: string) => bySlug.get(modelKey)?.get(slug),
      entries: (modelKey: string) => listings.get(modelKey) ?? empty,
      global: (modelKey: string) => globals.get(modelKey),
      image: lookup.image,
      indexing,
      media: lookup.media,
      mediaUrl: (mediaId: string) =>
        resolved.get(mediaId)?.url ?? mediaClient.getPublicMediaUrl(mediaId),
      seo: (entry: PublishedEntry) =>
        resolveSeo({
          ...(defaults === undefined ? {} : { defaults }),
          entry,
          image: (mediaId: string) => lookup.image(mediaId),
          indexing,
          ...(Object.hasOwn(mappings, entry.modelKey) ? { mapping: mappings[entry.modelKey] } : {}),
          ...(siteUrl === undefined ? {} : { siteUrl }),
        }),
      url: siteUrl,
      urlFor: (path: string) => (siteUrl === undefined ? undefined : siteUrlFor(siteUrl, path)),
      version: exported.version,
    });
  }

  async function read(etag?: EntityTag): Promise<ExportRead> {
    const configuration = resolveConfiguration();
    let result;
    try {
      result = await configuration.client.getBuildExport(etag === undefined ? {} : { etag });
    } catch (error) {
      if (error instanceof LaceHttpError && (error.status === 401 || error.status === 403))
        failure(
          "rejected_token",
          `The Lace API rejected LACE_BUILD_TOKEN (HTTP ${error.status}). Replace it with a valid read-only build token.`,
          error,
        );
      if (error instanceof LaceTransportError)
        failure(
          "api_unavailable",
          "The Lace API is unavailable. Check LACE_API_BASE_URL and that the Lace API is running.",
          error,
        );
      if (error instanceof LaceUnsupportedExportFormatError)
        failure(
          "invalid_export",
          `The Lace API sent build-export format ${error.received}, but this @lacecms/sdk supports format ${error.supported} at most. Upgrade @lacecms/sdk (and @lacecms/astro) to the release that matches the Lace API.`,
          error,
        );
      throw error;
    }
    if (!result.changed) return { changed: false, etag: result.etag };
    const version = result.export.version;
    if (configuration.expectedVersion !== undefined && version !== configuration.expectedVersion)
      failure(
        "version_mismatch",
        `The published content changed during the site build: expected version ${configuration.expectedVersion}, received ${version}. Start the build again.`,
      );
    return {
      changed: true,
      etag: result.etag,
      site: buildSite(result.export, configuration),
    };
  }

  if (options.revalidate !== true) {
    let cached: Promise<PublishedSite> | undefined;
    return () => {
      cached ??= read()
        .then((result) => {
          if (!result.changed)
            failure("invalid_export", "The Lace API returned 304 without a prior build export.");
          return result.site;
        })
        .catch((error: unknown) => {
          cached = undefined;
          throw error;
        });
      return cached;
    };
  }

  let current: { readonly etag: EntityTag; readonly site: PublishedSite } | undefined;
  let pending: Promise<PublishedSite> | undefined;
  return () => {
    // Concurrent calls share one conditional request; later calls revalidate.
    pending ??= read(current?.etag)
      .then((result) => {
        if (result.changed) current = { etag: result.etag, site: result.site };
        if (current === undefined)
          failure("invalid_export", "The Lace API returned 304 without a prior build export.");
        current = { etag: result.etag, site: current.site };
        return current.site;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
