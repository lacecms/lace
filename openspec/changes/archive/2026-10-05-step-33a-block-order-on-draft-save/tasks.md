## 1. Save serialization

- [x] 1.1 Derive sparse positions from visible order at save and recovery JSON boundaries; verify empty, reversed, sparse lists, key/data preservation and non-mutation with admin unit tests and save integration tests.

## 2. Safe rejection and recovery

- [x] 2.1 Add bounded domain ordering diagnostics and a narrow safe transport mapping; verify domain/contract tests and HTTP negative cases leave draft revision and published/build state unchanged.
- [x] 2.2 Show rejection reason, request ID and recovery advice while preserving edits; verify admin unit and browser failure/retry tests.

## 3. Browser and persistence proof

- [x] 3.1 Cover pointer/keyboard reorder, middle insertion/duplication, removal and Undo through save/reload/publish in Playwright; verify real SQLite API export and Astro HTML preserve displayed keys/data/order and D1 repository contracts pass.

## 4. Completion

- [x] 4.1 Record 33A verification and remaining Step 33 scope in documentation; run root typecheck, Oxlint, Oxfmt check and strict OpenSpec change validation.
