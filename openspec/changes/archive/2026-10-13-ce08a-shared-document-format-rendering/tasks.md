## 1. Architecture and delivery contract

- [x] 1.1 Update architecture sections 11 and 13 with the exact grammar, nesting, link storage and rendering attributes; distinguish CE8B authoring work in section 17, record a short ADR and roadmap CE8A state before code; verify agreement with all four delta specs and CE8A owner decisions.

## 2. Shared content validation and types

- [x] 2.1 Extend SafeRichTextNode/Mark and shared validation in packages/content/src/index.ts with H4, rules, empty/plain code and restricted optional link attributes; verify positive and negative content tests for nesting, exact keys, unmarked text, unsafe URLs, all four link choices and unchanged H1–H3/href-only documents.
- [x] 2.2 Verify expanded rich-text defaults, nested group/list leaves and block data reuse the same validator with detached defaults, precise error paths and unchanged draft/publication semantics and CE7 budgets; add focused runtime and public type tests and run the content package tests and typecheck.

## 3. Framework-neutral description and Astro output

- [x] 3.1 Extend render tags, source types and safe attributes; describe rules and pre/code with preserved text and derive deterministic safe rel attributes; verify exact element trees, all four link combinations, contextual failures and an expanded content/render parity corpus with focused render tests and typecheck.
- [x] 3.2 Extend RichTextNodes.astro for void rules and validated target/rel, preserving escaped code whitespace and existing overrides; add actual Astro container tests for old/new nodes, all four link choices, exact multiline code, override descriptions and unsafe-input rejection; run Astro tests and typecheck.

## 4. Compatibility and reference delivery

- [x] 4.1 Document format adoption and rollback in docs/compatibility.md, including coordinated CMS/site upgrades and the interim admin limitation until CE8B; verify no migration, destructive rewrite, dependency or block schema-version bump is claimed or introduced.
- [x] 4.2 Extend the reference published-export fixture and fixture-build assertions to cover H4, rules, escaped multiline code and independent link attributes through the common renderer; run the focused reference build test and confirm existing fixture output still passes.

## 5. Completion and requested first commit

- [x] 5.1 After focused tests pass, run root pnpm typecheck, pnpm lint, pnpm format:check and pnpm exec openspec validate ce08a-shared-document-format-rendering --type change --strict; resolve failures and record verification evidence in the change.
- [x] 5.2 Update the CE8A roadmap record with verified outcome, review the diff for session scope and commit the complete CE8A implementation and planning artifacts as the first commit on codex/content-editor-wave-4; verify the commit and working-tree status. Leave CE8B/CE9 and spec synchronization/archive for their respective explicit actions.
