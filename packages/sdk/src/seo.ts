import type { ExportSeoDto, PublicEntryDto, PublicMediaDto, SeoValueDto } from "@lacecms/contracts";

/** A resolved image with the effective alt text of its usage. */
export interface SeoImage extends Readonly<PublicMediaDto> {
  readonly alt: string;
}

/** The fallback fields an SEO-enabled model maps, as the build export names them. */
export type ModelSeoMapping = ExportSeoDto["models"][string];

/** Site defaults read from the published defaults global; values, not field keys. */
export interface SeoDefaultValues {
  readonly description?: string;
  readonly image?: string;
  readonly siteName?: string;
  readonly titleTemplate?: string;
}

/** Everything the resolver reads; it reads nothing else. */
export interface SeoResolverInput {
  readonly defaults?: SeoDefaultValues;
  readonly entry: Readonly<{
    readonly fields: PublicEntryDto["fields"];
    readonly path: string;
    readonly seo?: SeoValueDto;
    readonly title: string;
  }>;
  /** Resolves a media ID to an image with its effective alt text, or `undefined`. */
  readonly image: (mediaId: string) => SeoImage | undefined;
  /** False when the deployment switched indexing off (`LACE_SITE_INDEXING=off`). */
  readonly indexing: boolean;
  readonly mapping?: ModelSeoMapping;
  /** The site base URL ending with `/`, or `undefined` when not configured. */
  readonly siteUrl?: string;
}

/** The search and social metadata of one entry, with fallbacks and site defaults applied. */
export interface ResolvedSeo {
  readonly canonical?: string;
  readonly description?: string;
  readonly image?: SeoImage;
  readonly robots?: "noindex, follow" | "noindex, nofollow";
  readonly siteName?: string;
  readonly title: string;
}

/** Collapses whitespace runs and trims a string value; anything else, or blank text, is absent. */
export function seoText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.replace(/\s+/gu, " ").trim();
  return text === "" ? undefined : text;
}

/** The absolute URL of a public path under a site base URL ending with `/`. */
export function siteUrlFor(siteUrl: string, path: string): string {
  return new URL(path.replace(/^\/+/u, ""), siteUrl).href;
}

function formatTitle(title: string, defaults: SeoDefaultValues | undefined): string {
  const template = seoText(defaults?.titleTemplate);
  // A function replacer keeps `$&` and similar sequences in titles literal.
  if (template?.includes("%s") === true) return template.replace("%s", () => title);
  const siteName = seoText(defaults?.siteName);
  return siteName === undefined ? title : `${title} | ${siteName}`;
}

/**
 * Resolves the SEO fallback chain of one entry (ADR 0011): stored values first,
 * then the model's mapped fields, then the site defaults.
 */
export function resolveSeo(input: SeoResolverInput): ResolvedSeo {
  const { defaults, entry, mapping, siteUrl } = input;
  const stored = entry.seo;
  const field = (key: string | null | undefined): unknown =>
    key === null || key === undefined ? undefined : entry.fields[key];
  const image = (mediaId: unknown): SeoImage | undefined => {
    if (typeof mediaId !== "string" || mediaId === "") return undefined;
    const resolved = input.image(mediaId);
    return resolved?.mimeType.startsWith("image/") === true ? resolved : undefined;
  };
  const description =
    seoText(stored?.description) ??
    seoText(field(mapping?.description)) ??
    seoText(defaults?.description);
  const resolvedImage =
    image(stored?.image) ?? image(field(mapping?.image)) ?? image(defaults?.image);
  const canonical =
    stored?.canonical ?? (siteUrl === undefined ? undefined : siteUrlFor(siteUrl, entry.path));
  const robots = !input.indexing
    ? "noindex, nofollow"
    : stored?.noindex === true
      ? "noindex, follow"
      : undefined;
  const siteName = seoText(defaults?.siteName);
  return Object.freeze({
    ...(canonical === undefined || canonical === null ? {} : { canonical }),
    ...(description === undefined ? {} : { description }),
    ...(resolvedImage === undefined ? {} : { image: resolvedImage }),
    ...(robots === undefined ? {} : { robots }),
    ...(siteName === undefined ? {} : { siteName }),
    title: seoText(stored?.title) ?? formatTitle(entry.title, defaults),
  });
}
