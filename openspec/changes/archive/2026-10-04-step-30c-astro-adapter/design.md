## Context

Session 30B shipped `createPublishedSiteLoader` (`@lacecms/sdk`) and `@lacecms/render` (`parseBlock`, `defineBlockMap`, `resolveBlock`, `prepareBlocks`, `BlockProps`, `describeRichText`, `LaceRenderError`). Both sites still use their own copies:

- `packages/create-lace/templates/site/` (template `0.8.0`): `lib/site-data.ts` (static/revalidate loader hard-coding `home` at `/` and `posts` at `/blog/<slug>`), `lib/rendering.ts`, `lib/rich-text.ts`, `BlockRenderer.astro`, `RichText{,Nodes,Marks}.astro`, five block components, `index.astro`, `blog/[slug].astro`, `BaseLayout.astro`, `global.css`.
- `apps/site/`: the same component and helper files (byte-identical components), plus `about` and `notes` routes, a fixture mode selected by `LACE_SITE_DATA_MODE` (default `fixture`), `fixtures/published-export.json`, unit tests for the three helpers, and `fixture-build.test.mjs`.

Tests that depend on the old layout: `create-lace/src/onboarding.test.mjs` (imports `site-data.ts` and compares components with `apps/site`), `tests/fixtures/generated-project/*.json` snapshots, `cli/src/upgrade-command.test.mjs` (preserved paths and `0.8.0`), and `create-lace/src/index.test.mjs` (`TEMPLATE_VERSION`). The CI `quality` job builds `apps/site` through `pnpm test`/`pnpm build`; the packed generated-project journey runs only on a PR label because it needs Docker.

Architecture §13.4–13.7 fix the adapter API, the registry and lock concepts, and the typical files. This change fixes the concrete formats 30D will read.

## Goals / Non-Goals

**Goals:** a thin `@lacecms/astro`; both sites on the adapter with unchanged markup; one canonical registry source with a parity test; a concrete `lace.site.json` and block map format; template `0.9.0` with manual migration instructions; a verified existing-site guide; CI building a packed starter.

**Non-Goals:** `lace add block`, bundling `registry/` into the CLI, custom-block scaffolding, conflict handling (30D); site modes (30E); Astro component unit tests through the experimental container API; other frameworks.

## Decisions

### 1. Adapter package layout

`packages/astro` (`@lacecms/astro`, version `0.1.0-alpha.1`, keyword `astro-component`):

```text
src/index.ts             createAstroSiteLoader, AstroSiteLoaderOptions, RichText override types
src/LaceBlocks.astro     public component
src/RichText.astro       public component (validates, then renders the tree)
src/RichTextNodes.astro  internal recursive renderer (not exported)
```

`exports`: `"."` → `dist/index.{js,d.ts}`; `"./LaceBlocks.astro"` and `"./RichText.astro"` → `dist/*.astro`, which the build copies from `src/` (the release pipeline accepts only `./dist/` entry points and literal `files`). `files`: `dist`. `apps/site` aliases `@lacecms/astro/<Name>.astro` to the source components so its dev container needs no package build. Dependencies: `@lacecms/render`, `@lacecms/sdk`; `peerDependencies.astro` `^7.3.1` (the pinned `7.3.1`); `astro` as a dev dependency for tests. Astro's dependency crawler treats a package with an `astro` peer dependency as framework source and compiles its `.astro` files, so no integration is needed. `tsc` checks and emits only `index.ts`; the `.astro` files are verified by the three site builds.

*Alternative rejected:* precompiling `.astro` files. Astro does not support publishing compiled components portably across minor versions; source is its documented library format.

### 2. Loader glue

`createAstroSiteLoader({ env, dev, fetch, hints })` returns `createPublishedSiteLoader({ environment: env ?? globalThis.process?.env ?? {}, revalidate: dev === true, fetch, hints })`. It never touches `import.meta.env`; the site's `src/lib/lace.ts` passes `{ ...import.meta.env, ...process.env }` and `import.meta.env.DEV` (architecture §13.4). The module throws at evaluation when `typeof window !== "undefined" || typeof document !== "undefined"` so a client import fails loudly instead of shipping a token-reading module. Nothing in the adapter reads or logs the token; static output scans prove it.

The generated starter passes hints naming its commands (`Admin Settings`, the ignored `.env`, `pnpm dev:api`); `apps/site` passes hints naming `POST /api/v1/admin/api-tokens` and `pnpm dev:node`, matching the former messages.

### 3. `<LaceBlocks>`

Props `entry: RenderableEntry`, `blocks: BlockMap`, `mediaUrl: MediaUrlBuilder`. It calls `prepareBlocks(blocks, entry, mediaUrl)` once and renders `<Component {...props} />` for each prepared block, with no wrapper element. Failures are the render core's `LaceRenderError`, which Astro surfaces as a build error. `site.mediaUrl` is a closure in the published view, so passing it unbound is safe.

