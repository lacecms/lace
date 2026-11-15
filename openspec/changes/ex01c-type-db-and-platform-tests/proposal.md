## Why

[EX1C in the extensibility roadmap](../../../docs/extensibility-roadmap.md#session-ex1c--type-db-and-platform-tests-was-rf9e) restores TypeScript checking to persistence and runtime tests once the shared write plans and test store are in place. Checking the post-EX2D tests avoids typing fixtures and adapters during the rewrite.

## What Changes

- Apply after EX1B in the EX1 sequence and after EX2D has landed. Use the baseline and test layout from that checkout for `db`, `platform-node` and `platform-cloudflare`. The roadmap records 18, 12 and 12 files respectively before EX1A and EX2.
- Type the surviving and replacement suites against the real DB and runtime boundaries. Remove each migrated entry from `scripts/test-typecheck-baseline.json` and verify local SQLite and D1 through the shared contract runners.
- EX1D owns the CLI, generator and app exceptions. SQL, migrations, repository behavior, Worker and Node configuration and package exports are outside this session's implementation scope.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This change retires legacy exceptions under [workspace governance](../../specs/workspace-governance/spec.md#requirement-test-typecheck-exceptions-are-limited-by-a-shrinking-baseline) and verifies [content repository contracts](../../specs/content-repository-contracts/spec.md) on both runtimes.

## Impact

This change affects source tests, test-support modules and the exception baseline under [architecture §6 and §20](../../../docs/architecture/workspace.md) and the adapter boundaries in [§15 and §16](../../../docs/architecture/runtimes.md).
