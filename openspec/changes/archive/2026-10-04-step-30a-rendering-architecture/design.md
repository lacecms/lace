## Context

See proposal.md for motivation. The roadmap Step 30 entry already records the owner's non-negotiable decisions (package split, no npm-distributed visual components, generated block map with hash conflict detection, unchanged public DTO, empty-target `init .`, starter/reference split). This session turns them into named packages, edges, files, and API shapes in `docs/mvp-architecture.md` and ADR 0006.

Observed current state (2026-10-04):

- `@lacecms/sdk` depends only on `@lacecms/contracts` and exposes `createLaceClient` with `getBuildExport({ etag })` returning `{ changed, etag, export }`, `getPublicMediaUrl`, and the `LaceSdkError` → `LaceTransportError`/`LaceHttpError`/`LaceContractError` hierarchy.
- `@lacecms/content` already exports `validateBlockData`, `BlockDataValues`, `BlockDefinition`, `builtInBlocks` (five version-1 blocks), `validateRichTextDocument`, `isSafeUrl`, and `ContentValidationError` with issue paths; it is runtime-portable.
- The build export is `{ entries: { entry, path }[], version }`; each entry is the content-entry DTO with always-present `published` and mirrored `draft` snapshots carrying `title`, optional `slug`, `fields`, and ordered `blocks` (`type`, `key`, `position`, `schemaVersion`, `data`).
- Generated `site/` and `apps/site` hold private copies of `site-data.ts`, `rendering.ts`, `rich-text.ts`, `BlockRenderer.astro`, `RichText*.astro`, and five visual blocks; `TEMPLATE_FILES` marks every `site/**` file user-owned.
- `@lacecms/cli` already owns hash, conflict, lock, and journal mechanics for `lace upgrade` (`upgrade-files`, `upgrade-conflicts`, `upgrade-lock`, `upgrade-journal`).
- `scripts/check-boundaries.mjs` enforces the architecture dependency graph per workspace package.

## Goals / Non-Goals

**Goals:**

- Fix final package names, dependency edges, repository locations, and file names that 30B–30E reuse.
- Fix public API names, inputs, outputs, error codes, and server-only constraints precisely enough that 30B–30D proposals do not redesign them.
- Record ownership for each new file kind inside a user-owned site tree.
- Keep every new edge consistent with ADR 0001 and existing architecture invariants.

**Non-Goals:**

- Exact DTO field lists, error message wording, Valibot schemas for `lace.site.json`, and normative spec scenarios (just-in-time in 30B–30E).
- CLI flag names for site modes and for `lace add block` options beyond those the roadmap already names (30D/30E).
- Updating `scripts/check-boundaries.mjs`; each implementation session adds the edges it introduces.

## Decisions

### D1. Package names and locations

`@lacecms/render` (`packages/render`) is the framework-neutral render core. `@lacecms/astro` (`packages/astro`) is the Astro adapter. Future adapters follow `@lacecms/<framework>` (`react`, `vue`, `svelte` reserved, none created). Canonical block sources live in a repository-root `registry/` directory, which is engine data, not a workspace package.

Alternatives: `@lacecms/render-core`/`@lacecms/astro-adapter` (longer, no added clarity); putting rendering in `@lacecms/content` (would mix authoring DSL with presentation output and grow the package the CMS server loads); putting the loader in a new package (the loader is transport-bound and belongs with the SDK that already owns ETag reads).

### D2. Dependency direction

```text
render       -> content
sdk          -> contracts            (unchanged)
astro        -> render, sdk
apps/site    -> astro, render, sdk, content
```

`render` does not depend on `contracts`: it accepts a structural block input (`type`, `key`, `schemaVersion`, `data`) that the contract block DTO satisfies, and 30B adds a type test proving assignability. This keeps transport schemas out of the renderer. `sdk` does not import `content` or `render`; the loader returns raw published blocks and parsing stays in `render`. `astro` imports `render` and `sdk` only and re-exports neither, so each symbol has one canonical import path; sites import `@lacecms/content` themselves for `builtInBlocks`. `cli` and `create-lace` gain no package edges: registry files are inert source assets copied, never imported. Generated starter sites have the same direct dependencies as `apps/site`.

Alternative rejected: `astro` re-exporting `render`/`sdk`/`content` APIs so sites install one package — convenient, but it hides ownership, duplicates import paths, and couples the adapter's version surface to three packages.

