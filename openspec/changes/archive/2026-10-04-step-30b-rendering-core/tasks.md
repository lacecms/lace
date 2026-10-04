## 1. Architecture and roadmap alignment

- [x] 1.1 Add `prepareBlocks` (design D6) to architecture §13.3 next to `resolveBlock`, and clarify in roadmap Session 30B that the site-local copies are deleted when 30C migrates both sites; verify with a search that §13.3 and the roadmap name the same render-core APIs as the `render-core` delta spec.

## 2. Published-site loader in `@lacecms/sdk`

- [x] 2.1 Add `packages/sdk/src/published-site.ts` with the option, view, entry, block, and error types and `LacePublishedSiteError` (design D1, D5), plus lazy configuration resolution with precedence and blank-as-absent handling; re-export from `src/index.ts` and verify `pnpm --filter @lacecms/sdk typecheck` passes.
- [x] 2.2 Implement static and revalidate read modes, the expected-version check on `export.version`, and site-view construction with duplicate path/slug and missing-snapshot rejection, ordering, immutability, and media URLs (design D2–D4); verify with the tests in 2.3.
- [x] 2.3 Add `packages/sdk/src/published-site.test.mjs` covering every `published-site-loader` scenario (precedence, lazy configuration, missing token without request, static sharing and retry, revalidate ETag reuse/replace/concurrency/failure retention, `304` without prior export, version mismatch, 401/403, transport failure, passthrough of HTTP 500, hints, token absent from messages, duplicate path and slug, any model key, unknown lookups, immutability, public media origin); widen the sdk test script to all `src` tests and verify `pnpm --filter @lacecms/sdk test` passes.

## 3. Render core package `@lacecms/render`

- [x] 3.1 Scaffold `packages/render` (package manifest at the shared alpha version with public publish config, Node engine, `files: ["dist"]`, dependency on `@lacecms/content` only, dev dependency on `@lacecms/contracts` for the type test; tsconfig; lint/test/build/typecheck scripts) and run `pnpm install`; verify `pnpm --filter @lacecms/render build` emits `dist/index.js` and `dist/index.d.ts`.
- [x] 3.2 Implement `errors.ts` (`LaceRenderError`, codes, message format) and `blocks.ts` (`BlockContext`, `RenderableBlock`, `BlockDataOf`, `parseBlock`, `BlockMapEntry`, `BlockMap`, `defineBlockMap`, `resolveBlock`, `BlockProps`, `prepareBlocks`) per design D6 and D8; verify with the tests in 3.4.
- [x] 3.3 Implement `rich-text.ts` (`RichTextContext`, description node types, `describeRichText`) per design D7, reusing `validateRichTextDocument` and `isSafeUrl` exclusively; verify with the tests in 3.4.
- [x] 3.4 Add `packages/render/src/index.test.mjs` covering every `render-core` scenario: all five built-in blocks, a custom block with defaults, missing required data with field path, type and version mismatch, map key mismatch, frozen map, unknown and inherited block types, `prepareBlocks` order and props, rich-text element mapping and mark order, and the parity corpus including `https:example.com`, `mailto:` without `@`, and paragraph-in-paragraph; verify `pnpm --filter @lacecms/render test` passes.
- [x] 3.5 Add `packages/render/type-tests/contract-block.type-test.ts` asserting `ContentBlockDto` is assignable to `RenderableBlock` and that `BlockProps<typeof builtInBlocks.hero>["data"]` has a required `heading: string`; run it from the package `typecheck` script and verify `pnpm --filter @lacecms/render typecheck` passes and fails when the assignment is broken.

## 4. Governance and release

- [x] 4.1 Extend `scripts/check-boundaries.mjs` with the `render -> content` edge and the external-import allowlist for `@lacecms/render` and `@lacecms/sdk` (design D9); add fixture cases to `tests/boundaries.test.mjs` for a framework import and Node import in render, a Node/framework import in sdk, and a permitted content import; verify `node scripts/check-boundaries.mjs` and `pnpm exec vitest run tests/boundaries.test.mjs` pass.
- [x] 4.2 Add `render` to `release/alpha.json`, raise the allowlist count in `scripts/release-model.mjs` and `tests/release-model.test.mjs` to fourteen artifacts, and update `docs/alpha-release.md` to thirteen scoped packages; verify `pnpm exec vitest run tests/release-model.test.mjs` passes and `validateReleaseModel` closes over fourteen artifacts including `@lacecms/render` (`pnpm release:check` stops earlier at the pre-existing template-identity check: `release/alpha.json` still names template `0.4.0` while the generator is at `0.8.0`, a release-preparation step outside this change).

## 5. Verification

- [x] 5.1 Run `pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, and `pnpm exec openspec validate step-30b-rendering-core --type change --strict`; verify all pass and that `git status` shows no change to `apps/site/**` or `packages/create-lace/templates/**`.
