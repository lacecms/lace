## Context

CE4A (archived as `2026-10-12-ce04a-seo-data-contract`) delivers everything a
site needs to compute SEO metadata, but nothing consumes it yet:

- every public and export entry of an SEO-enabled model carries
  `seo: {title, description, image, canonical, noindex}`, with `null` for
  unset values;
- the build export carries
  `seo: { defaults: {modelKey, siteName, titleTemplate, description, image} | null, models: { [modelKey]: {description, image} } }`,
  whose values are field keys;
- SEO images, mapped media fields and the defaults image are ordinary media
  references, so the export's media dictionary already resolves them.

The current site-side state:

- `@lacecms/sdk` `createPublishedSiteLoader` builds a frozen `PublishedSite`
  from the export. `PublishedEntry.seo` is passed through, but the export `seo`
  section is parsed and then dropped.
- `@lacecms/astro` has the loader glue, `LaceBlocks.astro` and
  `RichText.astro`. Components are copied to `dist/` by `copy-components.mjs`
  and listed in `package.json` `exports`.
- The VPS builder (`apps/builder/src/runner.ts`) runs `astro build` with a
  fixed environment: `LACE_SITE_DATA_MODE`, `LACE_API_BASE_URL`,
  `LACE_BUILD_TOKEN`, `LACE_EXPECTED_PUBLISHED_VERSION` and an optional
  `LACE_PUBLIC_BASE_URL`, all read by `main.ts` from its own environment.
- `LACE_BUILD_SITE_URL` exists only on the API and Worker side (CE2B, for
  "Open on site"). It is parsed by `parseBuildSiteIdentity` (normalized to a
  trailing slash, no credentials, query or fragment) and requires the site
  identity.
- Cloudflare sites are built by the generated `.github/workflows/cloudflare.yml`
  or by a Git-connected Pages project. Neither receives a site URL today.
- Starter and reference `BaseLayout.astro` emit a bare `<title>` from a
  `title` prop and read `site.global("settings")` for the header.
- An Astro 7 static build writes no file for an endpoint whose `Response` has
  no body (`generate.js`: `if (!response.body) return null`). The blog
  route's `new Response(null, { status: 404 })` already relies on this.

## Goals / Non-Goals

**Goals:**

- One resolver, a pure function in the SDK that adapters and CE4C reuse.
- Site URL and indexing reach the build the same way on every deployment
  path (builder, Pages workflow, Git-connected Pages, local `.env`), under the
  names operators already know.
- Head, sitemap and robots output that is correct with and without a site URL.

**Non-Goals:**

- Adding a Lace Astro integration or setting Astro's `site` option.
- Validating SEO values again on the site; the API already enforces them.
- Truncating descriptions or titles. Search engines truncate; the admin warns
  (CE4C).

## Decisions

### D1. The site URL and indexing are loader settings named like the operator settings

The loader reads `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING` from its
environment record, with explicit `siteUrl` and `indexing` options taking
precedence. This keeps CE2B's single name for the public site base URL: the
operator sets one value in `.env`, and Compose hands it to both the API and
the builder.

- **Validation.** The rules match `parseBuildSiteIdentity`: no `?` or `#`
  characters, a parsable absolute `http:`/`https:` URL, no username or
  password, normalized with a trailing `/`. The SDK cannot import the server,
  so the check is a small SDK function with the same test table. It does not
  require the site identity variables, which belong to the API.
- **Indexing.** `on` or `off` after trimming, compared exactly (lowercase).
  Absent means `on`.
- **Errors.** Both failures are `missing_configuration` and never echo the
  value: a site URL can carry a preview secret in its path.
- **Where it lives.** Configuration is resolved per read, as today, and
  stored on the view: `url`, `indexing`, `urlFor(path)`
  (`new URL(path.replace(/^\/+/u, ""), url).href`, the same join the admin's
  `siteUrlFor` uses) and `allEntries()` (the existing path-sorted listings,
  merged).

*Rejected alternatives:*

- **A new `LACE_SITE_URL` name.** It would be a second name for the same
  operator value and could drift from the admin links.
