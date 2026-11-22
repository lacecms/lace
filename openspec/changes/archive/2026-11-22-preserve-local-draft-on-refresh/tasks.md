## 1. Reproduce the focus-return failure

- [x] 1.1 Add a typed routed Admin regression test with two independent editor sessions reading one revisioned entry. Edit a title in the first, save a different title and field in the second, and trigger the first session's normal focus refetch. Verify the test observes the newer GET before asserting the original revision, local values and unsaved indicator, and confirm it fails on the current reset behavior.

## 2. Reconcile server reads with the open form

- [x] 2.1 Replace the `savedEntry ?? entry.data` selection and unconditional revision reset with entry-scoped adoption in `EntryPage` and `useDraftEditor`. Verify the test retains local edits, clean writers and viewers adopt newer data, and a clean editor receives later revisions after its own first save.
- [x] 2.2 Apply the existing form and transient dirty signals to the same adoption decision. In a routed test, clear a numeric list item inside a block as the only edit, finish the focus refetch and assert the empty control, validation feedback and discard prompt survive. Verify Save sends no invalid payload and a recoverable refetch failure preserves the input.
- [x] 2.3 Bind draft-dependent commands in `useEntryMutations` to the adopted revision and adopt successful command responses deliberately. Verify a stale Save and the save step of Save and publish carry the original expected revision, a 409 sends no publish request, and a successful save adopts normalized server values. Cover an older refetch arriving after save, a same-revision publication update and a late response after switching entries.

## 3. Expose recovery before Save

- [x] 3.1 Present the read-detected conflict through `EntryConflictAlert`. Verify repeated reads and a later 409 leave one accessible alert. Copy my JSON must export the local content and preserve both the alert and unfinished inputs.
- [x] 3.2 Exercise Reload server draft through the alert. Verify a failed read keeps the form, baseline and recovery actions, then a successful retry adopts the latest valid draft, clears transient state and leaves the form clean with no write request.
- [x] 3.3 Update the conflict section of `apps/docs/src/content/docs/en/latest/editing-content/index.md`. Verify it explains what happens on return to the tab, what copying preserves and when reloading replaces unsaved edits.

## 4. Verify the complete change

- [x] 4.1 Run the focused routed editor, conflict alert and entry mutation tests first, including the two-session focus regression. Confirm existing save, publish, unpublish, revert, navigation and permission scenarios pass.
- [x] 4.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate preserve-local-draft-on-refresh --type change --strict` and record the results.

### Verification

- The two-session test first failed when the newer GET replaced the local title.
- `pnpm --filter @lacecms/app-admin test src/pages/entry src/features/publish-entry src/features/unpublish-entry src/features/revert-entry src/features/delete-entry --maxWorkers=4` passed all 186 tests in 29 files.
- `pnpm typecheck`, `pnpm lint`, and `pnpm format:check` passed.
- `pnpm exec openspec validate preserve-local-draft-on-refresh --type change --strict` passed.
