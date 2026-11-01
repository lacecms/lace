## 1. Architecture and planning documents

- [x] 1.1 Update `docs/mvp-architecture.md` §8 (gallery bullet: version 5, item `kind`, video fields, rules, identity migration 5) and §13.5 (the script exception also covers gallery ambient mounting; video cells, image-only lightbox/links); add the shipped-example note to `docs/adr/0018-conditional-fields.md`; mark SM5D `in progress` in `docs/site-migration-roadmap.md` and add the `LaceVideo` shared-primitive idea to `backlog.md`; verify with `git diff` that no other invariant changes

## 2. Content definition

- [x] 2.1 Extract the `videoEmbed` `aspectRatio` and `playback` select descriptors into shared constants and use them in `videoEmbed.settings`; verify a content test that the `videoEmbed` metadata projection and the structural and projection hashes of a configuration registering only `videoEmbed` are unchanged
- [x] 2.2 Move `builtInBlocks.gallery` to version 5 per design D1: item fields in the declared order, `kind` choice cards, `videoUrl`, `videoTitle`, shared `playback`/`aspectRatio`, the `visibility` map, list label "Images and videos", updated caption and block descriptions, identity migration 5; verify `packages/content` tests for metadata order, rules, defaults, publish/draft validation of image and video items, the hidden-values projection, provider rejection, migrating v1 and v4 data, and type tests that published items have required `kind` and optional `media`/`videoUrl`/`videoTitle`
- [x] 2.3 Verify schema evolution: a configuration-sync test migrates draft, published and hidden version 4 gallery blocks to version 5 with unchanged data, media usage, settings and envelope, on SQLite and the D1 repository contract suite, and publication of a mixed gallery omits hidden values on both runtimes

## 3. Registry component

- [x] 3.1 Update `registry/astro/gallery/GalleryBlock.astro` per design D3–D5: `data-lace-kind` on items, image branch unchanged with dialog indexes over all items, video branch with player/ambient/noscript markup, caption and source link, typed narrowing, ambient-only mounting script scoped to gallery video figures; verify Astro container tests in `packages/astro` for image items (markup equal to revision 6 apart from `data-lace-kind`), player and ambient video items, lightbox indexes with a video between images, and equal iframe attributes to `videoEmbed` for the same URL
- [x] 3.2 Add `registry/astro/gallery/GalleryVideo.css` (ratio rules by data attribute with 16:9 base, ambient overlay, focus-revealed hidden source link, `@layer lace-layout` with `:where()`), import it from the component; verify registry tests assert no inline style and no `<style>` element and that the stylesheet is declared
- [x] 3.3 Advance `registry/astro/gallery/item.json` to `blockVersion` 5, revision 7 with the new stylesheet, update `registry/registry.json` and the CLI bundled copy; verify `packages/cli` registry tests and `lace add block gallery` tests for a clean update that adds `GalleryVideo.css` and an edited-component conflict with a `.new` proposal
- [x] 3.4 Add a browser test of a built page with two galleries and a `videoEmbed` block: each ambient item mounts exactly one ambient iframe with no tab stop after repeated initialization, reduced-motion emulation yields player iframes, JavaScript disabled shows the noscript players and visible source links, and neither script mounts into the other block; verify it passes in Chromium

## 4. Admin

- [x] 4.1 Add the choice helper to `apps/admin/src/entities/content/media-list.ts` per design D6; verify `media-list` tests for the gallery (`Video` with `kind: "video"` starting value), a custom select with several hiding options and no presentation, a rule-less media field and a boolean controller (no choices), and a declared item default being cloned
- [x] 4.2 Render the "Add {choice}" buttons in the `FieldRenderer` list toolbar after Add using the existing insert path; verify `FieldRenderer` tests for appending one open focused video item with the announcement, dirty state, disabled state at the list maximum and budget, busy state, and no buttons for viewers
- [x] 4.3 Add `EmbedUrlPreview` with the `appliesTo` predicate per design D7, make `previewLeaf` honor `appliesTo`, register it in `EntryPage`; verify `item-summary` and component tests for a video row with title, with caption, with no values, an unparseable URL, a navigation URL row and a gallery image row unchanged, and no "No alt" on a video item with a stale hidden `media`
- [x] 4.4 Add `apps/admin/e2e/gallery-video-items.e2e.ts`: add images through the picker, "Add Video", fill URL and title, choose ambient and 1:1, switch an item's Type back and forth keeping values, collapsed rows, save request shape, and axe at 320 px; verify `pnpm --filter @lacecms/admin exec playwright test gallery-video-items.e2e.ts` and the existing `media-multi-select` and `conditional-fields` journeys pass

