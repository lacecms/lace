## Why

[EX1B in the extensibility roadmap](../../../docs/extensibility-roadmap.md#session-ex1b--type-core-package-tests-was-rf9d) restores TypeScript checking to the core package tests that still rely on `@ts-nocheck`. Typed fixtures will catch stale contracts, incomplete mocks and incorrect assertions as shared APIs evolve.

## What Changes

- After EX1A, type the remaining tests in `contracts`, `content`, `application`, `server`, `sdk`, `astro`, `mcp` and `render`. The roadmap records 61 files before the EX1A splits. Use the current baseline and surviving tests to determine the exact worklist.
- Reuse the typed fixture layer, retain runtime assertions and invalid-input coverage, and remove the corresponding entries from `scripts/test-typecheck-baseline.json` as each package passes its test typecheck.
- EX1C owns `db` and the runtime adapters after EX2D. EX1D owns CLI, generator and app suites.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change retires legacy exceptions under the existing [workspace governance](../../specs/workspace-governance/spec.md#requirement-test-typecheck-exceptions-are-limited-by-a-shrinking-baseline) requirement.

## Impact

This change affects source tests, test-support modules and the exception baseline under [architecture §6 and §20](../../../docs/architecture/workspace.md). The CMS, transport contracts and public package exports retain their current behavior.
