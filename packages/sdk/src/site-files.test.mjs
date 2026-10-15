import { expect, test } from "vitest";
import { createPublishedSiteLoader, renderRobotsTxt, renderSitemapXml } from "../dist/index.js";

const emptySeo = { canonical: null, description: null, image: null, noindex: false, title: null };

function entry(id, modelKey, path, publishedAt, seo) {
  return {
    blocks: [],
    fields: {},
    id,
    modelKey,
    path,
    publishedAt,
    ...(seo === undefined ? {} : { seo }),
    title: id,
  };
}

const value = {
  entries: [
    entry("b", "posts", "/blog/b", "2026-10-03T00:00:00.000Z", {
      ...emptySeo,
      canonical: "https://other.example/b",
    }),
    entry("home", "home", "/", "2026-10-01T00:00:00.000Z", emptySeo),
    entry("a", "posts", "/blog/a", "2026-10-02T00:00:00.000Z", { ...emptySeo, noindex: true }),
    entry("c", "posts", "/blog/c&d", "2026-10-04T00:00:00.000Z", {
      ...emptySeo,
      canonical: "https://example.com/blog/c&d",
    }),
    entry("about", "about", "/about", "2026-10-05T00:00:00.000Z"),
  ],
  globals: [
    {
      blocks: [],
      fields: {},
      id: "settings",
      modelKey: "settings",
      publishedAt: "2026-10-06T00:00:00.000Z",
    },
  ],
  formatVersion: 1,
  media: {},
  seo: { defaults: null, models: {} },
  version: 1,
};

async function loadSite(extra = {}) {
  return createPublishedSiteLoader({
    environment: { LACE_API_BASE_URL: "https://cms.example/", LACE_BUILD_TOKEN: "token", ...extra },
    fetch: async () => Response.json(value, { headers: { etag: '"1"' } }),
  })();
}

function url(location, lastmod) {
  return `  <url>\n    <loc>${location}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>\n`;
}

test("the sitemap lists indexable canonical entries in path order and escapes XML", async () => {
  const site = await loadSite({ LACE_BUILD_SITE_URL: "https://example.com/" });
  expect(renderSitemapXml(site)).toBe(
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      url("https://example.com/", "2026-10-01T00:00:00.000Z") +
      url("https://example.com/about", "2026-10-05T00:00:00.000Z") +
      url("https://example.com/blog/c&amp;d", "2026-10-04T00:00:00.000Z") +
      "</urlset>\n",
  );
});

test("a caller filter keeps only the entries the site renders", async () => {
  const site = await loadSite({ LACE_BUILD_SITE_URL: "https://example.com/" });
  const xml = renderSitemapXml(site, { include: (item) => item.modelKey === "posts" });
  expect(xml.match(/<loc>/gu)).toHaveLength(1);
  expect(xml).toContain("<loc>https://example.com/blog/c&amp;d</loc>");
});

test("without a site URL there is no sitemap and robots names none", async () => {
  const site = await loadSite();
  expect(renderSitemapXml(site)).toBeUndefined();
  expect(renderRobotsTxt(site)).toBe("User-agent: *\nAllow: /\n");
});

test("robots names the sitemap under the site URL", async () => {
  const site = await loadSite({ LACE_BUILD_SITE_URL: "https://example.com/blog/" });
  expect(renderRobotsTxt(site)).toBe(
    "User-agent: *\nAllow: /\n\nSitemap: https://example.com/blog/sitemap.xml\n",
  );
});

test("robots disallows everything when indexing is off", async () => {
  const site = await loadSite({
    LACE_BUILD_SITE_URL: "https://example.com/",
    LACE_SITE_INDEXING: "off",
  });
  expect(renderRobotsTxt(site)).toBe("User-agent: *\nDisallow: /\n");
});
