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
import type { RichTextElementDescription, RichTextSource } from "@lacecms/render";

interface ServerGlobals {
  readonly document?: unknown;
  readonly process?: { readonly env?: PublishedSiteEnvironment };
  readonly window?: unknown;
}

const runtime = globalThis as ServerGlobals;

// The loader reads LACE_BUILD_TOKEN; refuse to exist in a client bundle.
if (runtime.window !== undefined || runtime.document !== undefined) {
  throw new Error(
    "@lacecms/astro is server-only: import it from Astro frontmatter or server modules, never from client scripts.",
  );
}

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
    environment: options.env ?? runtime.process?.env ?? {},
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

/** Props an override component receives; its rendered children arrive in the default slot. */
export interface RichTextOverrideProps {
  readonly element: RichTextElementDescription;
}

/** An Astro component (or compatible function) that renders one rich-text element. */
export type RichTextOverride = (props: RichTextOverrideProps) => unknown;

/** Override components keyed by the originating rich-text node or mark name. */
export type RichTextComponents = Readonly<Partial<Record<RichTextSource, RichTextOverride>>>;

export {
  blurredPlaceholder,
  createPlaceholderResolver,
  IMAGE_PLACEHOLDER_WIDTH,
  IMAGE_VARIANT_WIDTHS,
  laceImageConfig,
  prepareLaceImage,
  variantWidths,
  webpHasAlpha,
} from "./images.js";
export type {
  LaceGetImage,
  LaceImageConfig,
  LaceImageService,
  LaceRemotePattern,
  PlaceholderResolver,
  PlaceholderResolverOptions,
  PlaceholderSource,
  PreparedLaceImage,
  PrepareLaceImageOptions,
} from "./images.js";
