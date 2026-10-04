## Why

Step 30, session **30C — Astro adapter and starter migration**, delivers the framework-bound half of ADR 0006. Session 30B shipped the framework-neutral loader (`createPublishedSiteLoader` in `@lacecms/sdk`) and render core (`@lacecms/render`), but the generated starter `site/` and the engine's `apps/site` still carry private copies of `site-data.ts`, `rendering.ts`, `rich-text.ts`, a closed `BlockRenderer.astro` `if` chain, and `RichText*.astro`; the rich-text copy still accepts input the CMS rejects. Until both sites consume the packages through a thin Astro adapter and take block markup from one registry source, every fix to loading or rich-text safety must be repeated per site, and an existing Astro site can only connect by hand-copying files.

## What Changes

- Add the Astro adapter package `@lacecms/astro` (architecture §13.4), containing only Astro-bound code and depending on `@lacecms/render` and `@lacecms/sdk` with a peer dependency on `astro`:
  - server-only `createAstroSiteLoader({ env?, dev?, fetch?, hints? })` that maps the site's environment record to `createPublishedSiteLoader`, enables revalidation when `dev` is true, and fails when evaluated in a browser;
  - `@lacecms/astro/LaceBlocks.astro` (`entry`, `blocks`, `mediaUrl`) rendering each block of an entry in order through `prepareBlocks` with typed `BlockProps`;
  - `@lacecms/astro/RichText.astro` (`document`, optional `components`, optional `context`) rendering the `describeRichText` tree with Astro escaping, never `set:html`, with per-node/mark override components that receive only the validated element and its rendered children;
  - shipped as Astro component source; no visual blocks, client scripts, or Astro integration.
- Create the canonical block-source registry `registry/registry.json` and `registry/astro/<type>/` items (manifest plus component source) for `hero`, `richText`, `image`, `quote`, and `cta`, and define the site-local `lace.site.json` (format version, framework, components directory, block map path and hash, installed items with revision and per-file hashes) and the generated block map file `src/lace/blocks.ts`. Session 30D adds the CLI that reads and writes them.
- **BREAKING (starter layout):** rewrite the `create-lace` starter `site/` and `apps/site` on the adapter. Delete `lib/site-data.ts`, `lib/rendering.ts`, `lib/rich-text.ts`, `BlockRenderer.astro`, and `RichText*.astro`; add `src/lib/lace.ts`, `src/lace/blocks.ts`, `lace.site.json`, and the five registry blocks under `src/components/lace/` consuming `BlockProps` and `<RichText>`; pages use `byPath("/")`, `entries("posts")`, and `bySlug("posts", slug)`. Rendered markup and every `data-lace-*` hook stay unchanged; build failures now carry the render-core and loader diagnostics.
- Split roles: the starter is the minimal product template (home and posts pages, layout, styles, registry blocks; no tests or fixtures); `apps/site` remains the engine playground with `about`, `notes`, the published-export fixture, fixture mode, and build tests. A parity test fails when the starter, `apps/site`, the existing-site fixture, and `registry/` block sources diverge or a `lace.site.json` hash is stale.
- Add a `starter` acceptance phase that packs the consumer package graph, generates a project, installs it outside the workspace, and builds the starter against a local export server; run it in CI next to the `apps/site` build.
- Advance the template to `0.9.0`: update `TEMPLATE_FILES`, the generated README and operations guide, the byte-stable snapshots, and upgrade instructions that give alpha projects explicit manual migration steps for their user-owned `site/**` (`lace upgrade` never rewrites it).
- Add the generated guide `docs/lace-astro-site.md` for connecting an existing Astro site (install packages, configure environment, create the loader file, render one page and one collection route, add blocks, style through hooks), verified by an independent Astro fixture build.
- Extend the dependency-boundary check: `astro -> render, sdk` (plus `astro` itself), `apps/site -> astro, render, sdk, content`, scanning `.astro` frontmatter, normalizing package subpath imports, and rejecting adapter re-exports of Lace packages. Add `@lacecms/astro` to the alpha release allowlist.

Dependencies: Step 29 and sessions 30A–30B. Non-goals: the `lace add block` command, registry bundling in `@lacecms/cli`, custom-block scaffolding and conflict handling (30D); starter/existing/none site modes and mode-aware upgrade/doctor (30E); block data migration; a dedicated public content schema (Step 33); React, Vue, or Svelte adapters; installing the CMS into a nonempty project.

Externally visible outcome: new projects receive a site that loads and renders through `@lacecms/sdk`, `@lacecms/render`, and `@lacecms/astro` with user-owned block markup recorded in `lace.site.json`; existing Astro sites can follow a verified connection guide; alpha projects receive manual migration instructions.

## Capabilities

### New Capabilities

- `astro-adapter`: the `@lacecms/astro` package — server-only loader glue, `<LaceBlocks>`, `<RichText>` with overrides, packaging, and its no-markup rule.
- `block-source-registry`: the canonical `registry/` item format, the site-local `lace.site.json` lock, the generated block map file, and parity between registry, starter, `apps/site`, and connected-site fixtures.

### Modified Capabilities

- `astro-reference-site`: `apps/site` loads through the published-site loader and renders through the adapter and registry blocks; unknown-block, unsafe rich-text, and live-failure diagnostics come from the packages; it is the engine playground, not the shipped template.
- `generated-project-onboarding`: the starter renders through packaged loading, parsing, and rich text with user-owned registry blocks; a connection guide for existing Astro sites replaces copying generated loader and renderer files.
- `project-generator`: template `0.9.0` with the adapter-based starter layout, ownership inventory, and manual migration instructions.
- `generated-project-acceptance`: CI builds a starter generated from packed packages.
- `workspace-governance`: the Astro adapter boundary and `.astro` frontmatter scanning.

## Impact

- New `packages/astro`, new `registry/`, rewritten `apps/site/src/**` and `packages/create-lace/templates/site/**`, `packages/create-lace/src/inventory.ts` and tests, `templates/README.md`, `templates/docs/lace-operations.md`, new `templates/docs/lace-astro-site.md`, `templates/.lace/upgrade-instructions.json`, `tests/fixtures/generated-project/*.json`, `packages/cli/src/upgrade-command.test.mjs`, `scripts/check-boundaries.mjs` and its fixtures/tests, `scripts/generated-project-acceptance.mjs`, `.github/workflows/ci.yml`, `release/alpha.json`, `docs/alpha-release.md`, root docs referencing the old site files, `docs/mvp-implementation-roadmap.md`, and `pnpm-lock.yaml`.
- Governing architecture: §6 (package graph and rules), §7 (generated layout, starter/reference roles, ownership inside site trees, upgrade model), §11 (one rich-text allowlist), §13.4–13.7 (adapter, registry, framework selection, typical files). ADRs 0005 and 0006.
- Related accepted specs left unchanged: `published-site-loader` and `render-core` (consumed as-is), `publication-visibility` (dev revalidation behavior preserved through `dev: import.meta.env.DEV`), `block-registry` (content block definitions unchanged), `upgrade-planner` (user-owned `site/**` is still never rewritten).
