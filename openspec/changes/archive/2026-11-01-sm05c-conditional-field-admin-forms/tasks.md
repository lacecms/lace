## 1. Planning documents

- [x] 1.1 Mark SM5C in progress in `docs/site-migration-roadmap.md` (the four-session split, the SM5D section and the proposal log row were added with this proposal); verify the overview table, step status and log agree
- [x] 1.2 Record the `settingsVisibility` decision (design D6) and SM5C implementation status in `docs/adr/0018-conditional-fields.md`, and replace "The admin hides fields in SM5C" in `docs/mvp-architecture.md` §8 with the delivered admin behavior; verify with `git diff` that no other invariant changes

## 2. Visibility helper

- [x] 2.1 Add `apps/admin/src/entities/content/visibility.ts` with `effectiveFormValues` and `shownFieldKeys` per design D1 and export them from the content entity; verify `visibility.test.ts` covers present, `null`-cleared and absent controllers with and without defaults, boolean controllers, owners without rules, and a parity table against `@lacecms/content` draft normalization plus `isFieldVisible`
- [x] 2.2 Add `applicableErrors` per design D3 (strip `publication` errors under hidden keys, recurse into shown groups and list items with their own values, return a new object); verify unit tests for hidden and shown targets, nested list items with different controllers, hidden group subtrees, draft errors kept under hidden keys, and unchanged input

## 3. Reactive forms

- [x] 3.1 Pass `visibleKeys` (shown keys plus hidden keys with remaining draft problems) and filtered errors in the `FieldRenderer` group branch, with the "Shown to fix a problem in a stored value. Applies when …" annotation; verify `FieldRenderer` tests for list items evaluating independently, toggle-back values, preserved rich-text and media state, and the annotation
- [x] 3.2 Apply the same in `EntryPage` model fields (watched `fields`) and `BlockCard` block data (`error.data`, `hasError`, `contentProblems`, inherited alt); verify `EntryPage` and `BlockCard` tests for a boolean model controller, a tab whose fields are all hidden, a block card not held open by a hidden publication issue, and viewer mode showing the same fields read-only
- [x] 3.3 Verify with a unit test that saving after a controller change submits hidden values unchanged and that the dirty state changes only through the controller's value

## 4. Validation summary

- [x] 4.1 Pass entry field values into `validationProblems` and filter each owner's errors with `applicableErrors` before listing; verify `validation-problems.test.ts` for a dropped stale publication issue, a listed draft problem on a hidden target with its exact control target, unchanged reading order, and hidden-block rules unchanged
- [x] 4.2 Verify with `EntryValidationSummary`/`EntryPage` tests that activating a problem on a revealed hidden target inside a collapsed list item in a collapsed block opens the block's Content tab and the item and focuses the control

## 5. Summaries, previews and media lists

- [x] 5.1 Restrict `itemSummary`, `previewLeaf`, `holdsMedia` and the block summary in `block-presentation.ts` to shown keys per design D4, ignoring a hidden `itemLabel`; verify `item-summary` and `block-presentation` tests for the video item with a stale image, switching kind back, and a hidden `itemLabel`
- [x] 5.2 Require the media key to be shown in the item's starting value in `mediaListTarget` per design D5; verify `media-list` tests for a conditional media field visible by default (eligible, appended items carry the controller default) and hidden by default (ineligible)

## 6. Browser journey

- [x] 6.1 Add `apps/admin/e2e/conditional-fields.e2e.ts` with mocked metadata built from `defineBlock`/`field` covering switching, toggle-back values in the saved request, a viewer, a stale publication issue, a hidden invalid value, summary reveal in a collapsed item, multi-select Add on the conditional list, and axe at 320 px; verify `pnpm --filter @lacecms/admin exec playwright test conditional-fields.e2e.ts`

## 7. Documentation

- [x] 7.1 Add the public page `apps/docs/src/content/docs/en/latest/content-modeling/conditional-fields.md` per design D7 and the `public-documentation` delta, link it from `composites.md`, and add editing notes to `editing-content/index.md`; verify `pnpm docs:check` and `pnpm docs:build`
- [x] 7.2 Update `docs/field-guidance.md`, `docs/form-organization.md`, `docs/composite-fields.md` and the topic map in `docs/documentation-maintenance.md`; verify with `git diff` that the example config matches the public page and that configuration accepts it in a `@lacecms/config` or `@lacecms/content` test

## 8. Completion

- [x] 8.1 Run the admin unit suite and the full admin Playwright suite; verify they pass (record known pre-existing failures, if any, with evidence)
- [x] 8.2 Run root `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (release test on pinned Node 24.12.0), `pnpm build`, `pnpm openapi:check` and `pnpm exec openspec validate sm05c-conditional-field-admin-forms --type change --strict`; verify all pass and record a short summary in `verification.md`
