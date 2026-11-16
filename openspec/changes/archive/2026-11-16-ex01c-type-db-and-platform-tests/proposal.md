## Why

[EX1C in the extensibility roadmap](../../../../docs/extensibility-roadmap.md#session-ex1c--type-db-and-platform-tests-was-rf9e) restores TypeScript checking to the remaining persistence and runtime tests. EX1B and EX1D retired the other packages' exceptions, and EX2D completed the shared SQLite fixture and repository move.

## What Changes

- Use the post-EX2D `scripts/test-typecheck-baseline.json` on the apply checkout. At `41535f6e` it lists 18 `db`, 16 `platform-node` and 14 `platform-cloudflare` tests, which account for all 48 workspace exceptions.
- Restore typechecking in those tests using the existing DB and runtime fixtures. Retire each exception with its directive, then delete the empty baseline file. Run the shared repository contracts on file-backed SQLite, in-memory SQLite and local D1.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The existing [workspace governance](../../../specs/workspace-governance/spec.md#requirement-test-typecheck-exceptions-are-limited-by-a-shrinking-baseline) defines how the checker handles an absent baseline. The accepted [content repository contracts](../../../specs/content-repository-contracts/spec.md) define the verification targets.

## Impact

The implementation covers source tests, typed test-support, the exception baseline and its contributor documentation under [architecture §6 and §20](../../../../docs/architecture/workspace.md). Runtime behavior, SQL, migrations, runtime configuration and public package exports are verification boundaries under [architecture §15 and §16](../../../../docs/architecture/runtimes.md).
