# Compatibility baseline

## Status

Lace is pre-release. This document records the initial development baseline;
it is not a promise of production support or backward compatibility.

## Exact versions selected and smoke-tested

The versions below were resolved from their authoritative release channels on
2026-09-07. They are selected as exact versions and will be pinned through the
root pnpm catalog and lockfile. The temporary smoke workspace installs this set
together on Node 24.12.0.

| Component | Exact version | Authoritative source |
| --- | ---: | --- |
| Node.js LTS | 24.12.0 | <https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt> |
| pnpm | 12.3.4 | <https://registry.npmjs.org/pnpm/latest> |
| TypeScript | 7.0.2 | <https://registry.npmjs.org/typescript/latest> |
| Turborepo | 2.10.12 | <https://registry.npmjs.org/turbo/latest> |
| OpenSpec | 1.12.0 | <https://registry.npmjs.org/@fission-ai%2Fopenspec/latest> |
| Oxlint | 1.81.0 | <https://registry.npmjs.org/oxlint/latest> |
| Oxfmt | 0.66.0 | <https://registry.npmjs.org/oxfmt/latest> |
| Hono | 4.13.7 | <https://registry.npmjs.org/hono/latest> |
| Valibot | 1.4.2 | <https://registry.npmjs.org/valibot/latest> |
| Drizzle ORM | 0.45.2 | <https://registry.npmjs.org/drizzle-orm/latest> |
| Better Auth | 1.7.3 | <https://registry.npmjs.org/better-auth/latest> |
| Astro | 7.3.1 | <https://registry.npmjs.org/astro/latest> |
| React and React DOM | 19.2.8 | <https://registry.npmjs.org/react/latest> |
| Vite | 8.2.2 | <https://registry.npmjs.org/vite/latest> |
| Wrangler | 4.129.0 | <https://registry.npmjs.org/wrangler/latest> |
| Vitest | 5.0.0 | <https://registry.npmjs.org/vitest/latest> |
| Playwright | 1.63.0 | <https://registry.npmjs.org/@playwright%2Ftest/latest> |
| better-sqlite3 | 13.0.3 | <https://registry.npmjs.org/better-sqlite3/latest> |

The source URLs identify the release channels used for selection. The committed
lockfile, once created, is the reproducible resolution record.

### Smoke result

On 2026-09-07, a disposable pnpm 12.3.4 workspace on macOS arm64 and Node
24.12.0 installed the exact baseline with a frozen lockfile. The check ran the
OpenSpec, Turbo, Oxlint, Oxfmt, TypeScript, Wrangler, Vitest, and Playwright
CLIs, then imported Astro, Better Auth, Drizzle, Hono, React, Valibot, Vite,
Vitest, and Playwright. It also created an in-memory native `better-sqlite3`
database and loaded Drizzle's `better-sqlite3` adapter successfully.

pnpm 12 blocks lifecycle scripts unless they are explicitly allowed. The smoke
workspace used an `allowBuilds` map for `better-sqlite3`, `esbuild`, `pnpm`, and
`workerd`; Step 1 MUST carry forward the least-privilege allowlist before it
adds packages that require these builds. The temporary workspace and its
dependencies are removed after this result is recorded.

## Supported runtime ranges

These are the intended MVP development targets. A range is a support policy,
not evidence that every member of the range is continuously tested.

| Boundary | Supported range | Notes |
| --- | --- | --- |
| Node.js | 24.x LTS, starting at 24.12.0 | Node runs the VPS API, builder, CLI, and local tooling. |
| pnpm | 12.x | Corepack manages the declared pnpm version. |
| SQLite | 3.35 or later | Node uses `better-sqlite3`; Cloudflare D1 compatibility is verified separately in its runtime milestone. |
| Wrangler | 4.x | Cloudflare development and deployment tooling. |
| Browsers | Current and immediately previous stable Chrome, Edge, Firefox, and Safari | Applies to the future admin SPA; browser-flow coverage is introduced with the admin milestones. |

## CI-used versions

Step 1 configures GitHub Actions CI with Node 24.12.0 and pnpm 12.3.4 through
Corepack. CI restores a pnpm-store cache keyed by operating system, those exact
versions, and `pnpm-lock.yaml`; it does not cache `node_modules`.