- **Reading Astro's `site`.** Astro only sees it when `astro.config` sets it,
  `.env` files are not loaded into `astro.config`, and other frameworks would
  need their own path. The SDK value works in `astro dev` from `.env` as well.

### D2. A pure resolver in `packages/sdk/src/seo.ts`, bound on the site view

`resolveSeo(input)` takes `{ entry, mapping, defaults, image, siteUrl,
indexing }`:

- `entry` is `title`, `path`, `fields` and `seo?`;
- `mapping` is the model's `{description, image}` or `undefined`;
- `defaults` is `{siteName?, titleTemplate?, description?, image?}`,
  already read as strings and media IDs from the published defaults global,
  or `undefined`;
- `image(id)` returns a `PublishedImage`.

The function returns the frozen `ResolvedSeo`
`{title, description?, image?, canonical?, robots?, siteName?}` and reads
nothing else, so every fallback step is unit-tested without a loader.
`buildSite` keeps the export's `seo` section. `site.seo(entry)` looks up the
mapping by `entry.modelKey` and the defaults global by
`seo.defaults.modelKey`. It reads the mapped field keys from
`global.fields` once per view, using the same text normalization, and
passes the site's own `image` lookup.

Text normalization (`seoText`) accepts only strings, replaces `\s+` with one
space, trims, and treats an empty result as absent. The stored SEO title and
description are already single-line and trimmed by the domain, so the same
function is harmless on them.

The title template uses `template.replace("%s", () => title)`, a function
replacer, so `$&` and `$1` in titles stay literal. A template without `%s`
is treated as absent and the default template applies. A literal
`{siteName}` placeholder is not supported in custom templates; owners write
the name.

An image counts only when `image(id)` resolves it and its `mimeType`
starts with `image/`. Otherwise the next step is tried. This covers a mapped
media field that holds a PDF and a missing dictionary entry. The image alt is
`effectiveAltText(null, media.alt)`, the media alt or `""`, through the
existing `image()` lookup without a usage alt.

`robots`: indexing off gives `noindex, nofollow` (staging should be neither
indexed nor crawled through), and otherwise a stored `noindex` gives
`noindex, follow` as owner decision 3 states.

`og:type` is not part of `ResolvedSeo`. The export does not carry the model
kind, and a page's type is a presentation choice, so the head component takes
it as a prop.

*Rejected alternatives:*

- **Resolving inside `buildSite` for every entry.** It is eager work, and
  CE4C needs the function without a site view.
- **Exposing per-step provenance** ("from site default") for the admin
  placeholders. CE4C can add it when it needs it, without changing this
  output.

### D3. Sitemap and robots text in the SDK, responses in the adapter

`renderSitemapXml(site, { include? })` and `renderRobotsTxt(site)` are
framework-neutral free functions over the public `PublishedSite` surface
(`url`, `indexing`, `urlFor`, `allEntries`). They are not methods, so the view
stays a data view.

- **Exclusions.** The sitemap skips `seo.noindex` entries and entries with
  a stored canonical different from `site.urlFor(entry.path)`. Search engines
  expect sitemaps to list canonical URLs only, and listing a duplicate page
  that points elsewhere sends mixed signals.
- **Format.** XML is built by string concatenation with an `escapeXml` for
  `& < > " '`. `lastmod` is the export's ISO `publishedAt`, which is a valid
  W3C datetime. Entries come from `allEntries()`, so the order is
  deterministic.
- **Robots.** The text is newline-terminated:
  `User-agent: *\nAllow: /\n` plus `\nSitemap: <url>\n`, or
  `User-agent: *\nDisallow: /\n` when indexing is off. Indexing off drops the
  `Sitemap:` line but still lets the sitemap endpoint render. Nothing points
  to that sitemap, and keeping the endpoint simple avoids a third state.

`@lacecms/astro` adds `sitemapResponse(site, options?)` and
`robotsResponse(site)` to its server module.

- **Without a site URL.** `sitemapResponse` returns
  `new Response(null, { status: 404 })`, which writes no file in a static
  build, and calls `console.warn` with a fixed message naming
  `LACE_BUILD_SITE_URL`. One warning per build is enough: the endpoint renders
  once.
