import type {
  BuildExportDto,
  ContentBlockDto,
  ContentSnapshotDto,
  EntityTag,
} from "@lacecms/contracts";
import { createLaceClient, LaceHttpError, LaceSdkError, LaceTransportError } from "./client.js";
import type { LaceClient, LaceFetch } from "./client.js";

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
  /** Takes precedence over `LACE_PUBLIC_BASE_URL`. */
  readonly publicBaseUrl?: string;
  /**
   * Revalidates the export with its ETag on every call. Dev servers use this so
   * publications appear on reload; static builds keep one export per loader.
   */
  readonly revalidate?: boolean;
  /** Takes precedence over `LACE_BUILD_TOKEN`. */
  readonly token?: string;
}

/** One published block, ordered by `position` within its entry. */
export type PublishedBlock = ContentBlockDto;

/** The published content of one entry; no draft or editorial data is exposed. */
export interface PublishedEntry {
  readonly blocks: readonly PublishedBlock[];
  readonly fields: ContentSnapshotDto["fields"];
  readonly id: string;
  readonly modelKey: string;
  readonly path: string;
  readonly slug?: string;
  readonly title: string;
}

/** An immutable view of one published build export. */
export interface PublishedSite {
  byPath(path: string): PublishedEntry | undefined;
  bySlug(modelKey: string, slug: string): PublishedEntry | undefined;
  entries(modelKey: string): readonly PublishedEntry[];
  mediaUrl(mediaId: string): string;
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
  readonly mediaClient: LaceClient;
}

type ExportRead =
  | { readonly changed: false; readonly etag: EntityTag }
  | { readonly changed: true; readonly etag: EntityTag; readonly site: PublishedSite };

function present(value: string | undefined): string | undefined {
  return value === undefined || value.trim().length === 0 ? undefined : value;
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
    return {
      client: client(baseUrl, "LACE_API_BASE_URL", token),
      ...(expectedVersion === undefined ? {} : { expectedVersion }),
      mediaClient:
        publicBaseUrl === undefined
          ? client(baseUrl, "LACE_API_BASE_URL")
          : client(publicBaseUrl, "LACE_PUBLIC_BASE_URL"),
    };
  }

  function buildSite(exported: BuildExportDto, mediaClient: LaceClient): PublishedSite {
    const byPath = new Map<string, PublishedEntry>();
    const byModel = new Map<string, PublishedEntry[]>();
    const bySlug = new Map<string, Map<string, PublishedEntry>>();
    for (const { entry, path } of exported.entries) {
      const snapshot = entry.published;
      if (snapshot === undefined)
        failure(
          "invalid_export",
          `The build export contains entry ${entry.id} without a published snapshot.`,
        );
      const blocks = [...snapshot.blocks]
        .sort((left, right) => left.position - right.position)
        .map((block) => Object.freeze(block));
      const published: PublishedEntry = Object.freeze({
        blocks: Object.freeze(blocks),
        fields: snapshot.fields,
        id: entry.id,
        modelKey: entry.model.key,
        path,
        ...(snapshot.slug === undefined ? {} : { slug: snapshot.slug }),
        title: snapshot.title,
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
    const listings = new Map<string, readonly PublishedEntry[]>();
    for (const [modelKey, modelEntries] of byModel) {
      listings.set(
        modelKey,
        Object.freeze(modelEntries.sort((left, right) => compareCodeUnits(left.path, right.path))),
      );
    }
    const empty: readonly PublishedEntry[] = Object.freeze([]);
    return Object.freeze({
      byPath: (path: string) => byPath.get(path),
      bySlug: (modelKey: string, slug: string) => bySlug.get(modelKey)?.get(slug),
      entries: (modelKey: string) => listings.get(modelKey) ?? empty,
      mediaUrl: (mediaId: string) => mediaClient.getPublicMediaUrl(mediaId),
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
      site: buildSite(result.export, configuration.mediaClient),
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
        return current.site;
      })
      .finally(() => {
        pending = undefined;
      });
    return pending;
  };
}