Every CI run installs with `pnpm install --frozen-lockfile`, verifies that the
lockfile remains unchanged, then invokes the same root quality commands used
locally: `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`,
`pnpm build`, and `pnpm spec:validate`.

### Dependency-boundary compatibility bridge

`dependency-cruiser` is intentionally not installed, configured, or run in
Step 1: version 18.2.0 supports TypeScript releases below the project-pinned
TypeScript 7.0.2 baseline. The root lint command therefore runs a temporary
TypeScript source-level boundary checker. It rejects forbidden architecture
edges, cycles, cross-package source-path access, and Node built-ins in the
portable `content` and `config` packages.

Replace this checker with dependency-cruiser only after a dependency-cruiser
release supports parsing TypeScript 7 without lowering the project's TypeScript
baseline. That migration must retain the same boundary checks and negative
fixture coverage.

## Alpha release line

Lace artifacts are experimental prereleases on the npm `next` channel. One
release definition (`release/alpha.json`) pins the package, generator and
API/builder image version together with the generator's ownership template
version; mixing artifacts from different versions is unsupported.

| Release | Template | Status | Notes |
| --- | --- | --- | --- |
| `0.1.0-alpha.1` | `0.4.0` | Published 2026-09-30, immutable | Predates environment preparation, doctor, browser setup, the tour, existing-site mode, `lace add block`, `@lacecms/astro`/`@lacecms/render` and the generated Cloudflare Worker |
| `0.1.0-alpha.2` | `0.14.0` | Published 2026-10-04, immutable | Carries the onboarding feedback improvements of Steps 26–31; field-tested by the owner (alpha.2 feedback) |
| `0.1.0-alpha.3` | `0.17.0` | Prepared and accepted locally (Step 33H); npm publication recorded on 2026-10-07 | Carries the alpha.2 field-trial fixes of 33A–33G: block order, weak ETags, builder source diagnostics, seven-status build history with Pages tracking, explicit Cloudflare credentials and preflight, scenario guides and minimum-only engines |
| `0.1.0-alpha.4` | `0.20.0` | Package publication and real VPS/Cloudflare application/recovery checks owner-confirmed 2026-10-10 | Includes completed 34A–34C local verification; see real-application-verification.md for confirmation scope and evidence limits |

The next alpha after `0.1.0-alpha.4` (source template `0.24.0`, not yet
released) changes the public delivery contract: every `/api/v1/public` content
response and the build export return the published entry directly with a
resolved `media` dictionary, without the former mirrored `draft`. The API, the
site packages (`@lacecms/sdk`, `@lacecms/render`, `@lacecms/astro`,
`@lacecms/content`) and the admin must come from the same release; sites built
with `getSite()` and `LaceBlocks` keep working, while code that reads REST
responses or the raw export must be updated. The same release requires
migrations `0005_content_model_structure` and `0006_media_descriptive_metadata`
and a configuration sync after raising the version of every model that allows
the version 2 `image` block, as the `0.23.0` upgrade instructions state.

The same next alpha adds route-less `global` models (CE5,
[ADR 0010](adr/0010-global-models.md)): a new anonymous
`GET /api/v1/public/globals/:modelKey` route, an additive `globals` key in the
build export (the SDK treats a missing key as empty, so older exports stay
valid; older SDKs reject the new key because the export schema is strict), and
`kind: "global"` in admin model and entry DTOs. It requires migration
`0007_content_model_global_kind`, a table rebuild of `content_models`; back up
before migrating, because rolling back after a global exists means restoring
that backup. Template `0.24.0` delivers the `0007` upgrade steps and adds an optional
`settings` global (`siteName`, `tagline`) to new projects' `lace.config.ts`;
new starter layouts read it through `site.global("settings")` with static
fallbacks. Existing projects adopt it by hand, because configuration and site
files are user-owned.

The same next alpha adds per-entry SEO data (CE4A,
[ADR 0011](adr/0011-seo-system-group.md)). Pages and collections opt in with
`seo` in `lace.config.ts` (a structural change: raise the model version and
run configuration sync), one global may declare `seoDefaults`, and disabling
SEO with stored values needs the temporary `removedSeo: true` hint (otherwise
sync refuses with `SEO_REMOVAL_HAS_DATA`). Contract additions:

