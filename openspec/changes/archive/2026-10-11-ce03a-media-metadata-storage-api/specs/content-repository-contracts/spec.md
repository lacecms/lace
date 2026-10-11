## ADDED Requirements

### Requirement: Repository contract fixtures cover media metadata updates
The shared repository contract suite SHALL include identical cases, for every
SQL runtime, for media metadata updates. The cases SHALL assert the stored
values and `updatedAt` after an update, clearing values, and the round trip of
every value through list, catalog, detail and public media reads. They SHALL
assert that an item used by a current publication increments the
published-content version once and leaves one pending build with the reason
`media_metadata`, and that an item used only by a draft, or by nothing, leaves
both unchanged. They SHALL assert that a stale `updatedAt`, including a write
committed by an independent repository over the same database, fails with
`MEDIA_UPDATE_CONFLICT`, that a `deleting` item fails with
`CONTENT_INVALID_STATE`, and that each failure and an injected checkpoint
failure leave the item, the version and build work unchanged. They SHALL
assert that the database refuses an out-of-range or half-set focal point and
over-long text.

#### Scenario: Node and D1 conform for metadata updates
- **WHEN** the metadata update cases run against migrated file-backed SQLite,
  in-memory SQLite and local D1
- **THEN** every case passes without a runtime-specific variant or skipped
  assertion
