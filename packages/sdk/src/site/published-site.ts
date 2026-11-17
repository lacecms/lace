import { createLaceClient } from "../client/client.js";
import type { LaceClient, LaceFetch } from "../client/client.js";
import {
  LaceHttpError,
  LaceLinkManifestError,
  LaceSdkError,
  LaceTransportError,
  LaceUnsupportedExportFormatError,
} from "../client/errors.js";
import type { EntityTag } from "@lacecms/contracts";
import type { LinkDiagnostics } from "./internal-links.js";
import { normalizeSiteUrl } from "./seo.js";
import { assembleSiteView } from "./site-view.js";
import type { PublishedSite } from "./types.js";

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
  /**
   * Gives resolved media a `sourceUrl` under the API base URL that site builds
   * fetch originals from for image variants (default `true`).
   */
  readonly optimizeImages?: boolean;
  /** Called once for each newly assembled view; 304 and repeated renders reuse diagnostics. */
  readonly onLinkDiagnostics?: (diagnostics: LinkDiagnostics) => void;
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
  /** Builds build source URLs; absent when image optimization is off. */
  readonly sourceClient?: LaceClient;
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
      ...(options.optimizeImages === false
        ? {}
        : { sourceClient: client(baseUrl, "LACE_API_BASE_URL") }),
    };
  }

  function mismatch(expected: number, received: number | undefined, cause?: unknown): never {
    failure(
      "version_mismatch",
      `The published content changed during the site build: expected version ${expected}, received ${received === undefined ? "a newer version" : received}. Start the build again.`,
      cause,
    );
  }

  async function read(etag?: EntityTag): Promise<ExportRead> {
    const configuration = resolveConfiguration();
    const expected = configuration.expectedVersion;
    let result;
    try {
      result = await configuration.client.getBuildExport({
        ...(etag === undefined ? {} : { etag }),
        // A pinned build fails fast instead of restarting on a newer version.
        ...(expected === undefined
          ? {}
          : {
              onFirstPage: (page) => {
                if (page.version !== expected) mismatch(expected, page.version);
              },
              restart: false,
            }),
      });
    } catch (error) {
      if (
        error instanceof LaceHttpError &&
        error.status === 409 &&
        error.code === "BUILD_EXPORT_VERSION_CHANGED"
      ) {
        const actual = error.details?.actualVersion;
        if (expected !== undefined)
          mismatch(expected, typeof actual === "number" ? actual : undefined, error);
        failure(
          "version_mismatch",
          "The published content kept changing during the build export. Start the build again once publishing has settled.",
          error,
        );
      }
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
      if (error instanceof LaceLinkManifestError)
        failure("invalid_export", "The build export has an invalid internal-link manifest.", error);
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
    if (expected !== undefined && version !== expected) mismatch(expected, version);
    const { indexing, mediaClient, publicMediaOrigin, siteUrl, sourceClient } = configuration;
    const site: PublishedSite = assembleSiteView({
      exported: result.export,
      indexing,
      siteUrl,
      media: Object.values(result.export.media).map((item) => ({
        ...item,
        url: publicMediaOrigin ? mediaClient.getPublicMediaUrl(item.id) : item.url,
        ...(sourceClient === undefined
          ? {}
          : { sourceUrl: sourceClient.getPublicMediaUrl(item.id) }),
      })),
      missingMediaUrl: mediaClient.getPublicMediaUrl,
      failure: (message, cause) => failure("invalid_export", message, cause),
    });
    options.onLinkDiagnostics?.(site.linkDiagnostics);
    return { changed: true, etag: result.etag, site };
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
