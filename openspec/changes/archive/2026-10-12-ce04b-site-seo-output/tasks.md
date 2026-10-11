## 1. Architecture and roadmap

- [x] 1.1 Update `docs/mvp-architecture.md` and verify the text matches the spec deltas and `pnpm format:check` passes:
  - section 8 (SEO metadata): the resolver output, the `og:type` prop, robots for indexing off, and the sitemap exclusions;
  - section 9.8: the builder's optional `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING`;
  - section 13.2: the new loader settings and the view members `url`, `indexing`, `urlFor`, `allEntries` and `seo`, plus `resolveSeo`, `renderSitemapXml` and `renderRobotsTxt`;
  - section 13.4: `LaceSeo.astro`, `sitemapResponse` and `robotsResponse`;
  - section 13.7: the layout head and the two endpoint files.
- [x] 1.2 Add a "Site output (CE4B)" note to ADR 0011 recording design D1–D4: the setting names, the template rules, image-only media, `noindex, nofollow` for indexing off, the sitemap exclusions and that Astro `site` is not set. Verify links resolve and `pnpm format:check` passes.

## 2. SDK

- [x] 2.1 Loader settings in `packages/sdk/src/published-site.ts`:
  - add `siteUrl` and `indexing` options, and read `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING`;
  - validate and normalize them per design D1, with `missing_configuration` messages that name the setting and never echo the value;
  - add `url`, `indexing`, `urlFor(path)` and `allEntries()` to `PublishedSite`.

  Add tests to `published-site.test.mjs` for:
  - precedence of the explicit options;
  - blank values;
  - every rejected URL form (relative, `ftp:`, credentials, query, fragment, bare `?`);
  - indexing `on`, `off` and an invalid value;
  - base-path joining and the home path;
  - `allEntries()` order without globals;
  - revalidate mode keeping the settings of its read.

  Verify with `pnpm --filter @lacecms/sdk test`.
- [x] 2.2 Add `packages/sdk/src/seo.ts` with:
  - `ResolvedSeo`, `SeoResolverInput`, `seoText` and `resolveSeo`, per design D2;
  - a function replacer for the template;
  - image-only media;
  - the robots rules.

  Keep the export `seo` section in `buildSite` and add `site.seo(entry)`, which reads the defaults global once per view. Export the new API from `src/index.ts`. Add `seo.test.mjs` with one case per scenario of the "SDK resolves entry SEO" requirement, plus a `site.seo()` case against an export with and without `seo.defaults`. Verify with `pnpm --filter @lacecms/sdk test` and typecheck.
- [x] 2.3 Add `renderSitemapXml(site, { include? })` and `renderRobotsTxt(site)` per design D3, with XML escaping. Add tests for every scenario of the sitemap and robots requirement, plus escaping of `&` in a path. Verify with `pnpm --filter @lacecms/sdk test`.

## 3. Astro adapter

- [x] 3.1 Add `packages/astro/src/LaceSeo.astro` (props `seo: ResolvedSeo` and `type?: "website" | "article"`) rendering the tags of design D4 in a fixed order without `set:html`. Add `./LaceSeo.astro` to `package.json` `exports`, and update the packaging test in `src/index.test.mjs` for the export list and the copied components. Verify with `pnpm --filter @lacecms/astro build` and `pnpm --filter @lacecms/astro test`.
- [x] 3.2 Add `sitemapResponse(site, options?)` and `robotsResponse(site)` to `packages/astro/src/index.ts`, with content types, the bodiless `404` and the single `LACE_BUILD_SITE_URL` warning of design D3. Add tests for status, headers and body with a site URL, the bodiless response, and the warning without one. Verify with `pnpm --filter @lacecms/astro test`.

## 4. Builder

- [x] 4.1 In `apps/builder/src`:
  - `main.ts` reads `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING` (empty means absent) and validates them with a local function per design D5, failing startup with `Invalid builder configuration: <NAME>.`;
  - `BuilderSettings` gains `siteUrl?` and `siteIndexing?`;
  - `runner.ts` adds them to the build environment only when present.

  Extract the validation so it can be tested. Add `runner.test.mjs` cases asserting the build environment with and without the settings, plus validation tests for the accepted and rejected values. Verify with `pnpm --filter @lacecms/app-builder test`.
- [x] 4.2 Add `LACE_BUILD_SITE_URL: ${LACE_BUILD_SITE_URL:-}` and `LACE_SITE_INDEXING: ${LACE_SITE_INDEXING:-}` to the builder service in the root `docker-compose.yml`, and document both in `apps/builder/README.md`. Verify with `docker compose config --quiet` (if Docker is available) and `pnpm format:check`.

## 5. Reference site

- [x] 5.1 Root `lace.config.ts`: apply the SEO options, the `settings` fields, `seoDefaults` and the version bumps of design D6. Update the tests that pin the root models, versions or hashes:
  - `apps/api` content-sync and project-config tests;
  - the platform-node server tests;
  - the platform-cloudflare `worker.test`;
  - the cross-runtime fixtures.

  Verify the affected package tests pass.
- [x] 5.2 Update `apps/site`:
  - `BaseLayout.astro` takes the full `entry` and an optional `type`, and renders `<LaceSeo seo={site.seo(entry)} type={type} />` instead of `<title>`;
  - every page passes its entry, and posts and notes pass `type="article"`;
  - add `src/pages/sitemap.xml.ts` and `src/pages/robots.txt.ts`;
  - fixture mode in `src/lib/lace.ts` passes `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING`;
  - extend `src/fixtures/published-export.json` with the `seo` section, the entry groups and the settings values of design D6.

  Verify with `pnpm --filter @lacecms/app-site typecheck`.
