## Why

[EX2C — Configuration synchronization](../../../../docs/extensibility-roadmap.md#session-ex2c--configuration-synchronization) follows the archived [EX2B shared media, build and outbox plans](../2026-11-15-ex02b-shared-write-plans-media-builds-outbox/). Node SQLite and D1 still interpret the same approved synchronization operations in separate final-mutation loops, duplicating model identity SQL, singleton creation and the coordination of schema rewrites.

## What Changes

- Compile approved synchronization operations into one ordered `@lacecms/db` write plan for both SQL adapters. Centralize model identity and baseline writes, generated singleton drafts, field and reference rewrites, and the final public-state and build statements.
- Execute the plan with the EX2A executors and the EX2B build enqueue fragment. Preserve the runtime-specific freshness checks and read boundaries, existing errors, atomic rollback, and the commit-time build version.
- Preserve the portable application planner and its text and JSON reports, the operator check/apply behavior, and the existing resumable block-migration phase. EX2D owns the test store and author lookups. EX3 owns typed outbox events. EX5 owns model-kind descriptors.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The roadmap uses `skip_specs: true` for behavior-preserving changes. Acceptance is governed by [configuration synchronization](../../../specs/configuration-synchronization/spec.md), [schema evolution](../../../specs/schema-evolution/spec.md), [application ports](../../../specs/application-ports-and-commands/spec.md), [collection query metadata](../../../specs/collection-query-options/spec.md), [conditional fields](../../../specs/conditional-fields/spec.md), [internal links](../../../specs/internal-url-links/spec.md), [operational CLI](../../../specs/operational-cli/spec.md), and the [shared repository contracts](../../../specs/content-repository-contracts/spec.md) for [Node](../../../specs/node-content-repositories/spec.md) and [D1](../../../specs/d1-content-repositories/spec.md).

## Impact

The work touches `packages/db/src/sync`, both SQL platform repositories and their shared contract coverage. Update [§9.1–9.3](../../../../docs/architecture/data-model.md#91-content-models), [§15–16](../../../../docs/architecture/runtimes.md), [ADR 0002](../../../../docs/adr/0002-d1-batches-and-node-transactions.md) and the [internal synchronization note](../../../../docs/configuration-synchronization.md) to describe the new persistence path. Deploy against the existing schema and persisted data. Operator commands, REST and MCP contracts, and authored configuration keep their existing interfaces.