- admin draft and published snapshot DTOs and public entries carry
  `seo: {title, description, image, canonical, noindex}` for SEO-enabled
  models; create and save requests accept an optional, nullable `seo`, and a
  non-null `seo` for a model without SEO fails with `422 seo_not_allowed`;
- admin model DTOs carry `seo` (fallback fields) or `seoDefaults`;
- the build export gains a `seo` section (`{models, defaults}`); a missing
  section validates as empty, and older SDKs reject the new key because the
  export schema is strict;
- admin media usage locations gain `{source: "seo", field: "image"}`.

It requires migration `0008_content_snapshot_seo` (an additive column). The
SDK passes stored values through as `PublishedEntry.seo`.

The same next alpha adds the site output (CE4B, source template `0.25.0`). The
additions are additive and need no REST or database change:

- `@lacecms/sdk`: `site.seo(entry)`, `site.url`, `site.indexing`,
  `site.urlFor(path)` and `site.allEntries()`; the exported `resolveSeo`,
  `renderSitemapXml` and `renderRobotsTxt`; the loader reads the optional
  `LACE_BUILD_SITE_URL` and `LACE_SITE_INDEXING` (or the `siteUrl` and
  `indexing` options), and an invalid value fails with
  `missing_configuration`;
- `@lacecms/astro`: `@lacecms/astro/LaceSeo.astro`, `sitemapResponse` and
  `robotsResponse`;
- the VPS builder forwards the two optional settings to the site build and
  refuses invalid values at startup; the generated Compose builder service and
  Cloudflare Pages workflow pass them.

Template `0.25.0` enables SEO on the starter `home` and `posts` models, adds
`description` and `image` with `seoDefaults` to the starter `settings` global,
renders `<LaceSeo>` in the starter layout and adds `sitemap.xml` and
`robots.txt` endpoints. Its upgrade instructions carry the `0008` steps; existing
projects adopt the configuration and site files by hand, and nothing breaks
without adoption.

The same next alpha changes the block contract (CE6A,
[ADR 0012](adr/0012-block-envelope.md)). Every block gains an envelope
beside its data:

- admin draft and published snapshot DTOs return each block with `hidden`
  and `settings` and, when set, `anchor` and `className`; create and save
  requests accept all four as optional values that default (visible, no
  anchor or class, declared setting defaults), so clients that omit them keep
  working, but a save still replaces the whole draft including envelopes;
- public entries, public globals and the build export leave hidden blocks out
  and return each block as `{key, type, schemaVersion, position, anchor?,
  className?, settings, data}` with no `hidden` key; a missing `settings`
  validates as `{}`, and older SDKs reject the new keys because public
  parsing is strict;
- media referenced only by hidden blocks are left out of the public `media`
  dictionary and the public media route, while their usage and deletion guard
  are unchanged;
- block metadata in model DTOs may carry `settings`;
- new `422` issue codes: `invalid_block_anchor`, `duplicate_block_anchor`,
  `invalid_block_class_name`, `invalid_block_hidden` and
  `invalid_block_settings` (plus field codes under `/blocks/<i>/settings`);
- **breaking for user-written block migrations:** a migration step now
  receives `{ data, settings }` and returns `{ data, settings? }` instead of
  bare data, so `2: ({ quote, ...rest }) => ({ ...rest, text: quote })`
  becomes `2: ({ data: { quote, ...rest } }) => ({ data: { ...rest, text: quote } })`.
  Sync reports a migration that still returns bare data as
  `BLOCK_MIGRATION_INVALID`.

It requires migration `0009_content_block_envelope` (additive columns and a
partial unique index). Back up first: an older engine would deliver hidden
blocks, so rolling back once envelopes exist restores the backup.

The site packages of the same next alpha render the envelope (CE6B, source
template `0.26.0`):

- `@lacecms/render`: `RenderableBlock` accepts optional `anchor`,
  `className`, `hidden` and `settings`; `prepareBlocks` skips hidden blocks;
  `BlockProps` gains `anchor`, `className` and typed `settings`
  (`BlockSettingsOf`); `parseBlockEnvelope` is exported; the new error code
  `invalid_block_envelope` reports an invalid anchor, class name or settings
  value. The additions are additive for TypeScript;
