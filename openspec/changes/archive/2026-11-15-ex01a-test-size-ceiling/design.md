## Context

`scripts/check-boundaries.mjs` counts lines during the existing source scan. Its main loop skips ordinary TypeScript test files before counting and its TypeScript-oriented collector misses packaged JavaScript tests. `tests/boundaries.test.mjs` currently pins the test exclusion. The committed size baseline is empty. Four of the eight oversized workspace suites currently carry `@ts-nocheck`: the Node and Worker suites, the server content routes suite and the SDK published-site suite.

## Goals / Non-Goals

Enforce a uniform file ceiling for production source and test files within workspace source roots, with the same diagnostics and baseline rules. Preserve production imports and cycle policy, workspace package exports and the existing source and packaged test entry points. Full retirement of typecheck exceptions belongs to the later EX1 sessions.

## Decisions

1. **Reuse the size baseline.** Keep the current physical-line calculation and `scripts/oversized-source-baseline.json`. Feed both production-source and test candidates into the size check without feeding newly discovered tests into the existing import and graph checks. Include type tests and JavaScript tests by filename while keeping the JavaScript allowlist and production-source scan independent. A second size baseline would duplicate the threshold, growth and stale-entry rules. Finish the eight splits in this session with no new size exceptions.
2. **Use workspace source roots for discovery.** The owner confirmed that `scripts/fixtures/oauth-mcp/compat.test.mjs` stays outside the guard and keeps its current focused and full compatibility invocations. Its location already puts it outside the discovery roots. Root-owned verification such as `tests/security-boundary.test.mjs` also falls outside the guard. A repository-wide scan would reach root suites and fixture trees with separate runners and move beyond this session's workspace splits. Ordinary helpers inside `src/test-support/` keep the existing exemption. A test file under that directory still qualifies by filename.
3. **Split by owning concern.** Keep root package identity and composition tests where they cover the public entry. Move concern-specific groups beside the relevant modules in the same package or admin slice. See the task list for the eight mappings. Keep setup with its cases and use typed package-local test support for genuinely shared setup. Preserve the existing Vitest environment, fixture lifecycle, cleanup and test contents. Where legacy unchecked scenarios move, prefer typing them when practical. Record any remaining unchecked companions explicitly and remove stale paths from the typecheck baseline.
4. **Preserve verification selection.** `scripts/security-resilience-verification.mjs` explicitly selects the current Node `index.test.ts` and Cloudflare `worker.test.ts`. Keep the corresponding phases running all previously selected cases after the split. Update coverage references in `docs/verification.md` if the server's role-denial case moves. Keep moved files in the existing package runner and TypeScript project.

## Risks / Trade-offs

- A moved test can silently disappear from a path filter while the runner exits successfully. Compare executed case names and counts before and after the split for the affected suites, and verify the named verification phases still select those cases.
- Parallel suites can share globals or leave open fixtures when setup and teardown are moved together. Keep mutable state and hooks local to each suite, and confirm SQLite cleanup, Worker cleanup and admin state reset through the package tests.

## Migration Plan

Update workspace §6 and §20, ADR 0020, contributor guidance and the EX1A roadmap decision before changing the checker. Ship documentation, the checker and its regression cases, and the suite splits in one change. There is no deployment or data migration.
