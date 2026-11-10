## 1. Architecture and baseline

- [x] 1.1 Update architecture §17 and ADR 0020 for the private leaf exception before code; verify public component folders, same-layer direction and §6 remain consistent with the delta spec.
- [x] 1.2 Record pre-change one-line admin index count, relevant test results and built package `dist/index.d.ts` export lists from the unchanged tree for later comparison. Baseline: 163; admin focused tests 247 passed; `pnpm build` 22 tasks passed; declarations recorded in `/private/tmp/lace-rf06a-package-declarations.txt`.

## 2. Boundary rule

- [x] 2.1 Extend boundary-checker fixtures for a private sibling leaf, missing test, direct and transitive public re-exports, outside imports, malformed names and existing incomplete folders; confirm tests distinguish allowed and rejected cases.
- [x] 2.2 Implement the leaf exception and export-graph validation; run the focused checker fixtures and verify layer, slice and component-folder restrictions still pass their negative cases. Recheck the existing implementation against indirect local exports and TypeScript syntax variants, including comments and strings, before marking complete. Boundary suite: 102 passed.
- [x] 2.3 Convert private leaf folders and their companion tests without changing public indexes; count all one-line admin `index.ts` files and verify fewer than 150 remain. Result: 149; 196 affected tests and admin typecheck passed.

## 3. Editor and token composition

- [x] 3.1 Split content, field-editor and rich-text slices and repoint imports; keep rules single-owned, place only actually shared types and their necessary type dependencies in a lower-layer internal contract, and compose cohesive runtime dependencies from a higher layer. Verify no cross-slice imports, duplicate rule tables or domain behavior in the contract, and run affected content, field and rich-text unit tests. Boundary checker, admin typecheck and 239 entity tests passed.
- [x] 3.2 Verify editor integration preserves default rich-text rendering, custom renderer overrides, validation and existing accessible behavior with focused editor and page tests. Entity suites (239) and page, block and link suites (175) passed.
- [x] 3.3 Consolidate token dialogs in one feature and repoint consumers; test both token kinds for endpoint, warning text, query invalidation, pending, success, error and reset behavior. Nine dialog and table tests passed.
- [x] 3.4 Add an isolated SidebarNav unit test with hoisted Tiptap mock call counts and a dependency-graph check for all Tiptap and dnd-kit imports; demonstrate detection with a positive fixture and run existing navigation tests. Five navigation tests and two graph tests passed.

## 4. Verification and record

- [x] 4.1 Run affected admin and checker suites, build and compare all package `dist/index.d.ts` export lists with the recorded baseline; investigate any behavioral or public API difference. Admin: 1,012 tests; checker and graph: 105 tests; build passed and declaration files are byte-identical to baseline.
- [x] 4.2 Record RF6A placement refinement, actual before/after one-line barrel counts and verification results in the roadmap progress log; confirm moved tests are typed or explicitly baselined and oversized baselines do not grow. Boundary checks pass with the relocated 1,508-line ceiling; current file has 1,502 lines and the count is 147 one-line indexes.
- [x] 4.3 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:validate`, and `pnpm exec openspec validate rf06a-admin-slice-split --type change --strict`; resolve failures before completion. All passed.