- registry block revisions `cta` 2, `hero` 3, `image` 4, `quote` 2 and
  `richText` 2 place the anchor as the root `id` and merge the class name
  into the root `class`, with unchanged markup without an envelope; `lace add
  block` scaffolds custom components the same way.

Template `0.26.0` ships these components and the `0009` upgrade steps. Block
components are user-owned, so existing sites adopt them with
`pnpm exec lace add block --all` (edited components are reported as
conflicts); components that ignore the new props keep rendering without ids
or editor classes.

Templates `0.15.0` and `0.16.0` were source-only steps between the published
alpha.2 and the alpha.3 candidate; their upgrade instructions remain listed for
projects upgrading from `0.14.0`. Upgrading an alpha.2 installation also
requires database migration `0003_site_build_outcomes` before the alpha.3
engine serves traffic (back up first; downgrade restores the backup), as the
`0.17.0` upgrade instructions state for Node SQLite and Cloudflare D1.

Both runtime images target `linux/amd64` and `linux/arm64`; each platform is
built and smoke-tested separately during preparation, while the full consumer
journey runs on the host's platform. Consumer packages and generated projects
declare minimum-only engines (see below). Existing projects move between template versions
with `lace upgrade` (user-owned README, `lace.config.ts`, `.env`, site source
and `worker/wrangler.jsonc` are never modified; managed-file edits are reported
as conflicts) and then follow the template's upgrade instructions to update
their image references and site dependencies. On Docker Desktop and OrbStack
(macOS/Windows), the Compose data directory crosses a VM file share without
shared SQLite locks or WAL memory: host `lace` database commands must run only
while the `api` and `dispatcher` services are stopped, as the generated guides
state. Linux hosts share the kernel with their containers and are not affected.
Exact candidate evidence is in
`docs/archive/step-33/step-33h-verification.md` (alpha.3) and
`docs/archive/step-32/step-32b-verification.md` (alpha.2); preparation and publication
are described in `docs/alpha-release.md`.

## Minimum requirements and tested versions

Engine declarations state minimums only. The repository root, the generated CMS
`package.json` and every public Lace package declare Node `>=24.12.0`; the root
and generated CMS also declare pnpm `>=12`. Release validation
(`scripts/release-model.mjs`) rejects any other declaration, including the
former `<25`/`<13` upper bounds. Doctor evaluates the consumer project's own
declaration, so a project that keeps an explicit upper bound is still held to it.

A version that satisfies a minimum is **eligible**, not tested. Reproducibility
pins are separate and unchanged by the minimums:

| Pin | Value | Where |
| --- | --- | --- |
| Tested Node | `24.12.0` | CI workflows, `node:24.12.0-bookworm-slim` API/builder images, release preparation |
| Tested pnpm | `12.3.4` | `packageManager` (root and generated CMS), API/builder images |
| Dependencies | exact versions | `pnpm-lock.yaml` and the workspace catalog |

Dependency engine audit (2026-10-06, resolved lockfile metadata): Astro 7.3.1
`>=22.12.0`, better-sqlite3 13.0.3 `>=22`, Wrangler 4.129.0 and Miniflare
`>=22.0.0`, Vite 8.2.2/8.3.0, Oxlint 1.81.0 and Oxfmt 0.66.0
`^20.19.0 || >=22.12.0`, `@aws-sdk/client-s3` 3.1133.0 `>=20.0.0`, OpenSpec
1.12.0 `>=20.19.0`, TypeScript 7.0.2 `>=16.20.0`, Hono `>=16.9.0`, workerd
`>=16`; Better Auth, Drizzle ORM and Turbo declare none; pnpm 12.3.4 declares
Node `>=18.*`. Nothing requires more than Node 24.12.0. Vitest 5.0.0 declares
`^22.12.0 || ^24.0.0 || >=26.0.0`, so Node 25 is eligible for consumers but not
for running this repository's test suite. Engine metadata alone is not runtime
certification.

A newer Node or pnpm major enters the tested matrix only after a recorded check
on that exact version: frozen install of the workspace and a packed generated
consumer, native `better-sqlite3` loading, CLI generation and `lace doctor`,
`pnpm build` of a generated site, and the relevant runtime smoke (Node API
readiness; local Worker bundle and `cf:dev` for Cloudflare). Record the exact
version, platform, date and passing scope here. Adding a tested major does not
change the minimums or the pins above, and it is never real-account
verification.

