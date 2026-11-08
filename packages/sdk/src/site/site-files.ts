import type { PublishedEntry, PublishedSite } from "./published-site.js";

export interface SitemapOptions {
  /** Keeps only the entries the site renders; every published entry by default. */
  readonly include?: (entry: PublishedEntry) => boolean;
}

function escapeXml(value: string): string {
  return value.replace(
    /[&<>"']/gu,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[character] ??
      character,
  );
}

/**
 * Renders `sitemap.xml` for the published site: one URL per indexable entry,
 * sorted by path, with `lastmod` from `publishedAt`. Entries marked `noindex`
 * and entries whose canonical URL points elsewhere are left out. Returns
 * `undefined` when no site URL is configured.
 */
export function renderSitemapXml(
  site: PublishedSite,
  options: SitemapOptions = {},
): string | undefined {
  if (site.url === undefined) return undefined;
  const urls: string[] = [];
  for (const entry of site.allEntries()) {
    const location = site.urlFor(entry.path);
    if (location === undefined || entry.seo?.noindex === true) continue;
    const canonical = entry.seo?.canonical ?? null;
    if (canonical !== null && canonical !== location) continue;
    if (options.include !== undefined && !options.include(entry)) continue;
    urls.push(
      `  <url>\n    <loc>${escapeXml(location)}</loc>\n    <lastmod>${escapeXml(entry.publishedAt)}</lastmod>\n  </url>\n`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("")}</urlset>\n`;
}

/**
 * Renders `robots.txt`: everything is allowed and the sitemap is named when a
 * site URL exists; everything is disallowed when indexing is switched off.
 */
export function renderRobotsTxt(site: PublishedSite): string {
  if (!site.indexing) return "User-agent: *\nDisallow: /\n";
  const sitemap = site.urlFor("/sitemap.xml");
  return `User-agent: *\nAllow: /\n${sitemap === undefined ? "" : `\nSitemap: ${sitemap}\n`}`;
}
