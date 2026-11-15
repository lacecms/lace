## Why

[EX2D — One test store](../../../../docs/extensibility-roadmap.md#session-ex2d--one-test-store) follows [EX2C](../2026-11-15-ex02c-shared-write-plans-configuration-sync/). The JavaScript content store in `test-utils` implements persistence outside the shared repository contract suite, and content SQL still reads Better Auth's user schema for display names and snapshot roles.

## What Changes

- Use the production Node SQLite repository on a fresh migrated `:memory:` database for persistence-backed REST, MCP and application tests. Retire the JavaScript content store and carry its distinct assertions into the appropriate test suites. Keep narrow port doubles for unit tests and in-memory object storage for binary fixtures.
- Adopt a Lace-owned content actor profile projection maintained from the existing security records. Content queries read the projection to preserve live display names, snapshot roles, missing-user fallbacks and the current Node and D1 read budgets. Existing installations receive the projection through a forward migration.
- Preserve REST and MCP payloads, authorization, public delivery and publication behavior. EX1C owns the remaining legacy test typecheck exceptions. EX3 owns typed outbox events.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [`application-ports-and-commands`](../../../specs/application-ports-and-commands/spec.md) uses migrated Node SQLite for application persistence fixtures and retains portable unit doubles.
- [`content-repository-contracts`](../../../specs/content-repository-contracts/spec.md) covers every content repository used by persistence-backed tests, including actor profile reads and lifecycle behavior.
- [`node-content-repositories`](../../../specs/node-content-repositories/spec.md) resolves editor and uploader names through the Lace projection within existing reads.
- [`sqlite-schema-and-migrations`](../../../specs/sqlite-schema-and-migrations/spec.md) defines the actor projection, forward backfill and atomic maintenance.
- [`configuration-synchronization`](../../../specs/configuration-synchronization/spec.md) verifies stale-plan outcomes through the SQL adapters and application path.
- [`content-domain-rules`](../../../specs/content-domain-rules/spec.md) verifies the shared media usage bound through the actual repositories and DTO schema.

## Impact

The change touches `db`, both platform repositories and the `test-utils`, `server`, `mcp` and application persistence suites. Update [architecture §6 and §20](../../../../docs/architecture/workspace.md), [§9](../../../../docs/architecture/data-model.md), [§14](../../../../docs/architecture/security.md) and [§15–16](../../../../docs/architecture/runtimes.md) for the test topology and the separation of content reads from security storage. Preserve the [D1 query budgets](../../../specs/d1-content-repositories/spec.md), the [authorized editor-description contract](../../../specs/content-use-cases/spec.md#requirement-entry-list-queries-and-editor-names-are-authorized-reads) and the [media uploader contract](../../../specs/media-use-cases/spec.md). The migration leaves content and account data in their current tables.