### 4. `<RichText>`

`RichText.astro` calls `describeRichText(document, context)` and renders `RichTextNodes.astro`, which recurses with `Astro.self`. For each element it uses the override from `components[element.source]` when present (props `{ element }`, rendered children in the default slot), otherwise a dynamic tag (`const Tag = element.tag`) with `href` only for `a`. `br` renders as a void element without children. Text nodes are emitted as Astro expressions, so Astro escapes them; no `set:html` exists anywhere in the adapter. The output tags, nesting, and mark order equal the former `RichTextNodes`/`RichTextMarks` output (first mark outermost), which the markup comparison in decision 9 verifies.

Override types live in `index.ts` (`RichTextOverrideProps`, `RichTextComponents`) and reference `@lacecms/render` types without re-exporting render symbols.

### 5. Registry, lock, and block map formats

```text
registry/registry.json                  { schemaVersion: 1, items: [{ name, framework, manifest }] }
registry/astro/<type>/item.json         item manifest
registry/astro/<type>/<Name>Block.astro component source
```

Item manifest (`schemaVersion: 1`): `name` (equals the block type), `framework` (`astro`), `blockType`, `blockVersion` (built-in definition version), `revision` (integer, starts at 1), `requires` (`{"@lacecms/astro": "0.1.0-alpha.1", "@lacecms/render": "0.1.0-alpha.1"}` — exact alpha versions; 30D owns range evaluation), `files: [{ source, target, role: "component" }]` with `target` relative to the components directory, and `dependencies: []`.

`lace.site.json` (`schemaVersion: 1`):

```json
{
  "schemaVersion": 1,
  "framework": "astro",
  "componentsDir": "src/components/lace",
  "blockMap": "src/lace/blocks.ts",
  "blockMapSha256": "<hex>",
  "items": {
    "cta": { "revision": 1, "files": { "src/components/lace/CtaBlock.astro": "<hex>" } }
  }
}
```

Items and file keys are sorted; `definitions` is omitted when no custom definitions module exists. The architecture's "registry version" per item is the item `revision`.

The block map file begins with a one-line generated-file comment, imports `builtInBlocks` and `defineBlockMap`, imports components sorted by block type, and exports `blocks = defineBlockMap({...})` sorted by block type. 30D's generator must reproduce these bytes for the five built-ins.

*Alternative rejected:* deriving hashes at test time only. Recording them now gives 30D a real baseline for "unchanged since install".

### 6. Block components

Each registry component types its props as `BlockProps<typeof builtInBlocks.<type>>` (type-only import of the content value), reads `data`, and keeps the former markup byte-for-byte: same root elements, classes, attribute order, and `data-lace-*` hooks. Rich-text fields render through `@lacecms/astro/RichText.astro` with `context={{ block: context, fieldPath: [...] }}`. Behavior differences are intended and come from publish validation in `parseBlock`: invalid data now fails with the render core's field path; the hero action renders only when both label and URL are present (previously a label without URL failed the build — publish validation does not couple the two fields).

### 7. Site files

Both sites: `lace.site.json`, `src/lace/blocks.ts`, `src/lib/lace.ts`, `src/env.d.ts`, `src/components/lace/*`, `layouts/BaseLayout.astro` (typed with `PublishedEntry` from `@lacecms/sdk`), pages. Home throws `"Publish the home page in Admin ..."` with the former sync/publish instruction when `byPath("/")` is absent. The blog route lists `entries("posts")` in `getStaticPaths` and reads `bySlug("posts", slug)` on each render (404 when absent). `apps/site` keeps `about/[...slug].astro` (`byPath("/about")`) and `notes/[slug].astro`.

