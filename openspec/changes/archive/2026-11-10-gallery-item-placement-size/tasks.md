## 1. Content definitions

- [x] 1.1 Remove `featured-first` from `layoutPreset` and add `listLayoutItemFields()` (`placement`, design D1) in `packages/content/src/blocks/list-layout.ts`, export it from `packages/content/src/index.ts`; verify `list-layout.test.ts` covers the options, default, cards, rejection of `featured-first` and `center`, and adoption by a custom card-list item group
- [x] 1.2 Add `blocks/gallery-migration.ts` with the version 6 migration (design D6) and its tests: featured-first rewrite with and without items and in flex mode, `player` written only to video items without `playback`, ordinary galleries unchanged, a version 4 input refused with `missing_step`
- [x] 1.3 Advance `gallery` to version 6 in `built-ins.ts`: item `placement`, image-only `size`, gallery-owned `playback` default `ambient`, `size` visibility, migration 6 (design D5, D6); verify `built-ins.test.ts` and the type test cover the gallery-block scenarios and `videoEmbed` still defaults to `player`, then run `pnpm --filter @lacecms/content test`

## 2. Registry component and stylesheet

- [x] 2.1 Replace the `featured-first` rules in `registry/astro/gallery/ListLayout.css` with the grid placement rules (design D2) and update `GalleryBlock.astro`: `data-lace-placement` on every item, `data-lace-size` on image items, natural sizes (design D4), `ambient` fallback; set `item.json` to revision 8 / block version 6
- [x] 2.2 Update `packages/astro/src/registry-blocks.test.ts` and the `CardList` fixture for the new hooks, natural sizes and the removed preset; verify `pnpm --filter @lacecms/astro test` passes
- [x] 2.3 Copy the component and stylesheet byte-identically to `apps/site`, `packages/create-lace/templates/site` and `tests/fixtures/existing-astro-site`; verify the shared-source drift test and `pnpm --filter @lacecms/cli test` (bundled registry) pass

## 3. Sites, models and themes

- [x] 3.1 Advance the root `lace.config.ts` models that allow `gallery` and the starter template's two models by one version; add an application configuration-sync test in which a stored version 5 `featured-first` gallery with a defaulted video item is planned and applied to version 6, and verify `pnpm --filter @lacecms/application test` passes
- [x] 3.2 Apply the theme rules of design D3 to `apps/site/src/styles/site.css` and the starter `global.css`; move the reference fixture galleries to `schemaVersion` 6 with an `end` item, a `full` item and a `natural` image; verify `apps/site` fixture build tests assert the hooks, the natural sizes and the 4:3 crop of `fill` images only
- [x] 3.3 Extend `apps/admin/e2e/list-layout-css.e2e.ts` for the placement scenarios (right column only, any item spans, start begins a row, narrow and flex lists) and add a reference-site browser check of the natural image at 1280 and 320 pixels without horizontal overflow; replace `featured-first` in `EntryPageListLayouts.test.tsx` and `list-layouts.e2e.ts`; verify the admin unit test and both e2e suites pass

## 4. Generator and documentation

- [x] 4.1 Extend the `0.48.0` configuration entry of `templates/.lace/upgrade-instructions.json` with the gallery steps (design D7), update `templates/docs/lace-astro-site.md` (gallery version 6, placement, size, theme snippet, featured-first migration for custom blocks), regenerate snapshots with `node scripts/generated-project-acceptance.mjs snapshots --update`, and verify the snapshot phase and the generator packaged tests pass
- [x] 4.2 Update `apps/docs` composites (presets table, `listLayoutItemFields()`, custom-block migration) and Astro integration pages, and architecture §8 in `docs/architecture/content-configuration.md`; verify `pnpm docs:check` and `pnpm vitest run tests/docs-links.test.mjs tests/architecture-document.test.mjs` pass
- [x] 4.3 Remove the gallery item from `backlog.md` (now delivered by this change) and record the progress-log row in `docs/refactoring-roadmap.md`

## 5. Verification

- [x] 5.1 Run `node scripts/generated-project-acceptance.mjs starter` and `node scripts/generated-project-acceptance.mjs upgrade`, and verify the starter renders version 6 galleries and the rc2 template upgrade still passes
- [x] 5.2 Run root typecheck, Oxlint, Oxfmt check, `pnpm test` and `pnpm exec openspec validate gallery-item-placement-size --type change --strict`; verify all pass
