## Why

CE4A stores per-entry SEO values and ships the fallback mappings in the build
export, but no site uses them yet. Sites still hand-write `<title>`, emit no
description, canonical or Open Graph tags, and have no sitemap or
`robots.txt`. Staging builds cannot be kept out of search engines. Step CE4 of
[`docs/content-editor-roadmap.md`](../../../docs/content-editor-roadmap.md)
closes that gap in session **CE4B — Site output**: the SDK resolves the
fallback chain of [ADR 0011](../../../docs/adr/0011-seo-system-group.md),
`@lacecms/astro` renders the head and the sitemap and robots files, the builder
and the deployment guides pass the site URL and the indexing switch to the
build, and the starter and reference site use all of it.

## What Changes

- **SDK site settings.** The published-site loader reads two more optional
  settings:
  - `LACE_BUILD_SITE_URL` (explicit `siteUrl` option): the public site base URL,
    the same setting the API already uses for "Open on site". It is
    normalized to a trailing slash and validated like the API does.
  - `LACE_SITE_INDEXING` (explicit `indexing` option): `on` (default) or
    `off`.

  An invalid value fails with `missing_configuration` and names the setting.
  The site view gains `url` (or `undefined`), `indexing`, `urlFor(path)` and
  `allEntries()`.
- **SDK SEO resolver.** A pure, exported `resolveSeo()` function and a
  `site.seo(entry)` binding resolve the ADR 0011 chain from the entry, the
  export's `seo` section and the published defaults global:
  - title: the SEO title as is, otherwise the entry title through the title
    template (`%s`; default `%s | {siteName}`, or the bare title without a
    site name);
  - description: the SEO value, then the mapped field, then the site default;
  - image: the SEO image, then the mapped media field, then the site default.
    Only resolved `image/*` media count.
  - canonical: the SEO value, otherwise the site URL plus the path;
  - robots: `noindex, follow` for an entry with `noindex`, and
    `noindex, nofollow` on every page when indexing is `off`.

  The result also carries the site name. It works for every entry; models
  without SEO simply have no stored group.
- **SDK sitemap and robots text.** `renderSitemapXml(site, options?)` lists the
  absolute URL and `lastmod` (from `publishedAt`) of every published entry,
  sorted by path. It leaves out `noindex` entries and entries whose SEO
  canonical points to another URL, and accepts an optional `include` filter.
  Without a site URL it returns `undefined`. `renderRobotsTxt(site)` allows
  everything and names the sitemap when a site URL exists, and disallows
  everything when indexing is `off`.
- **`@lacecms/astro`.**
  - A `LaceSeo.astro` head component renders `<title>`, the description,
    canonical and robots tags, Open Graph (`og:title`, `og:description`,
    `og:image` with width, height and alt, `og:url`, `og:site_name`,
    `og:type`) and `twitter:card` from a resolved SEO value, with an
    optional `type` (`website` by default, `article` for posts).
  - `sitemapResponse()` and `robotsResponse()` turn the SDK text into endpoint
    responses. Without a site URL the sitemap response has no body, so a
    static build writes no `sitemap.xml`, and it logs one build warning.

  No Astro integration is added.
- **Builder and deployments.** The VPS builder reads optional
  `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING`, rejects invalid values at
  startup, and passes them to the fixed site build. The deployment files pass
  both settings to the build:
  - the reference and generated Compose files (builder service);
  - the generated Cloudflare Pages workflow (repository variables).

  The guides document them, including Git-connected Pages projects, local
  site builds and `.env.example`.
- **Reference site** (root configuration and `apps/site`):
  - SEO is enabled on every routable model, and `notes` maps `summary` as its
    description.
  - `settings` gains `titleTemplate`, `description` and `image` fields and
    declares `seoDefaults`. The changed models get version bumps.
  - `BaseLayout` renders `<LaceSeo>`, and `sitemap.xml` and `robots.txt`
    endpoints are added.
  - The export fixture carries SEO values and the `seo` section.
- **Starter template `0.25.0`:**
  - `home` gets `seo: true` and `posts` gets `seo: { description: "summary" }`;
    `settings` gains `description` and `image` with `seoDefaults`.
  - The base layout uses `<LaceSeo>`, posts render as `article`, and
    `sitemap.xml` and `robots.txt` pages are added.
  - Upgrade instructions cover migration `0008`, the new settings and manual
    adoption, because configuration and site files are user-owned.
  - The managed Astro site guide documents the SEO API.
- **Documentation:**
  - architecture sections 8 (SEO), 9.8 (builder settings), 13.2, 13.4
    and 13.7;
  - `docs/compatibility.md`, `docs/node-api.md`, `docs/cloudflare-worker.md`
    and the builder README;
  - the roadmap.

Not in this change:

- the admin SEO section, counters, placeholders and preview (CE4C);
- SEO for globals or non-entry pages;
- `hreflang` or alternates;
- sitemap index files for sites above 50,000 URLs;
- setting Astro's `site` option (sites may still set it themselves);
- resolving fallbacks in REST responses.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `published-site-loader`: the `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING`
  settings; site view `url`, `indexing`, `urlFor()`, `allEntries()` and
  `seo()`; the pure resolver; sitemap and robots text.
- `astro-adapter`: the `LaceSeo` head component, the sitemap and robots
  responses and the packed component list.
- `fixed-command-vps-builder`: optional site URL and indexing settings passed
  to the fixed build.
- `astro-reference-site`: SEO models and defaults, head metadata, sitemap
  and robots routes.
- `project-generator`: template `0.25.0` with starter SEO, deployment
  settings and upgrade instructions.
- `generated-project-acceptance`: the starter builds with and without a
  site URL and checks head tags, sitemap and robots output.

## Impact

- Code:
  - `packages/sdk` (loader settings, site view, `seo.ts` resolver, sitemap and
    robots text);
  - `packages/astro` (`LaceSeo.astro`, response helpers, packaging);
  - `apps/builder` (settings and environment);
  - `apps/site` and the root `lace.config.ts`;
  - `packages/create-lace/templates` (configuration, site, Compose,
    workflow, `.env.example`, docs, upgrade instructions) and `TEMPLATE_VERSION`;
  - `packages/cli` upgrade tests;
  - `scripts/generated-project-acceptance.mjs` and its snapshots;
  - `docker-compose.yml`.
- APIs. The SDK and adapter additions are additive. No REST, database or
  export change.
- Root configuration. The changed models need a version bump and sync, which
  touches the model-list and hash expectations in API, Node and Worker tests.
- Architecture sections 8, 9.8, 13.2, 13.4 and 13.7.
- Depends on CE4A (SEO data and the export `seo` section), CE5 (globals) and
  CE2B (`LACE_BUILD_SITE_URL`). CE4C builds on the same resolver for the admin
  placeholders.