### D3. Published-site loader (`@lacecms/sdk`, 30B)

- `createPublishedSiteLoader(options): PublishedSiteLoader`, where `PublishedSiteLoader = () => Promise<PublishedSite>`.
- Options: `environment?` (record read for `LACE_API_BASE_URL`, `LACE_BUILD_TOKEN`, `LACE_PUBLIC_BASE_URL`, `LACE_EXPECTED_PUBLISHED_VERSION`), explicit `baseUrl?`, `token?`, `publicBaseUrl?`, `expectedPublishedVersion?` that win over the environment, `fetch?`, `revalidate?: boolean` (default `false`), `hints?` (optional per-code text appended to errors). The SDK never reads `process.env` or `import.meta.env` itself.
- Static mode: one export read per loader, shared by concurrent callers, cleared after failure so the next call retries. Revalidate mode: every call issues an ETag-conditional read; concurrent calls share one in-flight request; a `304` reuses the last view.
- `PublishedSite`: `version`, `byPath(path)`, `entries(modelKey)` (sorted by path, empty for an unknown model), `bySlug(modelKey, slug)`, `mediaUrl(mediaId)`. Lookups return `undefined` when absent; callers decide 404 versus failure.
- `PublishedEntry`: `id`, `modelKey`, `path`, optional `slug`, `title`, `fields`, ordered `blocks` (`PublishedBlock`: `type`, `key`, `position`, `schemaVersion`, `data`), typed from contract DTOs. No draft-shaped property exists on the view.
- The loader trusts CMS-resolved paths, never derives routes or names model keys, and rejects duplicate paths and duplicate slugs within a model.
- `LacePublishedSiteError extends LaceSdkError` with stable `code`: `missing_configuration`, `rejected_token` (401/403), `api_unavailable` (transport), `version_mismatch`, `invalid_export`. Other SDK errors propagate unchanged. Messages are project-neutral; generated projects name their commands through `hints`.

### D4. Render core (`@lacecms/render`, 30B)

- `BlockContext`: `modelKey`, `entryId`, `blockKey`.
- `parseBlock(definition, block, context)` validates `block.data` with `validateBlockData` in publish mode (defaults applied) and returns `BlockDataValues<Fields>`. It also fails when `block.type` differs from `definition.type` or `block.schemaVersion` differs from `definition.version`; the render core does not migrate block data.
- `defineBlockMap(entries)` takes a record keyed by block type of `{ definition, component }`, generic over the adapter's component type, rejects a key that differs from its definition type, and returns a frozen map. `resolveBlock(map, block, context)` returns the entry or fails on unknown types.
- `BlockProps<Definition>`: `block`, parsed `data`, `context`, `mediaUrl`, the props every adapter passes to block components.
- `describeRichText(value, context?)` validates with `validateRichTextDocument` and returns a neutral tree of `{ kind: "text", text }` and `{ kind: "element", tag, attributes, source, children }` nodes, where `tag` is from a fixed allowlist, `attributes` contains only safe attributes (link `href` already proven safe by `isSafeUrl`), and `source` names the originating node or mark. No raw HTML string is ever produced. The site-local allowlists are deleted rather than reconciled.
- `LaceRenderError` with `code`: `invalid_block_data`, `block_version_mismatch`, `unknown_block_type`, `invalid_rich_text`; it carries the context and field path and keeps the underlying `ContentValidationError` as `cause`.
- No import of any UI framework, Node-only API, or the SDK.

Alternative rejected: parsing inside each visual component. Parsing in the dispatcher guarantees every component receives validated, typed data and keeps the failure message uniform; custom components get the same contract through `BlockProps`.

### D5. Astro adapter (`@lacecms/astro`, 30C)

- Root entry (server-only TypeScript): `createAstroSiteLoader(options?)` with `env?` (default `process.env`), `dev?` (maps to `revalidate`), `fetch?`, `hints?`, returning `PublishedSiteLoader`. The site's `src/lib/lace.ts` passes `{ env: { ...import.meta.env, ...process.env }, dev: import.meta.env.DEV }`, because `import.meta.env` is not reliably transformed inside externalized dependencies. The module fails fast if evaluated in a browser, and `LACE_BUILD_TOKEN` never reaches client bundles.
- `@lacecms/astro/LaceBlocks.astro`: props `entry`, `blocks` (map), `mediaUrl`; resolves each block, parses it, and renders the mapped component with `BlockProps`.
- `@lacecms/astro/RichText.astro`: props `document`, optional `components` keyed by node or mark name, optional `context`; renders `describeRichText` output with Astro's escaping; overrides receive the validated element and its rendered children only.
- Shipped as `.astro` source with a peer dependency on the supported Astro range; no visual blocks, no client scripts, no Astro integration hook required.

