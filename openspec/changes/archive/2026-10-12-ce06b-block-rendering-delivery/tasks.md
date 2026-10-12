## 1. Render core

- [x] 1.1 In `packages/render/src/blocks.ts` and `errors.ts`, per design D1–D2:
  - extend `RenderableBlock` with optional `anchor`, `className`, `hidden` and `settings`;
  - add `BlockSettingsOf<Definition>`, make `AnyBlockDefinition` `BlockDefinition<any, any>`, and add `anchor?`, `className?` and typed `settings` to `BlockProps`;
  - add the `invalid_block_envelope` error code and an exported `parseBlockEnvelope(definition, block, context)`;
  - make `prepareBlocks` skip hidden blocks before resolving and pass the parsed envelope into props.

  Add tests to `src/index.test.mjs` for every scenario of the render-core delta: hidden skip (order kept), a hidden block of an unknown type, old version and invalid data, anchor and normalized class name in props, no envelope (no keys, `{}` settings), settings defaults, undeclared setting, invalid anchor and invalid class name, each naming the block context and field path. Verify with `pnpm turbo run test --filter=@lacecms/render`.
- [x] 1.2 Extend `packages/render/type-tests/contract-block.type-test.ts`: the admin `ContentBlockDto` and the public `PublicBlockDto` satisfy `RenderableBlock`; `BlockProps<typeof banner>["settings"]` is exactly the declared settings record with every key required; a definition without settings yields an empty record; a block map accepts a definition with settings. Verify with `pnpm --filter @lacecms/render typecheck`.

## 2. Astro adapter

- [x] 2.1 Update `packages/astro/src/index.test.mjs`: a fixture component that renders `anchor`, `className` and a declared setting, an entry with a hidden block between two visible ones, and an invalid envelope failing with `invalid_block_envelope`; keep `LaceBlocks.astro` adding no wrapper. Verify with `pnpm turbo run test --filter=@lacecms/astro`.

## 3. Block sources and CLI

- [x] 3.1 Rewrite the five `registry/astro/*/*.astro` sources per design D3 and bump the manifests to revisions `cta` 2, `hero` 3, `image` 4, `quote` 2, `richText` 2. Copy them byte-identically to `apps/site`, `packages/create-lace/templates/site` and `tests/fixtures/existing-astro-site`, and update each `lace.site.json` revision and hash. Verify with `pnpm exec vitest run tests/block-sources.test.mjs --exclude '.release-artifacts/**'`.
- [x] 3.2 Update `renderCustomScaffold` in `packages/cli/src/blocks-map.ts` to destructure `anchor` and `className` and bind `class` and `id` on the root per design D3, and update the CLI tests that pin scaffold output, registry revisions or hashes (`blocks-site.test.mjs` and others found by the failing run). Verify with `pnpm turbo run test --filter=@lacecms/cli`.

## 4. Reference site

- [x] 4.1 Apply the fixture changes of design D4 to `apps/site/src/fixtures/published-export.json`, and extend `apps/site/src/fixture-build.test.mjs` with the astro-reference-site delta scenarios (the `#get-started` link, exactly one `id="get-started"` on `<aside class="cta cta--highlight" …>`, the `full-bleed` figure without `id`, no `id` on about and note block roots), adjusting the existing hero/root regexes only where the fixture changed. Verify with `pnpm turbo run test --filter=@lacecms/app-site`, then `pnpm exec vitest run tests/existing-astro-site.test.mjs tests/regression-helpers.test.mjs --exclude '.release-artifacts/**'`.

## 5. Template 0.26.0

- [x] 5.1 Set `TEMPLATE_VERSION` to `0.26.0` and update `packages/create-lace/templates/.lace/upgrade-instructions.json` with the template version, the three `0009` `database` entries and the "Template 0.26.0: …" `configuration` entry of design D5. Update `packages/create-lace/src/index.test.mjs` and `packages/cli/src/upgrade-command.test.mjs`. Verify with `pnpm turbo run test --filter=create-lace --filter=@lacecms/cli`.
- [x] 5.2 Update the managed guides per design D5: `templates/docs/lace-astro-site.md` (envelope props, a custom block with a declared setting, the hidden-block rule, the styling note) and `templates/docs/lace-operations.md` (styling note). Verify with `pnpm exec vitest run tests/consumer-guides.test.mjs --exclude '.release-artifacts/**'` and `pnpm format:check`.
- [x] 5.3 Extend `scripts/generated-project-acceptance.mjs` per design D4: the starter journey asserts the home `#get-started` link and the `cta cta--highlight` root with `id="get-started"`; the Node journey saves the anchored, classed hero and a hidden quote and asserts the built page. Regenerate `tests/fixtures/generated-project/*.json` with `node scripts/generated-project-acceptance.mjs snapshots --update`, and verify with `pnpm exec vitest run tests/generated-project-acceptance.test.mjs --exclude '.release-artifacts/**'`, `pnpm acceptance:starter` and the template upgrade phase (`node scripts/generated-project-acceptance.mjs upgrade`).

## 6. Documentation

- [x] 6.1 Update `docs/mvp-architecture.md` sections 13.3, 13.4, 13.5 and 13.7 (and section 11 where it describes block props) per design D6, add the "Rendering (CE6B)" note to `docs/adr/0012-block-envelope.md`, update `docs/site-styling.md` and `docs/compatibility.md` (template `0.26.0`, render API additions, `invalid_block_envelope`, block revisions and adoption), and keep the CE6 roadmap status `in progress`. Verify links resolve and `pnpm format:check` passes.

## 7. Verification

- [x] 7.1 Run root `pnpm test`, `pnpm typecheck` (`--concurrency=1` if the known cold-cache race appears), `pnpm lint`, `pnpm format:check`, `pnpm acceptance:starter` and `pnpm exec openspec validate ce06b-block-rendering-delivery --type change --strict`. Record any environment-limited step (for example the Docker-based Node journey) and why it was skipped.

## Verification notes

- 2026-10-12: root `pnpm test` (40/40 tasks plus the root test files), `pnpm typecheck` (35/35), `pnpm lint` (only pre-existing warnings), `pnpm format:check`, `pnpm acceptance:starter`, the template upgrade phase (`node scripts/generated-project-acceptance.mjs upgrade`), the generated-project snapshot check and `openspec validate ce06b-block-rendering-delivery --type change --strict` passed.
- Not run: the Docker-based generated Node journey (`pnpm acceptance:generated`), so its new hero anchor and hidden-quote assertions are checked only by `node --check`; the packed starter journey covers the rendered anchor, class and in-page link.
- `RenderableBlock` members admit `undefined` because Valibot types optional DTO keys as `T | undefined`; the type test caught it and design D1 records it.
- Task 2.1 renders `LaceBlocks.astro` for real through Astro's container API: `packages/astro` gains `vitest.config.mjs` (`getViteConfig`), `test-fixtures/` components outside `src/` (so they are neither packed nor counted as shipped components) and an explicit `@lacecms/content` dev dependency.
- The project-generator delta was corrected during implementation: migration `0009` is additive, but an older engine would deliver hidden blocks, so rolling back once envelopes exist restores the backup, as `docs/database-migrations.md` already states.
