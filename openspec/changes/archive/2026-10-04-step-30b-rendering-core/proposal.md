## Why

Step 30, session **30B — Framework-neutral loading and rendering core**, implements the non-visual half of ADR 0006. Today the generated starter and `apps/site` each own a private `site-data.ts`, `rendering.ts`, and `rich-text.ts`; the rich-text copy already accepts `https:example.com`, `mailto:` without `@`, and a paragraph inside a paragraph that `@lacecms/content` rejects. Before 30C can migrate either site to an Astro adapter, the loader, block parsing, block map, and rich-text description must exist once, in framework-neutral packages that reuse the CMS validation exclusively.

## What Changes

- Add `createPublishedSiteLoader` to `@lacecms/sdk` (architecture §13.2): explicit environment record or explicit `baseUrl`/`token`/`publicBaseUrl`/`expectedPublishedVersion`, optional `fetch`, `revalidate`, and per-code `hints`. Static mode reads one build export per loader and forgets failures; revalidate mode issues ETag-conditional reads with one shared in-flight request. It returns a `PublishedSite` view (`version`, `byPath`, `entries`, `bySlug`, `mediaUrl`) typed from contract DTOs, exposes only published content, rejects duplicate paths and duplicate slugs within a model, and never hard-codes model keys or route patterns. Failures use `LacePublishedSiteError` with codes `missing_configuration`, `rejected_token`, `api_unavailable`, `version_mismatch`, and `invalid_export`.
- Add the framework-neutral package `@lacecms/render` (architecture §13.3), depending only on `@lacecms/content`:
  - `parseBlock(definition, block, context)` over `validateBlockData` in publish mode, failing on block type or schema-version mismatch and naming model, entry, block key, and field path;
  - `defineBlockMap`, `resolveBlock`, the shared `BlockProps` type, and a `prepareBlocks` helper that resolves and parses an entry's blocks in order so adapters only render;
  - `describeRichText`, which validates with `validateRichTextDocument` (and therefore `isSafeUrl`) and returns a neutral element description with fixed tags and safe attributes, never raw HTML;
  - `LaceRenderError` with codes `invalid_block_data`, `block_version_mismatch`, `unknown_block_type`, and `invalid_rich_text`.
- Add `@lacecms/render` to the alpha release allowlist (thirteen scoped packages plus the generator) so 30C can depend on it with the shared release version.
- Extend the dependency-boundary script with the `render -> content` edge and an external-import allowlist that keeps `@lacecms/render` free of UI frameworks, Node built-ins, the SDK, and contracts, and keeps `@lacecms/sdk` free of framework imports.
- Record `prepareBlocks` in architecture §13.3 and the 30B completion (with the site-copy deletion explicitly left to 30C) in the roadmap.

Dependencies: Step 29 and session 30A (ADR 0006, architecture §§6 and 13). Non-goals: the Astro adapter, `createAstroSiteLoader`, `<LaceBlocks>`, `<RichText>` (30C); rewriting or deleting the starter's and `apps/site`'s local `site-data.ts`, `rendering.ts`, and `rich-text.ts` (30C migrates both sites and deletes the copies); the block registry, `lace.site.json`, and `lace add block` (30D); site modes (30E); block data migration; a dedicated public content schema (Step 33). The public build-export DTO and existing SDK client operations are unchanged.

Externally visible outcome: site code can import `createPublishedSiteLoader` from `@lacecms/sdk` and `parseBlock`, `defineBlockMap`, `resolveBlock`, `prepareBlocks`, `describeRichText`, and `BlockProps` from `@lacecms/render`; nothing existing changes behavior.

## Capabilities

### New Capabilities

- `published-site-loader`: the framework-neutral published-site loader in `@lacecms/sdk` — configuration, static and revalidate read modes, version consistency, the published-only site view, duplicate rejection, and coded errors.
- `render-core`: the framework-neutral `@lacecms/render` package — block parsing, block map and resolution, block props, rich-text element description, and coded render errors.

### Modified Capabilities

- `workspace-governance`: adds a requirement that the site-rendering packages stay framework-neutral, enforced by the dependency-boundary check.

## Impact

- New package `packages/render` (`@lacecms/render`), new SDK module and exports in `packages/sdk`, `scripts/check-boundaries.mjs` and its tests, `release/alpha.json`, `scripts/release-model.mjs` and its test, `docs/alpha-release.md`, `docs/mvp-architecture.md` §13.3, `docs/mvp-implementation-roadmap.md` Step 30, and `pnpm-lock.yaml`.
- Governing architecture: §6 (package graph and rules), §11 (one rich-text allowlist), §13.2–13.3 (loader and render core APIs), §19–20 (dependencies and tests). ADRs 0001 and 0006.
- Related accepted specs left unchanged: `public-sdk` (client operations reused as-is), `content-validation` and `block-registry` (validation reused, not modified), `astro-reference-site` (sites migrate in 30C), `alpha-release-artifacts` (allowlist mechanics unchanged; only the list grows).
