## Context

ADR 0006 and architecture §§6 and 13 (session 30A) fixed the package split and public names. The two sites still carry private copies of the loader (`site-data.ts`), field readers (`rendering.ts`), and a drifting rich-text allowlist (`rich-text.ts`). This change creates the shared, framework-neutral implementations; 30C then builds `@lacecms/astro` on them and migrates both sites.

Observed inputs:

- `@lacecms/sdk` already provides `createLaceClient` with `getBuildExport({ etag })` returning `{ changed, etag, export }`, typed errors (`LaceHttpError`, `LaceTransportError`, `LaceTimeoutError`, `LaceContractError`), and `getPublicMediaUrl`.
- The build-export DTO is `{ entries: { entry: ContentEntryDto, path }[], version }`; `entry.published` is optional in the schema although the server exports only published routes. Blocks are `ContentBlockDto` (`data`, `key`, `position`, `schemaVersion`, `type`).
- `@lacecms/content` provides `validateBlockData`, `BlockDefinition<Fields>`, `BlockDataValues<Fields>`, `validateRichTextDocument`, `isSafeUrl`, `ContentValidationError` (with `issues[].path`), and `builtInBlocks`.
- `scripts/check-boundaries.mjs` enforces package edges from a map and forbids Node built-ins only in `content` and `config`. `release/alpha.json` lists twelve scoped packages plus `create-lace`; `scripts/release-model.mjs` asserts the count.

## Goals / Non-Goals

**Goals:**

- One loader in `@lacecms/sdk` that reproduces the 29B dev revalidation and static memoization behavior without project-specific derivation.
- One render core in `@lacecms/render` whose parsing and rich-text checks are the CMS validators, not copies.
- Machine-enforced framework neutrality and a publishable `@lacecms/render`.

**Non-Goals:**

- Astro adapter, components, and environment glue (30C).
- Migrating or deleting the starter's and `apps/site`'s local files (30C); they keep working unchanged in this change.
- Registry, `lace.site.json`, CLI (30D); site modes (30E); block migration; a public DTO redesign (Step 33).

## Decisions

### D1. Loader module inside `@lacecms/sdk`

`packages/sdk/src/published-site.ts` holds the loader and is re-exported from `index.ts`. It uses `createLaceClient` for transport and media URLs, so token isolation, ETag validation, and contract parsing stay in one place. Public types: `PublishedSiteEnvironment`, `PublishedSiteLoaderOptions`, `PublishedSiteLoader` (`() => Promise<PublishedSite>`), `PublishedSite`, `PublishedEntry`, `PublishedBlock` (alias of `ContentBlockDto`), `PublishedSiteErrorCode`, and `LacePublishedSiteError extends LaceSdkError` with a readonly `code`.

Options: `environment`, `baseUrl`, `token`, `publicBaseUrl`, `expectedPublishedVersion` (number), `fetch`, `revalidate` (default `false`), `hints` (`Partial<Record<code, string>>`). Explicit values win over the record; blank strings count as absent.

Configuration is resolved lazily on each read, not at creation, because site loader files are evaluated at module load (architecture §13.7) and must not crash pages or tooling that never read content. Resolution errors are `missing_configuration`; an invalid base URL (the `TypeError` from `createLaceClient`) is wrapped with the setting name; an expected version must match `^\d+$`.

Alternative rejected: validating eagerly at creation. It would make `import { getSite }` throw in contexts without env (type generation, unrelated pages).

### D2. Read modes share one state machine

```text
static:     cached ??= read(no etag).catch(e => { cached = undefined; throw e })
revalidate: pending ??= read(current?.etag)
                .then(r => r.changed ? current = view(r) : current ?? invalid_export)
                .finally(() => pending = undefined)
```

Static mode keeps one promise per loader; revalidate mode keeps the last `{ etag, site }` and one in-flight promise. A revalidation failure leaves `current` untouched, so the next call still sends the last good ETag. View construction and the version check run inside the read, so a mismatched or invalid export is never cached.

### D3. Version check uses the export body

`version_mismatch` compares `export.version` (the DTO field) with the expected integer instead of string-comparing the ETag as the site copies did. The ETag remains only the conditional-read token. A `304` reuses a view whose version was already checked.

### D4. Site view construction

For each export entry: missing `published` → `invalid_export` naming the entry id. Entry = `{ id, modelKey: entry.model.key, path, slug?, title, fields, blocks }` from the published snapshot, blocks sorted by `position`, everything frozen. Indices: `Map<path, entry>` (duplicate path → `invalid_export`), `Map<modelKey, entry[]>` sorted by path using code-unit order (locale-independent, deterministic), and `Map<modelKey, Map<slug, entry>>` (duplicate slug within a model → `invalid_export`). Lookups use `Map`, so keys such as `constructor` cannot hit prototype properties. `mediaUrl` uses a token-less client built from `publicBaseUrl ?? baseUrl`. Paths are matched exactly; the loader never normalizes or derives routes.

### D5. Error mapping

| Source | Code |
| --- | --- |
| missing/invalid settings | `missing_configuration` |
| `LaceHttpError` 401/403 from the export | `rejected_token` |
| `LaceTransportError` (incl. timeout/abort) | `api_unavailable` |
| export version ≠ expected | `version_mismatch` |
| duplicate path/slug, missing published snapshot, `304` without prior export | `invalid_export` |
| any other error | rethrown unchanged |

The original error is the `cause`. Messages name settings (`LACE_BUILD_TOKEN`) but never values of the token; `hints[code]` is appended after a space.

### D6. `@lacecms/render` layout and types

`packages/render/src/index.ts` re-exports `blocks.ts`, `rich-text.ts`, and `errors.ts`. Dependencies: `@lacecms/content` only (no Valibot, no SDK, no contracts).