## Baseline refresh policy

Refreshes must resolve current stable releases from the listed sources, run the
disposable smoke check on the selected Node LTS, update the catalog and lockfile
together, and record the new selection date. Framework major upgrades require
test and migration review, as required by the architecture dependency policy.

## Composite field adoption (CE7A)

Composite definitions add recursive `group`/`list` metadata while preserving the
existing content JSON envelopes, media usage DTOs and database schema. Scalar
configuration hashes and scalar media paths are unchanged. Nested media paths
use relative RFC 6901 pointers such as `/images/0/image`; indices stored in
pointers are zero-based.

Adopt compatible engine, bundled admin, contracts, SDK and site/render packages
together before declaring or storing composites. Older consumers may reject
the new metadata or fail to validate/render nested data. The CE7A admin shows
composites as read-only JSON and preserves them during scalar edits and
lifecycle commands; generic authoring follows in CE7C. CE7B supports recursive
model evolution with sibling rename hints, wildcard removal pointers and
validated defaults/constraints. Deploy the CE7B engine before adopting nested
hints; older engines reject them. Registry/starter adoption followed in CE7D
(below); existing built-in blocks keep their flat schemas.

There is no database migration or automatic down-conversion. After storing
composites, rollback to an older engine/site requires restoring a compatible
backup of data and configuration as well as packages. Keep that backup before
adoption and test the site build against the same definitions.

## Gallery and Navigation (CE7D)

`@lacecms/content` adds the built-in `gallery` and `navigation` blocks
(version 1, composite data, no settings) to `builtInBlocks`; the five earlier
built-ins are unchanged, and configurations that do not register the new
blocks keep their hashes. The registry adds the `gallery` and `navigation`
Astro items at revision 1. There is no database migration, REST, export or SDK
change.

A configuration that registers the new blocks needs the content package of
the same release on the API, admin and site; older packages do not define
them. Template `0.27.0` registers all seven blocks in new starters, allows them
in `home` and `posts` (version 2), declares a `navigation` global rendered by
`BaseLayout` with a static fallback and adds the gallery and navigation CSS.
Existing projects adopt this by hand: `lace add block gallery navigation`,
configuration and model version changes, configuration sync, publication of
the global and the layout change (see the 0.27.0 upgrade instructions). To roll
back, remove the blocks from the models with `removedBlocks` while entries use
them, or restore the backup taken before sync.

## CE8A shared rich-text format

CE8A adds H4, horizontal rules, plain code blocks and independent link new-tab
and nofollow attributes. Existing H1–H3 and href-only JSON stays valid without
rewrites, database migrations or block schema-version changes.

Stored links use `href` plus optional `target: "_blank"` and `rel: "nofollow"`.
Omit a switch's attribute when unchecked; null, empty strings, other targets
and other rel tokens are rejected. Renderers add `noopener noreferrer` for a
new tab and append `nofollow` when requested. Ordinary URL fields stay strings.
Code blocks contain only unmarked text, without a language attribute, and render
as escaped `pre`/`code` preserving spaces, tabs and line breaks. Empty blocks
are valid. Rules and code are allowed at root and inside list items/blockquote.

Upgrade CMS packages and site `@lacecms/content`, `@lacecms/render` and
`@lacecms/astro` together before storing expanded documents. Sites using the
common RichText component need no copied block-source update; custom renderers
must support the expanded grammar, and overrides must forward validated link
attributes. A codeBlock override is called for both described pre/code elements,
following the existing per-element override contract.

CE8B updates the admin extensions and serializer to preserve and author this
format in every field, including recursive leaves. Use the fixed toolbar or
selection menu; Link provides independent new-tab/nofollow switches. See
[rich-text authoring](rich-text-authoring.md). CE8A alone still cannot preserve
expanded documents in its older admin; deploy CE8B together with its common
format/rendering dependencies before enabling expanded authoring.

An older engine or site renderer can reject documents using new features. To
roll back after expanded content is stored, restore a backup predating it or
explicitly remove the new features before downgrade; never silently strip or
normalize existing content. See [ADR 0014](adr/0014-expanded-rich-text-format.md).

## Field guidance metadata (CE9A)

Upgrade engine/contracts/admin together before configuring `placeholder`. Older
engines reject the option. No content or database migration is required; remove
placeholder options before rollback. Ordinary text length stays raw UTF-16 and
SEO stays trimmed code points. See [field guidance](field-guidance.md).