## 5. Media library toolbar

- [x] 5.1 Add the `inline` variant to `MediaTagInput` per design D8 (sr-only label, chips inside one bordered field with a tag icon, click-to-focus, extra description id) keeping `field` as default; verify `MediaTagInput` tests for both variants: accessible name and description, chip removal, Backspace, suggestions, Escape and the limit message unchanged
- [x] 5.2 Rework `MediaToolbar` into the two-row layout with the segmented type filter, the inline tag filter, the "About tag filters" information icon with the tooltip, and Clear filters at the end of row two, stacking below 40rem; verify `MediaToolbar`, `MediaLibrary` and `MediaPickerDialog` tests for control order, pressed states, tooltip on hover and focus, Escape closing only the tooltip inside the picker, and unchanged URL/local filter state
- [x] 5.3 Extend the media library and picker e2e journeys with the wide two-row layout, the 320 px stacked layout without horizontal scrolling, chips wrapping inside the field, and axe checks in both; verify the media-tag and `media-multi-select` journeys pass

## 6. Sites, templates and fixtures

- [x] 6.1 Raise model versions in root `lace.config.ts` that allow `gallery`; update api/server/worker tests that pin model versions; verify the affected package tests pass
- [x] 6.2 Update `apps/site` component copy, `GalleryVideo.css`, `lace.site.json` hashes and `src/fixtures/published-export.json` (gallery version 5 with an ambient 1:1 Vimeo item and caption); verify the `apps/site` fixture-build test for the `astro-reference-site` delta and that static HTML has no live ambient iframe
- [x] 6.3 Update the create-lace starter (model versions, component copy, stylesheet, `lace.site.json`), bump `TEMPLATE_VERSION` and `.lace/upgrade-instructions.json` to 0.45.0 with the adoption steps (raise model versions, configuration sync, `lace add block gallery`, `block_version_mismatch`, narrowing copied components), refresh generated-project snapshots; verify create-lace tests and `pnpm acceptance:starter`
- [x] 6.4 Update `tests/fixtures/existing-astro-site` copies and hashes and the cross-runtime/acceptance fixtures that pin gallery version 4 (`tests/fixtures/cross-runtime/expected.json`, acceptance scripts); verify `pnpm acceptance:existing-site` and the cross-runtime suite
- [x] 6.5 Add one gallery video item to `apps/docs/public/examples/content-import/lace-import.json` and the guide example; verify the root sample validity/guide-equality test and `lace import --dry-run` validation in its test

## 7. Documentation

- [x] 7.1 Document gallery video items per the `public-documentation` delta in the public block reference, editing-content, conditional-fields and astro-integration pages, the starter `templates/docs/lace-astro-site.md`, `docs/site-styling.md` and `docs/compatibility.md`; verify `pnpm docs:check` and `pnpm docs:build` pass and the guide snippets match the registry component

## 8. Verification and completion

- [x] 8.1 Run the admin unit suite and full admin Playwright suite, root `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (release test on pinned Node 24.12.0), `pnpm build`, `pnpm openapi:check` and the CI steps in `.github/workflows/ci.yml` covering acceptance and `spec:validate`; record a short summary and any pre-existing failures with evidence in `verification.md`
- [x] 8.2 Run `pnpm exec openspec validate sm05d-gallery-video-items --type change --strict` and add the roadmap progress-log row; verify validation passes
