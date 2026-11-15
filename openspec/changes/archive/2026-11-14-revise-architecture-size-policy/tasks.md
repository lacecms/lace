## 1. Architecture maintenance policy

- [x] 1.1 Update `docs/architecture/README.md` with ownership, same-change maintenance, warning review, safe relocation and splitting practices, and exact size counting; verify it preserves authority order and section map and `pnpm vitest run tests/docs-links.test.mjs` passes.

## 2. Size guard

- [x] 2.1 Update the architecture size guard and any focused helpers for the 600-line inclusive file limit and non-failing warning above 3,000 nonblank directory lines, excluding Mermaid fences and contents from both; verify the existing architecture test passes and non-size guards remain intact.
- [x] 2.2 Add focused boundary and counting tests for 600/601 and 3,000/3,001, blank and whitespace-only lines, multiple Mermaid blocks, fence exclusion, trailing newlines, file names and diagnostic values; run the focused tests.
- [x] 2.3 Verify an over-threshold fixture prints the warning with count and threshold in the normal root Vitest invocation while exiting successfully, and an oversized-file fixture fails; record the command and result in the change.

  `pnpm vitest run tests/fixtures/architecture-size/guard.test.mjs --maxWorkers=2` printed 3001 and 3000 and exited 0. With `ARCHITECTURE_SIZE_FIXTURE=oversized`, the same command exited 1 and named files with 601 lines and the 600-line limit. Vitest hid `console.warn` for a passing test, so the guard writes its warning to stderr directly.

## 3. Verification

- [x] 3.1 Run relevant architecture and documentation tests, root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `pnpm exec openspec validate revise-architecture-size-policy --type change --strict`; record outcomes and resolve failures attributable to this change.

  Architecture, size, link and publication tests passed (35 tests); typecheck, lint, format check and strict change validation passed.
