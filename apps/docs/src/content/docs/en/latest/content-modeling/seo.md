---
title: SEO and search indexing
description: Configure search metadata, indexing, canonical URLs and sitemaps.
---

Lace stores SEO settings with each page or collection entry. The site resolves
those settings when it builds; publishing content and deploying the resulting
site are separate steps. SEO is optional per routable model and globals can
provide site-wide defaults. These features require matching CMS, SDK and Astro
packages and a site that uses the Lace SEO helpers.

## Enable SEO and set defaults

In `lace.config.ts`, add `seo: true` to a page, or map a collection's own
fields as fallbacks. At most one global may declare `seoDefaults`:

```ts
definePage({
  key: "home",
  version: 2,
  path: "/",
  label: "Home",
  blocks: ["hero", "richText"],
  seo: true,
});
defineCollection({
  key: "articles",
  version: 2,
  route: "/articles/:slug",
  label: "Articles",
  fields: { summary: field.textarea(), cover: field.media() },
  blocks: ["richText"],
  seo: { description: "summary", image: "cover" },
});
defineGlobal({
  key: "settings",
  version: 1,
  label: "Site settings",
  fields: {
    siteName: field.text({ required: true }),
    description: field.textarea(),
    image: field.media(),
  },
  seoDefaults: { siteName: "siteName", description: "description", image: "image" },
});
```

These are definitions within the `content` array; import the builders and
register the blocks as in [Define your content](../). When adding SEO to an
existing model, increase its version and [synchronize](../synchronization/).
Publish the settings global so its defaults are available to site builds. The
starter already provides SEO on Home and Posts and a settings global.

## Edit metadata

The SEO card in an enabled page or collection entry provides title,
description, image, canonical URL and **Hide from search engines**. Blank
values inherit where a fallback exists. Save the draft, publish it, then build
and deploy the site. The preview is useful guidance, not a guarantee of what a
search engine or social network will display.

- **Title:** the entry's SEO title wins; otherwise the entry title uses the
  site's title template and site name. The default is `Page title | Site name`,
  or just the page title without a site name. A custom template can be mapped
  from a global text field using `seoDefaults.titleTemplate`; it must contain
  `%s` for the page title.
- **Description and image:** entry SEO override, then the model's mapped field,
  then the published global's default. Missing values are omitted.
- **Canonical:** an explicit absolute HTTP(S) URL, otherwise the public site
  URL plus the entry path. Use it when a different URL is the preferred version.
- **Indexing:** enabling **Hide from search engines** emits `noindex, follow`
  and removes the entry from the generated sitemap.

Recommended title and description lengths are 60 and 160 characters; hard
limits are 200 and 500 Unicode code points respectively. Canonical URLs cannot
contain credentials or a fragment. A noindex page remains publicly reachable:
this is a crawler instruction, not access control.

## Sitemap and robots.txt

The starter site includes `sitemap.xml` and `robots.txt` routes and renders
`LaceSeo` in its layout. Set `LACE_BUILD_SITE_URL` to the site's public
absolute URL in the **site build environment**, for example
`https://example.com`. Without it, no sitemap is generated and automatic
canonical URLs are unavailable. Give the Worker/API the same public URL if
Admin's links to the site should use it too.

The sitemap lists published entries with paths, excluding entries marked
noindex and entries whose explicit canonical differs from their own URL. It
includes publication dates as `lastmod`. The default includes all published
entries; if a custom site renders only some of them, pass an `include` filter
to `sitemapResponse` so the sitemap lists only real routes. `robots.txt` names
the sitemap when the site URL is configured. Verify the deployed
`/sitemap.xml`, `/robots.txt`, and page HTML after the next build.

For staging, set `LACE_SITE_INDEXING=off` in the site build environment. The
standard helper emits `noindex, nofollow` and `robots.txt` disallows crawling.
This is not access control. In the current implementation the sitemap helper
can still generate XML when indexing is off; do not treat its presence as a
privacy boundary. Indexing defaults to `on` when the setting is absent.

For an existing or custom site, add the SEO component to the layout and the
sitemap/robots endpoints to Astro yourself; a model configuration alone does
not create them. See [Astro integration](../../astro-integration/) and the
site-owned starter files for the integration.
