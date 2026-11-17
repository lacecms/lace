import { createPublishedSiteLoader, renderRobotsTxt, renderSitemapXml } from "@lacecms/sdk";
import type {
  LaceFetch,
  PublishedSite,
  PublishedSiteEnvironment,
  PublishedSiteErrorCode,
  PublishedSiteLoader,
  LinkDiagnostics,
  SitemapOptions,
} from "@lacecms/sdk";

import { environment } from "./environment.js";

export interface AstroSiteLoaderOptions {
  /** Defaults to `process.env`; sites pass `{ ...import.meta.env, ...process.env }`. */
  readonly env?: PublishedSiteEnvironment;
  /** Revalidates the export on every call; pass `import.meta.env.DEV`. */
  readonly dev?: boolean;
  readonly fetch?: LaceFetch;
  /** Extra text appended to failures with the matching code, such as project commands. */
  readonly hints?: Readonly<Partial<Record<PublishedSiteErrorCode, string>>>;
  /** Gives resolved media a build source for image variants (default `true`). */
  readonly optimizeImages?: boolean;
  readonly onLinkDiagnostics?: (diagnostics: LinkDiagnostics) => void;
}

/** Creates the server-only published-site loader for an Astro site. */
export function createAstroSiteLoader(options: AstroSiteLoaderOptions = {}): PublishedSiteLoader {
  return createPublishedSiteLoader({
    environment: options.env ?? environment,
    revalidate: options.dev === true,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    ...(options.hints === undefined ? {} : { hints: options.hints }),
    ...(options.optimizeImages === undefined ? {} : { optimizeImages: options.optimizeImages }),
    ...(options.onLinkDiagnostics === undefined
      ? {}
      : { onLinkDiagnostics: options.onLinkDiagnostics }),
  });
}

const missingSiteUrlWarning =
  "[lace] LACE_BUILD_SITE_URL is not set: sitemap.xml is not generated, and pages have no canonical URL or og:url.";

/**
 * The `sitemap.xml` endpoint response. Without a site URL it has no body, so a
 * static build writes no file, and a build warning names `LACE_BUILD_SITE_URL`.
 */
export function sitemapResponse(site: PublishedSite, options?: SitemapOptions): Response {
  const xml = renderSitemapXml(site, options);
  if (xml === undefined) {
    console.warn(missingSiteUrlWarning);
    return new Response(null, { status: 404 });
  }
  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
}

/** The `robots.txt` endpoint response; it disallows everything when indexing is off. */
export function robotsResponse(site: PublishedSite): Response {
  return new Response(renderRobotsTxt(site), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