- [x] 5.3 Extend `apps/site/src/fixture-build.test.mjs` with the two builds of the astro-reference-site delta:
  - with `LACE_BUILD_SITE_URL=https://site.example/`: titles, escaped stored title, description, canonical, Open Graph image with dimensions and alt, `noindex, follow` on the note, `sitemap.xml` content and `robots.txt`;
  - without a site URL and with `LACE_SITE_INDEXING=off`: no canonical or `og:url`, `noindex, nofollow` everywhere, no `sitemap.xml`, a disallow-all `robots.txt` and the warning in the build output.

  Keep the existing header and block assertions. Verify with `pnpm --filter @lacecms/app-site test`, then run `tests/existing-astro-site.test.mjs` and `tests/regression-helpers.test.mjs` against the changed fixture.
- [x] 5.4 Update `apps/site/README.md` with the SEO files and the two settings. Verify with `pnpm format:check`.

## 6. Starter template 0.25.0

- [x] 6.1 In `packages/create-lace/templates`:
  - `lace.config.ts`: the starter SEO options, `settings` fields and `seoDefaults` of design D7;
  - `site/src/layouts/BaseLayout.astro`: render `<LaceSeo>`, take the full entry and an optional `type`;
  - pass `type="article"` from `site/src/pages/blog/[slug].astro`;
  - add `site/src/pages/sitemap.xml.ts` and `site/src/pages/robots.txt.ts`.

  Verify the template typechecks through the generated-project acceptance in 6.5.
- [x] 6.2 Deployment files in the template:
  - `docker-compose.yml` builder environment;
  - `.github/workflows/cloudflare.yml` build step (`vars.LACE_BUILD_SITE_URL`, `vars.LACE_SITE_INDEXING`);
  - `.env.example` starter and existing sections (comments for links, canonical URLs, sitemap and the staging switch).

  Verify with the create-lace tests that render these files.
- [x] 6.3 Guides:
  - `templates/docs/lace-astro-site.md`: `site.seo()`, `site.url`, `<LaceSeo>`, the endpoints and adoption for existing sites, keeping `tests/consumer-guides.test.mjs` fixture conventions;
  - `lace-cloudflare.md`: workflow variables and Git-connected Pages environment variables;
  - `lace-operations.md` and `lace-compose-production.md`: the builder settings, staging with `off`, and `robots.txt` only at the host root.

  Verify with `node --test tests/consumer-guides.test.mjs` (or its vitest equivalent) and `pnpm format:check`.
- [x] 6.4 Upgrade: set `TEMPLATE_VERSION` to `0.25.0`, and update `.lace/upgrade-instructions.json` with the template version, the three `0008` `database` entries and the "Template 0.25.0: …" `configuration` entry of design D7. Update `packages/create-lace/src/index.test.mjs` and `packages/cli/src/upgrade-command.test.mjs`. Verify both packages' tests pass and `scripts/template-upgrade-acceptance.mjs` (or its test) shows a 0.24.0 project upgrading with user-owned files unchanged.
- [x] 6.5 Extend `starterJourney` in `scripts/generated-project-acceptance.mjs` per design D8 and the generated-project-acceptance delta. Regenerate `tests/fixtures/generated-project/*.json` with `node scripts/generated-project-acceptance.mjs snapshots --update`, and verify `tests/generated-project-acceptance.test.mjs` and `pnpm acceptance:starter` pass.

## 7. Documentation

- [x] 7.1 Update:
  - `docs/compatibility.md`: template `0.25.0`, the additive SDK and adapter API, the new site build settings and starter adoption;
  - `docs/node-api.md` and `docs/cloudflare-worker.md`: `LACE_BUILD_SITE_URL` now also drives site canonical URLs and the sitemap when passed to the site build;
  - `docs/content-editor-roadmap.md`: the CE4 status stays `in progress`.

  Verify with `pnpm format:check`.

## 8. Verification

- [x] 8.1 Run the narrowest package tests, then:
  - root `pnpm test`, `pnpm typecheck` (use `--concurrency=1` if the known cold-cache race appears), `pnpm lint` and `pnpm format:check`;
  - `pnpm acceptance:starter`;
  - `pnpm exec openspec validate ce04b-site-seo-output --type change --strict`.

  Record any environment-limited step and why it was skipped.

## Verification notes

- 2026-10-12: root `pnpm test` (40/40 tasks plus 27 root test files), `pnpm turbo run typecheck --concurrency=1` (35/35), `pnpm lint`, `pnpm format:check`, `pnpm openapi:check`, `pnpm acceptance:starter`, the template upgrade phase (`node scripts/generated-project-acceptance.mjs upgrade`), the generated-project snapshot check and `openspec validate ce04b-site-seo-output --type change --strict` passed. `docker compose config` resolves both new builder settings when the required variables are supplied.
- Groups 2–6 were implemented before the documentation tasks of group 1 so the architecture text describes the delivered API; no behavior differs from the design.
- The astro-reference-site delta was corrected during implementation: a fixture entry with a stored canonical URL on another origin keeps it with and without a site URL, so the scenarios now except that entry.
- Running root `tests/*.test.mjs` files directly with vitest also picks up the copies under `.release-artifacts/`, whose concurrent runs make the temporary-state cleanup test fail; `pnpm test` excludes them, as should manual runs.