## Visual form layouts (CE9B)

Upgrade content/config/contracts/API/admin together before configuring `layout`
or block `settingsLayout`; older engines reject the options. No content or DDL
migration is required. Remove layouts and synchronize before rolling back to
a matching earlier engine/admin. Stored field paths and values, including keys
named `layout`, are unchanged. Public metadata synchronization still advances
published state and requests a build. Creation-time slugs are ordinary stored
slugs and need no conversion. See [form organization](form-organization.md).

## Public contract evolution

Starting with the release after `0.1.0-alpha.5`, the public delivery contract
(`/api/v1/public/*` responses and the build export) evolves under one policy.

- **Compatible (no version change):** adding an optional key, or a key older
  consumers may ignore, to a public response, a public entry, block, global,
  media item or the build export. `@lacecms/sdk` parses responses with
  tolerant schemas that ignore and remove unknown keys, so a site build keeps
  working against a newer API of the same line.
- **Breaking:** removing a key, changing its type, or changing the meaning of
  a value consumers rely on. Such a change requires a new build-export
  `formatVersion` (for the export) or `/api/v2` (for REST responses).
- **Version pairing:** within one major line, the API must be the same or a
  newer minor than the site's `@lacecms/sdk`. A newer SDK may rely on keys an
  older API does not send.
- **Strict by design:** rich-text grammar, block `schemaVersion` matching and
  block data validation do not tolerate unknown values; they are safety and
  rendering contracts. Upgrading block definitions or the rich-text format
  still requires matching site packages.
- **Server output stays strict:** the API validates every public response
  with strict schemas, and the generated OpenAPI document describes them with
  `additionalProperties: false`. External clients generated from that
  document should nevertheless ignore unknown properties, because later
  releases of the same line may add them.

The build export carries `formatVersion` (currently `1`). The SDK declares the
highest format it supports and rejects a newer export with
`LaceUnsupportedExportFormatError`; the published-site loader reports it as
`invalid_export` with advice to upgrade `@lacecms/sdk`.

Upgrade notes for the next alpha:

- The build export requires `formatVersion`; an SDK of this release rejects
  an export from `0.1.0-alpha.5` or older. Upgrade the API and site packages
  together, as before.
- `LaceHttpError.code` is typed `LaceErrorCode | (string & {})`: an error code
  introduced by a newer API is reported instead of failing as a contract
  violation. Code that assigns `code` to a `LaceErrorCode` variable must
  narrow it first.
- The build export is paged. `GET /api/v1/public/build-export` returns a
  first page `{formatVersion, version, entries, globals, seo, media,
  nextCursor?}`; requests with `?after=<nextCursor>` return continuation pages
  `{formatVersion, version, entries, media, nextCursor?}`. An optional `limit`
  (1–100, default 100) caps entries per page, and the server also ends a page
  at a fixed stored-JSON byte budget, always delivering at least one entry.
  Sites that use the published-site loader, `getSite()`, `LaceBlocks` or
  `client.getBuildExport()` need no code change: the SDK follows every cursor
  and returns the same assembled export as before. Code that reads the raw
  REST export must follow `nextCursor` until it is absent and merge the
  pages' `entries` and `media`; `globals` and `seo` come from the first page.
  The API and `@lacecms/sdk` must come from the same release.
- A continuation request whose cursor was issued before a publication fails
  with `409 BUILD_EXPORT_VERSION_CHANGED` and details `{expectedVersion,
  actualVersion}`. `client.getBuildExport()` then restarts from the first
  page, at most two traversals in total (`restart: false` disables this). The
  published-site loader disables restarts when
  `LACE_EXPECTED_PUBLISHED_VERSION` is set and reports the conflict as
  `version_mismatch`; without it, exhausted restarts also fail with
  `version_mismatch`, stating that content kept changing during the export.
- `If-None-Match` applies to the first page only; continuation pages ignore it
  and every `200` page carries the strong ETag of its version.
- The page byte budget (4,000,000 stored bytes) is sized for the Workers Free
  plan's 128 MB memory and 50 D1 queries per invocation; staying within its
  10 ms CPU limit is best effort, because one maximal entry can exceed it on
  its own page.