- **Starter and reference sites** add `src/pages/sitemap.xml.ts` and
  `src/pages/robots.txt.ts` as two-line `GET` endpoints that call `getSite()`.

*Rejected alternatives:*

- **An empty `urlset` without a site URL.** It contradicts owner decision 4,
  "no sitemap is generated".
- **Throwing without a site URL.** Local and preview builds must succeed
  without it.

### D4. `LaceSeo.astro` renders a resolved value

`<LaceSeo seo={site.seo(entry)} type="article" />` renders the tags of the
astro-adapter delta in a fixed order, using Astro attribute and text escaping
(never `set:html`).

- **Twitter.** `twitter:card` is `summary_large_image` with an image and
  `summary` without one. No `twitter:title` or `twitter:image` tags: X falls
  back to Open Graph.
- **Open Graph title.** `og:title` repeats the document title. One value
  keeps the output predictable; a separate social title can come later
  without breaking this.
- **Image tags.** `og:image:width` and `og:image:height` are emitted only
  when the media dimensions are known, and `og:image:alt` always appears with
  an image (possibly empty). Image URLs are absolute because media URLs come
  from the API public base (CE3C).
- **Wiring.** The component only takes props; the layout calls
  `site.seo(entry)`. `BaseLayout` therefore takes the full `PublishedEntry` and
  an optional `type`, and drops its `title` prop.
- **Testing.** Components are exercised by the reference fixture build test
  and the starter acceptance, as `LaceBlocks` is today.

*Rejected alternative:* a component that takes `site` and `entry`. It is more
convenient, but it hides the resolved value from layouts that want to adjust
it (for example to append a page number).

### D5. The builder validates and forwards both settings

`main.ts` reads `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING`, treats empty
values as absent, and validates them with the same rules as D1 (a small local
function: the builder has no Lace dependencies). It throws
`Invalid builder configuration: <NAME>.` before listening. `BuilderSettings`
gains `siteUrl?` and `siteIndexing?`, and `runner.ts` adds them to the fixed
build environment only when present. The trigger contract is unchanged.

Compose, both the root `docker-compose.yml` and the template, adds
`LACE_BUILD_SITE_URL: ${LACE_BUILD_SITE_URL:-}` and
`LACE_SITE_INDEXING: ${LACE_SITE_INDEXING:-}` to the builder service. The
generated Pages workflow adds both from `vars`. Git-connected Pages projects
set them as Pages environment variables, which the guide documents.

*Rejected alternative:* the API sending the site URL in the build request.
The trigger is a closed contract, and request data must never select
environment values.

### D6. Reference site and root configuration

The root `lace.config.ts`:

- `home` 3→4, `about` 2→3 and `posts` 3→4 get `seo: true`;
- `notes` 2→3 gets `seo: { description: "summary" }`;
- `settings` 1→2 gains `titleTemplate` (text), `description` (textarea) and
  `image` (media), and declares `seoDefaults` for all four.

Version bumps follow the structural rules. Enabling SEO is structural
(CE4A), and so is adding fields. `seoDefaults` alone would be projection-only.

- **Fixture export.** `apps/site/src/fixtures/published-export.json` gains:
  - the `seo` section;
  - `seo` groups on the four entries: a stored title with `&` and `<` on
    the post to prove escaping, `noindex` on the note, a canonical on
    `about` that points to another origin, and nulls on home;
  - settings values for the new fields, with `image` pointing to the
    existing `hero-media`.
- **Fixture mode.** `apps/site/src/lib/lace.ts` passes `LACE_BUILD_SITE_URL`
  and `LACE_SITE_INDEXING` through.
- **Tests.** `fixture-build.test.mjs` builds twice: with
  `LACE_BUILD_SITE_URL`, and without it but with `LACE_SITE_INDEXING=off`. It
  asserts the head tags, `sitemap.xml` and `robots.txt` per the
  astro-reference-site delta.
- **Ripple.** Tests that pin the root model list or versions (API
  content-sync and Node server tests, the Worker test, the cross-runtime
  fixture) are updated as in CE5B.

