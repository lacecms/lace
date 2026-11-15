## Why

[EX1A in the extensibility roadmap](../../../docs/extensibility-roadmap.md#session-ex1a--test-size-ceiling-was-rf9c) makes the 1,000-line limit enforceable for workspace tests. Splitting the largest suites first gives EX2 smaller Node and Worker suites to update and gives EX1B smaller core suites to type.

## What Changes

- Apply the existing 1,000-physical-line ceiling and shrinking baseline to test files in workspace members' `src/` trees, including dedicated type tests and packaged-output tests. `pnpm lint` reports oversized tests and stale baseline entries.
- Split the eight oversized workspace suites by concern and preserve their cases, assertions, test commands and runtime isolation. Update any explicit verification selectors for moved scenarios.
- Retain the standalone OAuth/MCP compatibility fixture at `scripts/fixtures/oauth-mcp/compat.test.mjs` as agreed, with its existing compatibility commands. The size check follows workspace source roots, so the root integration suites also keep their current verification scope.
- RF9A and RF9B provide the source-test and fixture foundation. Package-wide removal of existing typecheck exceptions belongs to EX1B, EX1C and EX1D.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-governance` extends the existing size check to workspace test files. The delta replaces the accepted scenario that exempts those files.

## Impact

The change affects [architecture §6 and §20](../../../docs/architecture/workspace.md), contributor guidance, `scripts/check-boundaries.mjs`, the shared source-size baseline, the tests being split and the verification selectors that name them. The CMS and published package exports retain their current behavior.
