## MODIFIED Requirements

### Requirement: Persistence constraints preserve content and dispatch invariants
The schema SHALL enforce one entry per page or global model through partial
uniqueness, one globally owned published path, unique media storage keys, one
idempotency record per scope/key, and at most one unclaimed pending site-build
request. It SHALL represent outbox dispatcher leases with nullable owner and
timestamp fields. Required foreign keys and actions SHALL cascade entry/snapshot
removal to blocks, media-reference projections, and published routes; restrict
deletion of a model with entries or media with references; set entry snapshot
pointers to NULL when their snapshot is deleted; and cascade a content-model key
update to entries.

#### Scenario: Conflicting singleton or public route is rejected
- **WHEN** writes attempt to create a second singleton entry for one page or
  global model or assign an already-owned published path to another entry
- **THEN** the conflicting write is rejected by a uniqueness constraint

#### Scenario: Referential cleanup and protection are enforced
- **WHEN** an entry or snapshot is deleted, or deletion targets a model with
  entries or a media record with reference projections
- **THEN** dependent entry data is removed according to its cascade rule, entry
  pointers are safely cleared where needed, and protected model/media deletion
  is rejected

## ADDED Requirements

### Requirement: Content-model kinds include global through a guarded table rebuild
The `content_models.kind` check SHALL accept exactly `page`, `collection` and
`global`. Migration `0007` SHALL widen the check on an existing database by
rebuilding `content_models` inside the migration transaction with deferred
foreign-key enforcement: it SHALL copy every column of every stored model
unchanged, keep the primary key, the version check and the
`content_entries.model_key` foreign key with its key-update cascade and delete
restriction, and leave every entry, snapshot, block, route, media reference and
published-state row unchanged. The same migration SQL SHALL apply on Node
SQLite and D1. The explicit Node migrator SHALL apply pending migrations with
foreign-key enforcement suspended on its connection, SHALL run a foreign-key
integrity check before restoring enforcement, and SHALL fail without reporting
success when the check finds a violation. Connections that serve the
application SHALL keep foreign-key enforcement on.

#### Scenario: Upgrade a populated database
- **WHEN** a database at migration `0006` holding page and collection models,
  their entries, published snapshots, routes and media references is migrated on
  Node or D1
- **THEN** migration `0007` completes, every stored row is unchanged, a
  `global` model can be inserted, and an unsupported kind is still rejected

#### Scenario: Foreign keys survive the rebuild
- **WHEN** the migrated database deletes a model that has entries, renames a
  model key, or inserts an entry naming an unknown model
- **THEN** the deletion and the unknown reference are rejected and the key
  update cascades to the model's entries

#### Scenario: Node migration verifies referential integrity
- **WHEN** the Node migrator finishes applying pending migrations
- **THEN** it runs the foreign-key integrity check, restores enforcement on the
  connection, and reports the installed versions only when no violation exists
