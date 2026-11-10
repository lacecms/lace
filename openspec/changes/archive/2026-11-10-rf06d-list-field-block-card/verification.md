## Baseline

- `pnpm build`: passed (22 tasks, 20 cached).
- `rg '^export ' packages/*/dist/index.d.ts` captured at `/private/tmp/lace-rf6d-baseline/exports.txt`; `rg --files apps/admin/src -g '*.test.*' -0 | sort -z | xargs -0 shasum -a 256` captured at `/private/tmp/lace-rf6d-baseline/admin-tests.sha256`.
- `wc -l`: FieldRenderer 1,478; BlockCard 524; BlockEditor 341.
- `shasum -a 256 apps/admin/e2e/{editor,entry-actions,composites}.e2e.ts`: editor `d8aa740e677aeafc79d23b4f3b77fac191ac569b1cee74ba6973056238a77179`; entry-actions `26c2f75d7fa785d68d66674537f4bd755f1cacf525f9e8c600b309c2f3b85d49`; composites `2c3b89551be0da8d2652ccb40c2fdc6791ae536bbc891a35a93451cfc5cab902`.

- Task 2.1: extracted editor context into its own module; admin typecheck and full admin unit suite passed (203 files, 1,028 tests).
- Tasks 2.2–2.3: list field and disclosure extracted with typed recursive renderer; focused list/composite and helper tests passed (51 tests), admin typecheck and root lint/boundaries passed. FieldRenderer 416 lines, ListField 839, FieldDisclosure 99, EditorContext 127, FieldNode 49; oversized baseline entry removed.
- Task 3.1: extracted block card menu; admin typecheck and 27 card, menu and block editor tests passed.
- Task 3.2: extracted mounted tab panels; admin typecheck and 24 tabs, card, visibility and envelope tests passed.
- Task 3.3: shared identity-keyed BlockActions dispatches through current render delegates. Focused reorder/remove/undo, menu close, busy and viewer tests passed; 32 existing block tests and 8 focused tests passed; root lint and admin typecheck passed.
- Task 4.2: all pre-existing admin test SHA-256 hashes match; new component companions are typed and boundaries pass. Root build passed (22 tasks), public export lines match after sorting by file and line text (ripgrep emits files in nondeterministic order).
- Task 4.1: full admin unit suite passed (210 files, 1,036 tests). The three unchanged Playwright suites passed at the default viewport (32 tests, including keyboard and 375px coverage); their baseline hashes match. The first sandboxed attempt could not bind 127.0.0.1:4173; the permitted rerun passed.
- Task 4.3: roadmap baseline and progress updated. Renderer 416, ListField 839, disclosure 99, editor context 127, field node 49, BlockCard 426, menu 117, tabs 74 and BlockEditor 372 lines. No API, persistence or architecture changes.
- Task 4.4: root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:validate` (90 passed), and strict change validation passed.