- `BlockContext { modelKey, entryId, blockKey }`.
- `RenderableBlock { type: string; key: string; position: number; schemaVersion: number; data: unknown }` — structural; `ContentBlockDto` (whose `data` is a JSON object) is assignable.
- `BlockDataOf<Definition>` infers `BlockDataValues<Fields>` from `BlockDefinition<Fields>`.
- `parseBlock(definition, block, context)`: type check → version check → `validateBlockData(definition, block.data, "publish")`; a `ContentValidationError` becomes `invalid_block_data` with the first issue's path (relative to the block data) as `fieldPath`.
- `BlockMapEntry<Definition, Component> { definition, component }`; `defineBlockMap(entries)` checks each own key against `definition.type` (throws `TypeError`, a configuration error outside the four render codes) and returns a frozen copy typed as the input. `BlockMap<Component>` is the general record type.
- `resolveBlock(map, block, context)` uses `Object.hasOwn`, then returns the entry or throws `unknown_block_type`.
- `BlockProps<Definition> { block, data: BlockDataOf<Definition>, context, mediaUrl }`.
- `prepareBlocks(map, entry, mediaUrl)` where `entry` is structural `{ id, modelKey, blocks: readonly RenderableBlock[] }` returns `readonly { component, props }[]` in block order. It is the one loop every adapter would otherwise duplicate; the Astro `<LaceBlocks>` becomes a map over its result. Added to architecture §13.3.

Alternative rejected: re-implementing per-field readers like `rendering.ts`. That is the drift this step removes.

### D7. Rich-text description

`describeRichText(value, context?)` calls `validateRichTextDocument`; failures become `invalid_rich_text` with `fieldPath = [...context.fieldPath, ...issue.path]`. `RichTextContext` is `{ block?: BlockContext; fieldPath?: readonly ValidationPathSegment[] }`. Output is `readonly RichTextDescriptionNode[]` (the document's children):

```text
RichTextText    { kind: "text", text }
RichTextElement { kind: "element", tag, attributes, source, children }
paragraph→p  heading→h1|h2|h3  bulletList→ul  orderedList→ol  listItem→li
blockquote→blockquote  hardBreak→br  bold→strong  italic→em  strike→s
code→code  link→a {href}
```

`source` is the Tiptap node or mark name so adapters can key overrides on it. Marks wrap text first-outermost, matching the current `RichTextMarks.astro` output so 30C keeps the generated HTML. The link `href` has already passed `isSafeUrl` via validation; the render core re-asserts it before emitting the attribute as defense in depth. All output objects are frozen. There is no HTML serializer, so no raw HTML string can be produced.

### D8. Errors in the render core

`LaceRenderError extends Error` with `code`, optional `context` (`BlockContext`), `fieldPath`, and `cause`. Message: `Cannot render block <key> of model <model> entry <entry>: <detail>` with `at field <path>` when a field path exists, e.g. `at field heading` or `at field body.content[0]`.

### D9. Boundary enforcement

`allowedDependencies` gains `@lacecms/render -> @lacecms/content`. A new `externalImportAllowlist` map restricts every non-relative import for listed packages: `@lacecms/render` → `{ @lacecms/content }`; `@lacecms/sdk` → `{ @lacecms/contracts, valibot }`. Node built-ins are therefore rejected for both. Fixture tests extend `tests/boundaries.test.mjs`. The `astro` and `apps/site` edges are added by 30C together with the code that uses them.

### D10. Tests and the contract type test

- `packages/sdk/src/published-site.test.mjs` with an injected `fetch`: configuration precedence and lazy errors, static sharing and retry, revalidate ETag reuse/replacement/concurrency/failure retention, `304` without prior export, version mismatch, 401/403, transport failure, passthrough of other errors, hints, token absence from messages, duplicates, view shape and immutability, media origin.
- `packages/render/src/index.test.mjs`: every built-in block, a custom `defineBlock` with defaults, invalid data, type and version mismatch, map key mismatch, unknown type and inherited keys, `prepareBlocks` order and props, rich-text mapping, and a parity corpus (valid and invalid documents including the three drift cases) asserting `describeRichText` succeeds exactly when `validateRichTextDocument` does.
- Contract type test: `packages/render/type-tests/contract-block.type-test.ts` asserts `ContentBlockDto` is assignable to `RenderableBlock`. It lives outside `src`, so it is not part of the published package or the boundary scan; `@lacecms/contracts` is a render dev dependency used only there. The package `typecheck` script runs it, so CI enforces it.
- The boundary script fixtures prove a framework import in render and a Node import in sdk fail.

### D11. Release inclusion

`@lacecms/render` is published at the shared alpha version with `publishConfig.access: public`, Node engine `>=24.12.0 <25`, and `files: ["dist"]`. `release/alpha.json` lists `render`; the allowlist count becomes 14 artifacts; `docs/alpha-release.md` lists thirteen scoped packages. No template depends on it until 30C.

## Risks / Trade-offs

- [Rejecting entries without a published snapshot could break a build the old copies tolerated] → the server only exports published routes, so this signals a contract violation; failing loudly beats silently dropping a page.
- [Code-unit path ordering differs from the old `localeCompare`] → only affects non-ASCII path ordering in listings; deterministic order across machines is the stronger property. Documented in the spec as "ordered by path".
- [A test-only dev dependency on contracts in `render`] → kept out of `src`, out of `dist`, and out of `dependencies`; the boundary rule targets shipped source.
- [Sites keep their local copies until 30C] → no behavior changes in this session; 30C deletes them and adds the parity test.

## Migration Plan

Additive. New exports and a new package; no existing API, DTO, template, or generated file changes. Rollback is removing the package and exports.

## Open Questions

None.
