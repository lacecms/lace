## Why

EX2A, [Plan executor, entries and publication](../../../docs/extensibility-roadmap.md#session-ex2a--plan-executor-entries-and-publication), starts the shared write-plan work. Node SQLite and D1 currently assemble separate entry mutations, which makes their atomicity, conflict handling and build scheduling harder to keep aligned.

## What Changes

- Define an ordered SQLite write plan in `@lacecms/db` and execute it through a Node SQLite transaction or one D1 atomic batch. Both runners report guard outcomes and committed outbox work.
- Move entry creation, guarded duplication through creation, complete-draft save, deletion, publication, and unpublication onto the shared plans. Use typed outcomes for expected guard misses, including route occupancy and singleton cardinality, while preserving existing public error codes and authorization.
- Keep publication snapshots, routes, version changes, build coalescing and idempotency in the same atomic unit. Retain current REST and MCP request and response contracts.
- Require explicit trusted list-query limits at the application composition boundary. Keep existing Node and Cloudflare limits, validation, metadata and cursor behavior.
- EX1A is the prerequisite and is archived. Draft reversion remains on its existing repository path. EX2B owns media, builds, outbox writers and shared JavaScript payload construction. EX2C owns synchronization write planning after EX2B. EX2D owns test-store consolidation and removing content reads' Better Auth joins.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [`content-repository-contracts`](../../specs/content-repository-contracts/spec.md) adds typed write-plan outcomes and atomic commit-report parity for the migrated commands.
- [`d1-content-repositories`](../../specs/d1-content-repositories/spec.md) specifies guarded publication admission, including route-conflict classification without relying on a uniqueness failure.
- [`collection-query-options`](../../specs/collection-query-options/spec.md) requires an explicit policy at application construction and removes the implicit Node policy there.

## Impact

The shared plan definitions and SQL live in `packages/db`. The executors live in `packages/platform-node` and `packages/platform-cloudflare`. Application and server composition, their fixtures, and the Node and D1 repository contract runners are affected. Update [architecture §9](../../../docs/architecture/data-model.md), [§10](../../../docs/architecture/publication.md), [§15–16](../../../docs/architecture/runtimes.md) and the existing [transaction and batch ADR](../../../docs/adr/0002-d1-batches-and-node-transactions.md) alongside implementation. The design uses the existing SQLite schema.
