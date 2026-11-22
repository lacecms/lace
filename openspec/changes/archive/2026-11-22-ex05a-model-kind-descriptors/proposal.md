## Why

[EX5A](../../../../docs/extensibility-roadmap.md#session-ex5a--kind-descriptor-table) follows the archived [EX2C shared synchronization plan](../2026-11-15-ex02c-shared-write-plans-configuration-sync/). Today `isSingletonKind` treats every kind except `collection` as a singleton, and the admin, public reads and persistence code make their own decisions about the same three kinds.

## What Changes

- Publish a typed descriptor for each supported kind from `@lacecms/content`. Expose the same policy through `domain` for backend consumers. Adding a kind requires explicit cardinality, routing, delivery, export and admin choices.
- Resolve the collection descriptor against its configured route. Both collection shapes open an entry list, but only a routed collection has slug reads and routed export entries.
- Replace duplicated decisions in validation, sync, entry lifecycle, preview, delivery, import and the admin. Generate the Drizzle kind CHECK from registered keys. Widening the set in a future change requires a versioned SQLite/D1 migration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- [content-domain-rules](../../../specs/content-domain-rules/spec.md) gains a package-level descriptor lookup and an exhaustive policy for the three kinds.
- [sqlite-schema-and-migrations](../../../specs/sqlite-schema-and-migrations/spec.md) ties the current CHECK to the registered keys and specifies how future additions reach installed databases.

## Impact

The additive package API makes this a spec-bearing change under roadmap §2. It uses the dependency directions in [architecture §6](../../../../docs/architecture/workspace.md) and the model definitions in [§8](../../../../docs/architecture/content-configuration.md#content-model-kinds). The compatibility baseline covers [synchronization](../../../specs/configuration-synchronization/spec.md), [REST and build export](../../../specs/rest-contracts/spec.md), [admin behavior](../../../../docs/architecture/admin.md) and [migration policy](../../../../docs/architecture/distribution.md).

EX5A covers the three existing kinds, the current database schema and the current public endpoint families. A fourth kind, custom kind registration, new endpoints and export formats are outside this session. Existing installations require no data rewrite or operator action.
