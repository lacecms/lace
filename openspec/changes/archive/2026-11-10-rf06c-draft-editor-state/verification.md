## Baseline

- `pnpm build`: passed (22 cached tasks). Public `packages/*/dist/index.d.ts` export lines captured in `/private/tmp/lace-rf06c-baseline/exports.txt` for this session.
- SHA-256: editor `d8aa740e677aeafc79d23b4f3b77fac191ac569b1cee74ba6973056238a77179`, entry-actions `26c2f75d7fa785d68d66674537f4bd755f1cacf525f9e8c600b309c2f3b85d49`, composites `2c3b89551be0da8d2652ccb40c2fdc6791ae536bbc891a35a93451cfc5cab902`.
- `rg -o 'as never' apps/admin/src --glob '!*.test.*' | wc -l`: 40 occurrences.
- The unchanged composite pointer-drag case fails at 1280×720: expected Second card first but saw First card. Diagnostic copy showed first handle y=-252, target y=158 after `openAllItems` clicks scroll the page; mouse starts outside the viewport. The diagnostic copy was removed.
- The unchanged pointer-drag case passes at 1280×720 after `openAllItems` positions the last expanded list with preceding context onscreen; its reorder and unrelated-list assertions passed.
- Task 2.1: admin typecheck passed; editor-form, FieldRenderer and EntryPage suites passed (62 tests). Server paths are validated by `issueLocation`; RHF synthetic block error paths require a localized typed bridge because they are error nodes, not values.
- Task 2.2: temporary scalar issues live in form state, are consumed by the resolver and removed from serialized drafts. Focused tests cover two issues, moves, removal, unrelated server errors, conditional unmount and stale reset cleanup; admin typecheck/lint and the cleared-scalar browser regression passed. Full composites suite passed before the final focused error-handling refinement.
- Task 2.3: extracted form, revision initialization, epoch, server issues, summary focus and slug state to field-editor with injected content services. Five focused page suites passed (60 tests); admin typecheck and root lint/boundaries passed.
- Task 2.4: provider accepts a single editor object; bound and unbound renderer, block and page suites passed (14 files, 163 tests); admin typecheck and lint passed.
- Task 3.1: entry mutation orchestration extracted; five entry suites passed (66 tests), covering save, publication, failures and lifecycle; admin typecheck and root lint/boundaries passed.
- Task 3.2: old mutation observers are detached on entry change and completion handlers are scoped to a navigation generation, including returning to the same entry. Six delayed success/failure tests cover save, publish and reload; entry recovery tests passed (33 tests total).
- Task 4.3: full admin unit suite: 203 files, 1,028 tests passed. Root build passed (22 tasks), package declaration export lines match the pre-change capture, and root lint boundary checks passed.
- Task 4.4: `rg -o 'as never' apps/admin/src --glob '!*.test.*' | wc -l`: 40 → 22; all remaining occurrences are in `app/testing`. FieldRenderer is 1,478 lines (1,502 before; baseline ceiling 1,508). Roadmap baseline and progress updated.
- Task 4.1: unchanged editor, entry-actions and composites Playwright suites passed (32 tests), including default viewport pointer drag, keyboard and 375px cases; SHA-256 hashes match baseline.
- Task 4.2: `pnpm --filter @lacecms/app-admin test:e2e --workers=2` passed all 168 tests; CI configuration remains unchanged.
- Task 4.5: root `pnpm format:check`, `pnpm typecheck`, `pnpm lint`, `pnpm spec:validate` (90 items) and strict change validation all passed.