### D6. Registry, site-local file, and block map

- `registry/registry.json` lists items; each item lives in `registry/<framework>/<item>/` with an item manifest declaring block type, framework, block definition version, item revision, required `@lacecms/render`/adapter ranges, files with target roles (`component`, `support`), and item dependencies. The registry is versioned with, and bundled into, the `@lacecms/cli` release (no network fetch).
- The `create-lace` starter and `apps/site` hold committed copies of the five built-in items exactly as `lace add block` would install them, and record them in their `lace.site.json`. A parity test fails on divergence from `registry/`.
- `lace.site.json` at the site root: format version, `framework`, `componentsDir` (default `src/components/lace`), `blockMap` (default `src/lace/blocks.ts`), optional `definitions` module for custom block definitions, and `items` with registry version and per-file SHA-256 hashes plus the map file hash. Configuration keys are user-editable; `items` and hashes are CLI-maintained.
- The block map file imports definitions — built-ins from `@lacecms/content`, custom ones from the recorded `definitions` module — and never copies them. It exports `blocks = defineBlockMap({...})`.
- Ownership: installed component files are user-owned and updated only while their hash matches; the map file is Lace-managed with the same hash rule and, on conflict, the CLI prints the exact entries to add; `lace.site.json` is Lace-managed metadata. Hash, conflict, and journal logic is shared with `lace upgrade` inside `@lacecms/cli`, not reimplemented.

Alternatives rejected: separate config and lock files (two files to keep consistent for one small record); editing a user's `BlockRenderer` source with AST transforms (violates the never-edit-user-source rule); fetching registry items over the network (adds availability, integrity, and offline concerns for no MVP benefit).

### D7. Framework selection

Framework keys are `astro` (implemented, default), and `react`, `vue`, `svelte` (reserved). Registry lookup, `lace.site.json`, and the adapter naming are keyed by framework; a reserved key fails with an explicit "framework not supported yet" error. Selection order: `lace.site.json`, then `--framework`, then detection from the site `package.json`, then `astro`. The render core is shared by all adapters.

### D8. Starter, reference site, and site modes

The `create-lace` starter is a minimal product template (home and posts pages, layout, global styles, registry blocks, `lace.site.json`, map file, loader file) without tests or fixtures. `apps/site` is the engine development playground and build fixture, may hold extra models, custom blocks, and edge-case content, and is never copied into generated projects. Project creation offers three site modes — `starter`, `existing`, `none` — recorded in `.lace/manifest.json` as the site mode and relative path; flags are fixed in 30E. `init .` keeps the empty-target rule in every mode, and the generator never modifies an existing site.

### D9. Compatibility posture

The public build-export DTO is unchanged; the loader hides the reuse of the content-entry schema. Step 30 may break alpha-era generated `site/` layouts deliberately; `lace upgrade` never rewrites `site/**`, and 30C/30E ship manual migration instructions.

## Risks / Trade-offs

- [Sites install four Lace packages instead of one] → The starter preconfigures them, and `lace add block` prints the exact `pnpm add` command; the explicit graph keeps one import path per symbol.
- [Shipping `.astro` source from npm depends on Vite handling the dependency] → 30C builds a project generated from the packed starter and an independent fixture site in CI.
- [Built-in definitions in the site may differ from the CMS configuration version] → `parseBlock` fails on schema-version mismatch with block identifiers, and `lace add block` reports definition-version mismatches before build.
- [Users edit the generated map file] → Hash detection prevents overwrite, and the CLI prints the entries to add manually.
- [Reserved framework keys over-generalize] → Only keys, lookups, and an explicit error exist; no adapter code is written until a framework is implemented.
- [Committed starter/`apps/site` copies of registry blocks can drift] → A parity test against `registry/` fails the build.

## Migration Plan

Documentation only. The architecture and ADR land before 30B. Existing alpha projects are unaffected until they adopt a release containing 30C/30E, which ship manual migration steps for user-owned `site/**`. Rollback is a documentation revert.