### D7. Starter template `0.25.0`

- **Configuration.** The starter starts at version 1, so new projects need
  no bump. It adds `seo: true` on `home`,
  `seo: { description: "summary" }` on `posts`, and `description`
  (textarea, "Site description") and `image` (media, "Share image") on
  `settings`, with
  `seoDefaults: { siteName: "siteName", description: "description", image: "image" }`.
  No `titleTemplate` field: the default `%s | {siteName}` is the right
  starter behavior, and a smaller settings form is easier to understand.
- **Site.** `BaseLayout` renders `<LaceSeo>`, `blog/[slug].astro` passes
  `type="article"`, and the sitemap and robots endpoints are added.
- **Deployment files.** `.env.example` (starter and existing modes) documents
  `LACE_BUILD_SITE_URL` for links, canonical URLs and the sitemap, and
  `LACE_SITE_INDEXING=` (empty means `on`; `off` for staging). Compose and
  the Pages workflow change as in D5.
- **Guides.**
  - `docs/lace-astro-site.md` (managed) documents the SEO API for starter and
    existing sites. Code blocks headed by a "`path`:" line are fixture files
    for `tests/consumer-guides.test.mjs`, so the new snippets either follow
    that format with real paths or use plain prose headings.
  - `lace-cloudflare.md`, `lace-operations.md` and
    `lace-compose-production.md` document the settings.
- **Upgrade instructions.**
  - `database` entries for `0008` (additive; rollback keeps working; Compose
    and Cloudflare sequences in the existing wording).
  - One `configuration` entry "Template 0.25.0: …" for the SEO options, the
    version bump and sync, the build settings and manual adoption.
- **Tests.** `TEMPLATE_VERSION`, the create-lace index test, the CLI upgrade
  test and the generated-project snapshots are updated.

### D8. Acceptance

`starterJourney` in `scripts/generated-project-acceptance.mjs` already builds
twice (with and without the global):

- **First build.** It adds `LACE_BUILD_SITE_URL` and a post `seo` group to
  the served export, plus the export `seo` section, and asserts the
  generated-project-acceptance delta.
- **Second build.** Without a site URL, it asserts the absence of the
  canonical link and `sitemap.xml`.

No third build is added; indexing `off` is covered by the reference fixture
build and the SDK unit tests.

## Risks / Trade-offs

- [`robots.txt` under a base path is ignored by crawlers] → The guides state
  that it only works at the host root and that sites under a path must
  publish robots rules at the root themselves.
- [The production site URL in a local `.env` makes `astro dev` emit
  production canonicals] → This is harmless: dev output is not deployed. The
  `.env.example` comment explains it.
- [Changing the root configuration ripples through pinned model expectations
  in several test suites] → Update them in the same task and run the root
  test suite. CE5B and CE4A met the same ripple.
- [Sites with more than 50,000 published entries exceed one sitemap file] →
  This is out of scope and noted in the guide. The export size limits make it
  unlikely for alpha sites.
- [Existing sites must adopt the layout and endpoints by hand] → The upgrade
  instructions and the Astro guide give copyable files, and nothing breaks
  without adoption: the previous `<title>` keeps working.
- [The `og:image` URL points to the API public media route, not the site
  origin] → Social crawlers accept cross-origin absolute URLs. Sites that
  configure `LACE_PUBLIC_BASE_URL` keep their own media origin.

## Migration Plan

- No database or REST change. Sites need the matching SDK and adapter
  versions, which ship in the same release set.
- Operators add `LACE_BUILD_SITE_URL` (often already set for "Open on site")
  and optionally `LACE_SITE_INDEXING=off` on staging, then recreate the
  builder container or set the Pages variables.
- Owners of existing projects follow the `0.25.0` instructions: run migration
  `0008` (CE4A), opt models into `seo` with a version bump, run sync, and copy
  the layout and endpoint changes.
- Rollback: older SDKs reject the export `seo` key (CE4A note), so the site
  packages roll back together with the API. An older builder image ignores
  the two settings.
