## 1. Baseline

- [x] 1.1 Run `pnpm build`, capture public package `dist/index.d.ts` export lists, current renderer and block component line counts, and hashes of existing admin tests and the three editor acceptance suites; record the commands and results for comparison.

## 2. List field and renderer

- [x] 2.1 Extract shared editor context, node contracts and non-list value rendering as needed within the field-editor slice; keep recursive rendering acyclic and run existing FieldRenderer, visibility and transient-issue tests.
- [x] 2.2 Move `ListNode`, `ItemRow`, `ItemSummaryLine` and `rowFocusTarget` into `ListField/` with a typed injected recursive renderer; preserve identity, errors, nested list isolation, focus, drag, media selection and limits, and run existing list and composite tests.
- [x] 2.3 Make `FieldRenderer` the dispatcher targeting fewer than 500 lines, verify each split production file is below 1,000 lines, remove its oversized baseline entry once eligible, and run boundary/lint checks; record actual sizes and any justified shortfall from the target.

## 3. Block card and actions

- [x] 3.1 Extract `BlockCardMenu` preserving delayed actions, menu-close focus, disabled states, visibility and announcements; run existing card and block-editor tests and add colocated coverage needed by the component-folder rule.
- [x] 3.2 Extract `BlockCardTabs` preserving mounted panels, per-block selection, keyboard behavior, reveal and error markers; run existing card, visibility and envelope tests and add colocated coverage required by the component-folder rule.
- [x] 3.3 Introduce one typed `BlockActions` object per editor, route actions using current block identity and current guards, and verify reorder followed by action, delayed menu close, remove/undo, and busy/read-only transitions with focused tests.

## 4. Integration and verification

- [x] 4.1 Run the full admin unit suite and unchanged `editor.e2e.ts`, `entry-actions.e2e.ts` and `composites.e2e.ts` at the default viewport, including keyboard and narrow-viewport cases; compare suite hashes with baseline and record results.
- [x] 4.2 Confirm existing test-file changes are limited to import paths, new component companions comply with test typing and source-layout rules, and the root build's public package declaration export lists match the baseline.
- [x] 4.3 Record measured file sizes, baseline removal, test results and any target shortfall in the change verification record and roadmap baseline/progress log; verify no API, persistence or architecture change.
- [x] 4.4 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm spec:validate` and `pnpm exec openspec validate rf06d-list-field-block-card --type change --strict`; record results and resolve failures.
