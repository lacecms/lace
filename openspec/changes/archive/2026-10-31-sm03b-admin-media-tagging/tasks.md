## 1. Planning documents

- [x] 1.1 Mark SM3 / SM3B `in progress` in `docs/site-migration-roadmap.md`; verify the overview table and progress log agree

## 2. Foundations

- [x] 2.1 Re-export `normalizeMediaTag` from `packages/contracts/src/index.ts` next to the `MAX_MEDIA_ALT_LENGTH` re-export (design D3); verify `pnpm turbo run test typecheck --filter=@lacecms/contracts`
- [x] 2.2 Add `MAX_MEDIA_TAGS_PER_ITEM` (20) and `MAX_MEDIA_TAG_FILTERS` (5) to `apps/admin/src/entities/media` with a unit test asserting `mediaTagsInputSchema` rejects 21 distinct tags and `mediaListQuerySchema` rejects six `tag` values; verify the test passes
- [x] 2.3 Add `tag` to `MediaSearch` (`app/router/media-search.ts`) and to `MediaLibraryQuery`/`CanonicalMediaQuery`/`normalizedMediaQuery` (`widgets/media-library/library-query.ts`): accept a string or array, normalize, deduplicate, sort, keep the first five, omit when empty (design D4); verify `media-search.test.ts` and `library-query.test.ts` cover a single string, mixed-case and invalid tags, duplicates, seven tags and the empty list
- [x] 2.4 Add `tags` to `adminQueryKeys.mediaList` and add `adminQueryKeys.mediaTags(q)` under the media prefix (design D1, D5); verify `admin-client.test.ts` key expectations

## 3. Shared tag input

- [x] 3.1 Implement `useMediaTagSuggestions` (normalized prefix, 200 ms debounce, `listMediaTags({q, limit: 10})`, no request for invalid text, 30 s stale time) in `entities/media`; verify hook tests with a fake client for debounce, empty prefix, invalid text and failure
- [x] 3.2 Implement `MediaTagInput` and `isOpenTagCombobox` in `entities/media` per the "Tags are entered through a keyboard-operable autocomplete input" requirement and design D1: chips with named remove buttons, combobox ARIA, Arrow/Enter/comma/Backspace/Escape handling, normalization, invalid-text message, duplicate handling, limit message, live announcements, suggestions excluding chosen tags with counts, non-blocking suggestion failure; verify `MediaTagInput.test.tsx` covers every scenario of that requirement

## 4. Library and picker filters

- [x] 4.1 Add the tag filter group to `MediaToolbar` (`tags`/`onTagsChange`, label stating all tags must match, five-tag limit, Clear filters visible and clearing tags) per design D8; verify `MediaToolbar.test.tsx`
- [x] 4.2 Wire the filter into `MediaLibrary` (URL state through `MediaPage`, `tags` in the list request and key, Clear filters and no-match state clearing tags, pagination restart) and into `MediaPickerDialog` (local state reset on opening, `tags` in the request, Escape guard via `onEscapeKeyDown` and `isOpenTagCombobox`); verify `MediaLibrary.test.tsx` and `MediaPickerDialog.test.tsx` for the modified URL-state and picker scenarios

## 5. Tag editing in the details panel

- [x] 5.1 Extend `metadata-form.ts` with sorted `tags` values, set comparison and a full-set `tags` patch; widen `metadataIssue` to `/tags/<i>` (design D6); verify `metadata-form.test.ts` for add, remove, re-add, clear-all and only-changed patches
- [x] 5.2 Add the tag editor to `MediaMetadataForm` (20-tag limit, disabled while saving, tag validation error naming the tag, conflict "save over newer" replacing the tag set), invalidate the tag catalog after a tags save in `useMediaMetadataUpdate`, list tags read-only in `MediaDescription`, update the discard confirmation text, and add the Escape guard to `MediaDetailsPanel`; verify `MediaMetadataForm.test.tsx`, `useMediaMetadataUpdate.test.tsx` and `MediaDetailsPanel.test.tsx` for every scenario of the modified metadata-editing requirement

## 6. Tagged uploads

- [x] 6.1 Store `tags` per `MediaUploadEntry` through `add(files, { tags })`, pass them to `uploadMedia`, reuse them on retry (design D7); verify `useMediaUploads.test.tsx` for captured tags, retry after a filter change and untagged uploads
- [x] 6.2 Pass the active filter tags from `MediaLibrary` and the picker to the upload queue and show "New uploads are tagged …" for writers while a tag filter is active; verify library and picker unit tests for the hint and the upload request tags

## 7. End-to-end and documentation

- [x] 7.1 Add `apps/admin/e2e/media-tags.e2e.ts` with a mocked API: keyboard-only adding (suggestion and typed), removing and saving tags; invalid text; Escape closing suggestions without closing the panel; library filter with reload restoring chips and API tags; picker filter local and reset on reopen; upload under a filter carrying the tag; viewer read-only tags. Add the tag editor and filter to the axe scan in `accessibility.e2e.ts`; verify `pnpm --filter @lacecms/app-admin test:e2e` passes, including Chromium at 320 px for the toolbar
- [x] 7.2 Update `docs/media-tags.md` with the admin tagging UI (editor, filters, URL state, picker reset, tagged uploads) and remove "The tagging UI is delivered separately"; verify `pnpm docs:check` passes

## 8. Verification and completion

- [x] 8.1 Run `pnpm --filter @lacecms/app-admin test`, then root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and the remaining CI steps from `.github/workflows/ci.yml`; record results in `verification.md`
- [x] 8.2 Run `pnpm exec openspec validate sm03b-admin-media-tagging --type change --strict` and update the roadmap progress log; verify validation passes
