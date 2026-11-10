## 1. Baseline and viewport

- [x] 1.1 Build and capture public package declaration export lists, record hashes of the three named browser suites and count non-test `as never` occurrences; reproduce the composite pointer-drag failure at Playwright's default 1280×720 and record the cause and baseline result.
- [x] 1.2 Correct the verified layout, drag or shared test-support cause without editing those suites or increasing the viewport; run the unchanged pointer-drag case and verify the reorder and isolation assertions pass at 1280×720.

## 2. Form state and paths

- [x] 2.1 Define typed field paths for system, nested fields, indexed lists and block data/settings; narrow dynamic issue paths and remove target `as never` casts, verifying typecheck and mapped/unmapped server issue tests.
- [x] 2.2 Implement form-owned transient errors and derived blocking/dirty state; test multiple cleared scalar items, submit and resolver validation, moving/removing rows, overlapping errors, conditional visibility, cleanup and restored values without leaking metadata into draft JSON.
- [x] 2.3 Extract `useDraftEditor` into the field-editor entity with model-aware initialization/reset, epoch, server issue mapping and slug suggestion; verify entry/revision changes, explicit adopt/revert, summary focus and unmapped issues, slug manual override and read-only behavior with focused tests.
- [x] 2.4 Pass a single editor object into `FieldRendererProvider`, preserve unbound uses and correct slice boundaries, and run renderer, composite, visibility and page tests with their behavior assertions intact.

## 3. Mutations and recovery

- [x] 3.1 Extract `useEntryMutations` into the entry page slice, retaining revision guards, cache updates, save/publish sequence, idempotent retry, error mapping and pending locks; verify save and publication success, validation and network failures using focused tests.
- [x] 3.2 Preserve conflict, copy and explicit reload/adoption with unsaved values and session recovery; test save and publish conflicts, failed reload, entry switching and stale async completion without overwriting another entry.

## 4. Acceptance and verification

- [x] 4.1 Run the unchanged `editor.e2e.ts`, `entry-actions.e2e.ts` and `composites.e2e.ts` at default 1280×720; verify their hashes match the baseline and exercise existing keyboard and narrow-viewport cases.
- [x] 4.2 Run the full default admin `test:e2e` suite as an obligatory RF6C check without adding it to CI; record the result and resolve failures.
- [x] 4.3 Run the relevant full admin unit suite and root build; compare public package declaration export lists to the captured pre-change build and verify no admin boundary violation.
- [x] 4.4 Measure non-test `as never` occurrences and verify fewer than 25; record baseline and final command/count, viewport fix and test results in the roadmap baseline/progress log and change verification record.
- [x] 4.5 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:validate` and `pnpm exec openspec validate rf06c-draft-editor-state --type change --strict`; record results and resolve failures.