`apps/site/src/lib/lace.ts` keeps fixture mode: when `LACE_SITE_DATA_MODE` is unset or `fixture` it passes a fake base URL and token plus a `fetch` that serves the committed fixture with a fixed ETag, so the same loader code runs and no network request happens; `live` passes the real environment; any other value throws. `apps/site/astro.config.mjs` replaces its string aliases with anchored regex aliases (`^@lacecms/<name>$` → `packages/<name>/src/index.ts`) for `astro`, `render`, `sdk`, `contracts`, `content`, `domain`, so `@lacecms/astro/LaceBlocks.astro` resolves through the package `exports`. Plain `tsc` (the sites' `typecheck`) cannot resolve `.astro` modules — Astro relies on its editor plugin and `astro check`, which does not support the pinned TypeScript 7 — so each site has a user-owned `src/env.d.ts` referencing `astro/client` and declaring `*.astro` modules as components, which lets `blocks.ts` typecheck. Its helper unit tests are deleted; their behavior is covered by the `sdk` and `render` suites.

The starter `site/package.json` depends on `@lacecms/astro`, `@lacecms/content`, `@lacecms/render`, `@lacecms/sdk` at the release version plus `astro`.

### 8. Existing-site guide and fixture

The guide ships as managed `docs/lace-astro-site.md` in generated projects (the place 30E will link). Until 30D, it tells the operator to copy `site/lace.site.json`, `site/src/lace/blocks.ts`, and `site/src/components/lace/` from a freshly generated starter (or the release's `registry/astro/` sources), and states that `lace add block` will replace this step.

`tests/fixtures/existing-astro-site/` is an independent Astro project with its own layout and routes (`/` by path, `/articles/[slug]` over `posts`), a `link` rich-text override, and its own stylesheet using the hooks. `tests/existing-astro-site.test.mjs` copies it to a temporary directory, links `apps/site/node_modules`, serves a fixture export over HTTP, builds it, and asserts the five blocks, the override, media URLs, and the absence of the token in every output file.

### 9. Markup preservation and parity

The `apps/site` fixture build output before migration is the baseline; the migrated build must be byte-identical for all four routes, except intended differences recorded in the tasks (none expected). `fixture-build.test.mjs` keeps its structural assertions and adds a full-`dist` secret scan.

`tests/block-sources.test.mjs` reads `registry/`, then for each site (`packages/create-lace/templates/site`, `apps/site`, `tests/fixtures/existing-astro-site`) validates `lace.site.json`: framework, in-root paths, block map hash, and that each recorded item exists in the registry, its revision matches, and each installed file is byte-identical to the registry source and matches its recorded hash. It also checks registry manifests against `builtInBlocks`.

### 10. Packed starter in CI

New acceptance phase `starter` in `scripts/generated-project-acceptance.mjs`: build, pack the consumer graph (existing `packConsumerGraph`, which follows template dependencies and now includes `@lacecms/astro`/`render`), generate, `installPackedConsumer`, then build the site with a local HTTP export server serving the `apps/site` fixture and assert five block types and no token in `site/dist`. Root script `acceptance:starter`; the CI `quality` job runs it after `pnpm build`. A global `file:` override of a package that `site/package.json` also declares makes pnpm's frozen check compare root- and site-relative paths, so `installPackedConsumer` (generalizing the former `@lacecms/sdk` exclusion) overrides those packages only through parent-scoped `parent>dependency` entries for the Lace packages that depend on them.

### 11. Boundaries

`scripts/check-boundaries.mjs`: collect `.astro` files and scan only their frontmatter; map `@scope/name/sub` to `@scope/name` for the member check; `@lacecms/astro` edges `render`, `sdk`; external allowlist for the adapter `@lacecms/render`, `@lacecms/sdk`, `astro` and `astro/*`; a re-export check rejecting `export … from "@lacecms/…"` in adapter sources; `@lacecms/app-site` edges `astro`, `render`, `sdk`, `content`. New fixtures cover the adapter cases.

### 12. Template 0.9.0 and migration

`TEMPLATE_VERSION` `0.9.0`; inventory drops the nine removed site files, adds `site/lace.site.json`, `site/src/env.d.ts`, `site/src/lace/blocks.ts`, `site/src/lib/lace.ts`, five `site/src/components/lace/*` (all `user`), and `docs/lace-astro-site.md` (`managed`). README and operations guide describe the new files, how to add a route and a custom block, and the guide. `upgrade-instructions.json` for `0.9.0` lists the manual site migration: add the four packages, create the loader file, copy `lace.site.json`, the block map, and components from a fresh `0.9.0` project, switch pages to `getSite()` and `<LaceBlocks>`, delete the old helpers and renderer, re-apply local markup edits to the new components, and run `pnpm build`; earlier-version instructions remain appended. `lace upgrade` keeps treating `site/**` as user-owned, so it neither deletes nor adds site files.

## Risks / Trade-offs

- [Astro compiles `.astro` from `node_modules` only for detected framework packages] → the peer dependency plus `astro-component` keyword; the packed starter phase proves it outside the workspace.
- [Whitespace or attribute-order changes in markup] → byte comparison against the pre-migration build; components are written compactly like the originals.
- [CI time and network for the packed starter install] → runs only the site build, no Docker; reuses the pnpm store cache.
- [Alpha sites break on upgrade] → explicit, accepted by the roadmap; instructions are manual and `site/**` is never rewritten.
- [Format churn in 30D] → formats carry `schemaVersion: 1`; 30D may add fields but must read these.

## Migration Plan

New projects get template `0.9.0`. Existing projects run `lace upgrade`, which updates managed docs and prints the manual site migration steps; their site keeps building on the old copies until migrated. Rollback is the existing upgrade rollback for managed files; site edits are the user's.

## Open Questions

None blocking. Range semantics for item `requires` are left to 30D.
