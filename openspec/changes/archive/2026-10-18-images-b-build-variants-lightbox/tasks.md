## 1. Render core and SDK

- [x] 1.1 Add optional `mimeType` and `sourceUrl` to `RenderableMedia` and `ImageDescription` in `packages/render/src/blocks.ts`; copy them in `createImageDescriber` when present; extend `packages/render/src/index.test.mjs` with the media-type, build-source, missing-source and unresolved-fallback scenarios (render-core spec)
- [x] 1.2 Add `sourceUrl` to `PublishedMedia` from the unauthenticated API-base client and the `optimizeImages` loader option (default `true`) in `packages/sdk/src/published-site.ts`; test public-origin, export-URL, switched-off, `image()` and token-free cases in `published-site.test.mjs` (published-site-loader spec)

## 2. Adapter image component

- [x] 2.1 Create `packages/astro/src/images.ts`: `variantWidths`, `laceImageConfig(env)`, WebP alpha detection, blurred SVG placeholder builder, and the placeholder resolver with the in-process promise map and the `node_modules/.astro/lace/placeholders` disk cache; export them from `src/index.ts`; forward `optimizeImages` from `createAstroSiteLoader` (design D1–D5)
- [x] 2.2 Unit-test `images.ts`: widths for 3000/1200/800/600 px, remote pattern with base path, default port and missing/invalid URL, VP8/VP8X/VP8L alpha detection, placeholder skipped for GIF, alpha and missing `transform`, one fetch for concurrent calls, cache hit without fetch, non-2xx error naming the URL
- [x] 2.3 Create `packages/astro/src/LaceImage.astro` rendering variants (`getImage`), placeholder style, `loading`/`decoding`/`fetchpriority`, attribute pass-through, unoptimized fallback and the invoker-command lightbox; add the `./LaceImage.astro` export, copy it in `copy-components.mjs`, and keep the package free of scripts and integrations (astro-adapter spec, D6)
- [x] 2.4 Container-render tests for `LaceImage.astro`: srcset/sizes/width/height for a sourced image, fallback without `sourceUrl`, eager hero attributes, lightbox markup and accessible names with and without alt, no button or dialog when off; update the packed-adapter test to expect the image component

## 3. Built-in blocks

- [x] 3.1 Move `image` to version 3 and `gallery` to version 2 with the `lightbox` boolean setting and identity migrations in `packages/content/src/index.ts`; update content unit and type tests for migration, settings parsing and metadata (block-registry spec, D7)
- [x] 3.2 Bump root `lace.config.ts` models (`home` 6, `about` 5, `posts` 6, `notes` 5) and re-pin affected fixtures and tests: `packages/config/src/config.projection.fixture.json`, config hash tests, configuration evolution/migration tests, `apps/api` project-config/content-sync/node-server tests, `packages/platform-cloudflare` worker test

## 4. Registry components

- [x] 4.1 Render `image` (revision 5, blockVersion 3), `gallery` (revision 2, blockVersion 2) and `hero` (revision 4) through `LaceImage` with the specified sizes, lightbox identifiers and eager hero; update `registry/astro/*/item.json` (block-source-registry spec)
- [x] 4.2 Extend `packages/astro/src/registry-blocks.test.mjs` for lightbox on/off, per-item gallery identifiers and the eager hero; update CLI registry/site/command tests for the new revisions and hashes

## 5. Reference site and existing-site fixture

- [x] 5.1 Copy the three components into `apps/site`, update `lace.site.json`, add `laceImageConfig` to `apps/site/astro.config.mjs`, set `optimizeImages` in fixture mode only for an explicit `LACE_API_BASE_URL`, and add lightbox styles to `site.css`
- [x] 5.2 Update the fixture export (image v3 with lightbox on, gallery v2 with lightbox on, image with default setting; media types for an opaque JPEG, a transparent PNG and an animated GIF) and `fixture-build.test.mjs`: serve generated images from a local media server, assert variants in `dist/_astro`, placeholders, lightbox markup and the offline default build (astro-reference-site spec)
- [x] 5.3 Update `tests/fixtures/existing-astro-site` components, lock and `astro.config.mjs`, and `tests/existing-astro-site.test.mjs`

## 6. Starter template 0.32.0

- [x] 6.1 Starter `lace.config.ts` (`home` 3, `posts` 3), site components, `lace.site.json`, `astro.config.mjs` with `.env` parsing and `laceImageConfig`, `global.css` lightbox rules; advance the template version and inventory
- [x] 6.2 Add 0.32.0 upgrade instructions and the site-guide section (variants, placeholder, lightbox and browser support, `sizes`, `optimizeImages`, remote allowance, caches); refresh generated-project fixtures and snapshots, create-lace and upgrade-command tests (project-generator spec)

## 7. Cross-runtime and acceptance expectations

- [x] 7.1 Update `scripts/cross-runtime-astro.mjs` and `tests/fixtures/cross-runtime/expected.json` (and other acceptance scripts asserting `<img>` markup) for optimized output, and run the cross-runtime product phase

## 8. Documentation

- [x] 8.1 Update `docs/mvp-architecture.md` (§11 settings of built-ins, built-in block list, §13.2 `sourceUrl`/`optimizeImages`, §13.3 description fields, §13.4 `LaceImage`/`laceImageConfig`, §13.5 registry components), `docs/site-styling.md` (lightbox parts) and `backlog.md` (B done)

## 9. Boundary rule

- [x] 9.0 Allow `astro:` virtual modules and `node:` builtins in the Astro adapter in `scripts/check-boundaries.mjs`, keep rejecting bare builtins (`astro-node` fixture now imports `fs/promises`), extend the `allowed` fixture, and record the workspace-governance delta (owner decision during apply)

## 10. Verification

- [x] 10.1 Run focused package tests (render, sdk, astro, content, config, cli, create-lace, app-site), then root `pnpm test`, `pnpm typecheck`, Oxlint, `pnpm format:check` (Oxfmt), `pnpm openapi:check`, and `openspec validate images-b-build-variants-lightbox --type change --strict`
