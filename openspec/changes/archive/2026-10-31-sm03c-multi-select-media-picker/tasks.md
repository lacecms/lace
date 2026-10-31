## 1. Planning documents

- [x] 1.1 Mark SM3 / SM3C `in progress` in `docs/site-migration-roadmap.md` and add a progress-log row for `sm03c-multi-select-media-picker`; verify the overview table and progress log agree

## 2. Eligibility, item values and capacity

- [x] 2.1 Add `apps/admin/src/entities/content/media-list.ts` with `mediaListTarget`, `mediaListItems` and `mediaIdsInList` (design D4) and export them from `entities/content`; verify `media-list.test.ts` covers a scalar media item, the built-in gallery group, a group with a non-required media field, a group with two media fields, a group without media, a declared item default whose media is replaced, child defaults kept, detached copies, and non-string media values ignored by `mediaIdsInList`
- [x] 2.2 Add `mediaListCapacity` returning `{ capacity, cause }` using a caller-supplied fit check (design D4); verify unit tests for 47 of 50 (capacity 3, cause `list`), a 495-element budget with a 100-item list holding 10 (capacity 5, cause `budget`), nested list defaults of two values at 491 (capacity 3), an exact 500 boundary, and a full list (capacity 0)

## 3. Picker multiple mode

- [x] 3.1 Add `mode="select"` to `MediaGrid` (design D2): `aria-pressed` toggles, filename as name, alt text, "Already in <target>" note and limit reason in the description, check plus one-based position badge, `aria-disabled` unselected tiles at capacity that stay focusable and ignore activation; verify `MediaGrid.test.tsx` for pressed state, numbering, already-used note, capacity blocking and unchanged `choose`/`open` modes
- [x] 3.2 Add the optional `selection` prop to `UploadQueue` rendering a pressed "Select <filename>" toggle on confirmed rows, a blocked reason when the selection is full, and no toggle on rejected or failed rows; verify `UploadQueue.test.tsx`, including that the single-mode Use action is unchanged
- [x] 3.3 Implement multiple mode in `MediaPickerDialog` (design D1, D3): typed `selection` union, multiple-mode title and description, ordered selection held by identifier across search, type, tag, sort and Load more, live status with selected and remaining counts and limit message, Clear selection, footer with Cancel and "Add N images"/"Add 1 image" disabled when empty, confirm handing items in order, Escape/Cancel/close discarding, empty selection on every opening, automatic selection of confirmed uploads while capacity remains with blocked rows otherwise, and no current-item marking; verify `MediaPickerDialog.test.tsx` covers every scenario of the "media picker offers a multiple selection mode" requirement and that the existing single-mode scenarios still pass
- [x] 3.4 Export `MediaListPicker` from `widgets/media-library`, adapting `MediaListPickerProps` (design D5) to `MediaPickerDialog` with `selection` and mapping confirmed items to identifiers; verify a unit test that confirming hands identifiers in selection order and that viewers never get multiple mode

## 4. Editor integration

- [x] 4.1 Declare `MediaListPickerProps` in `entities/content/field-types.ts` and add the optional `mediaListPicker` slot to `FieldRendererProvider` context (design D5); verify `pnpm --filter @lacecms/app-admin typecheck` and `node scripts/check-boundaries.mjs` pass
- [x] 4.2 Change `ListNode` (design D4, D6): eligible lists with a provided slot open the picker from Add with capacity, limit message and existing identifiers computed on activation; Add stays disabled with the existing explanation at capacity 0; `insertMany` appends in order as one change, leaves new rows collapsed and existing open state unchanged, focuses the first new row, announces "Added N <label> items.", guards with a final `growthProblem`, and Cancel returns focus to Add; ineligible lists and lists without the slot keep today's Add; verify `FieldRendererList.test.tsx` for every scenario of the "Eligible media lists add several items" requirement using a fake picker slot, plus the modified "Added item opens with focus" scenario on a link-group list
- [x] 4.3 Register `MediaListPicker` in `pages/entry/EntryPage` next to `mediaRenderers` and `mediaPreviews`; verify an `EntryPage` unit test that a gallery block's Add opens the multiple-mode picker and that a viewer sees no Add

## 5. End-to-end and documentation

- [x] 5.1 Add `apps/admin/e2e/media-multi-select.e2e.ts` with a mocked API: add 20 tagged images to a gallery in one step (order, collapsed rows, "20 / 50", save payload), selection order with deselect and renumbering, list-maximum capacity, entry-budget capacity, uploads auto-selected and the blocked upload at capacity, already-used note, Escape discarding with focus on Add, keyboard-only selection with Space and Enter, and a custom block list with an item default; audit the multiple-mode dialog with the shared axe helper (`e2e/support/accessibility.ts`) in light and dark themes in the same file; verify `pnpm --filter @lacecms/app-admin test:e2e` passes, including Chromium at 320 px for the dialog footer
- [x] 5.2 Document multiple selection: eligible lists and Add behavior in `docs/composite-fields.md`, picking a tagged set in `docs/media-tags.md`, one sentence on multiple mode in the media-picker paragraph of `docs/mvp-architecture.md` §17; verify `pnpm docs:check` passes

## 6. Verification and completion

- [x] 6.1 Run `pnpm --filter @lacecms/app-admin test`, then root `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and the remaining CI steps from `.github/workflows/ci.yml`; record results in `verification.md`
- [x] 6.2 Run `pnpm exec openspec validate sm03c-multi-select-media-picker --type change --strict` and update the roadmap progress log; verify validation passes
