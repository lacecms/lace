# sqlite-schema-and-migrations Specification

## Purpose

Defines the portable relational storage foundation that preserves Lace content,
security, dispatch, and installation invariants across SQLite and D1.

## Requirements

### Requirement: Single-installation relational integrity
The system SHALL create a SQLite-compatible schema for one Lace installation
that persists content models, entries, draft and published snapshots, ordered
blocks, published routes, media metadata and reference projections, global
published state, outbox events, site-build history, idempotency records,
installation state, setup tokens, API tokens, rate-limit buckets, and the
authentication tables needed by the selected authentication provider. It SHALL
store application IDs as text and timestamps as UTC Unix milliseconds; binary
media SHALL remain outside the database. The schema SHALL restrict model kinds,
media states, build states, singleton state, and other finite lifecycle values
to the architecture-defined values.

#### Scenario: Fresh schema stores a content lifecycle aggregate
- **WHEN** a new installation stores a valid model, entry, draft snapshot, and
  ordered blocks
- **THEN** the records use their declared stable identities and relational
  fields, and no binary media payload is stored in the database

#### Scenario: Schema rejects an invalid lifecycle value
- **WHEN** a write attempts to store an unsupported content-model kind, media
  deletion status, site-build status, or non-singleton published-state key
- **THEN** the database rejects the write and leaves valid stored state intact

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

### Requirement: Indexed, forward-compatible database initialization
The system SHALL supply ordered forward migrations and expose the installed
migration version(s) after migration. It SHALL index model entry lists, route
lookups, blocks by snapshot and position, media-reference reverse lookups,
available outbox work, and site-build history. A newly migrated Node SQLite
database SHALL enable foreign-key enforcement and write-ahead logging every time
it is opened; those Node-specific connection settings SHALL not change the
shared SQLite/D1 schema or migration SQL.

#### Scenario: Empty database migrates and reopens safely
- **WHEN** a Node process migrates a new SQLite file and opens it again
- **THEN** all forward migrations report as installed, required tables and
  indexes exist, foreign-key enforcement and write-ahead logging are enabled,
  and a foreign-key violation is rejected

#### Scenario: Required lookup has an index
- **WHEN** a runtime queries an entry list, published route, ordered snapshot
  blocks, media references, available outbox event, or build history
- **THEN** the schema provides the corresponding declared index for a bounded
  lookup plan

### Requirement: Authentication-provider records preserve a validated Lace role
The schema SHALL persist provider-compatible `user`, `session`, `account`, and
`verification` records with unique user email and session token, foreign-key
account/session ownership, and the provider's required timestamps and
credential columns. The user record SHALL store a non-null Lace role limited to
`admin`, `editor`, or `viewer` and SHALL default the role to `viewer`. Schema
changes needed to meet this contract SHALL use ordered forward migrations and
SHALL NOT create duplicate authentication tables on a database that already
has a compatible baseline.

#### Scenario: New provider user has the least-privileged role
- **WHEN** the authentication provider persists a newly created user without a
  role supplied by a privileged Lace workflow
- **THEN** the database stores `viewer` as that user's role

#### Scenario: Invalid role is persisted
- **WHEN** a write attempts to persist a user role outside the Lace role set
- **THEN** the database rejects the write and leaves valid authentication data
unchanged

### Requirement: Security state supports atomic first-admin and bounded lookup decisions
The schema SHALL persist singleton installation completion state, expiring
setup-credential claims, opaque build-credential metadata and revocation, and
fixed-window rate-limit buckets. It SHALL enforce one installation singleton
and unique setup/build verifiers, and SHALL index the active-user,
token-verifier, and bucket-key lookups required to enforce first-admin,
last-admin, credential verification, and rate-limit decisions without an
unbounded scan. Any new schema representation SHALL be added by an ordered
forward migration compatible with SQLite and D1.

#### Scenario: Concurrent last-admin checks run
- **WHEN** competing transactions attempt to disable or demote active
administrators
- **THEN** the persisted guarded operation leaves at least one active
administrator and does not rely on an unbounded user-table scan

### Requirement: Batch mutation guards are transient schema records
The schema SHALL provide a mutation-guard table keyed by a non-null
batch-unique token with a creation timestamp, added by an ordered forward
migration compatible with SQLite and D1. A guard row SHALL exist only inside the
atomic batch that inserted it; every mutation that inserts a guard SHALL delete
it in the same batch, so committed state never retains a guard row. Node
SQLite transactions SHALL NOT require the table.

#### Scenario: Migrated database exposes the guard table
- **WHEN** an empty database applies all forward migrations
- **THEN** the mutation-guard table exists, a null token is rejected, and the
  installed migration list includes the new migration

#### Scenario: Committed state has no guard rows
- **WHEN** any D1 mutation batch commits, is a guarded no-op, or rolls back
- **THEN** the mutation-guard table contains no rows afterwards

### Requirement: Explicit Node migration prepares file-backed database parents
Explicit Node migration SHALL recursively create missing parent directories of the selected file-backed SQLite path before opening the database. Existing directories and data SHALL be preserved; a repeated migration SHALL report the same installed versions without reapplying completed migrations. The `:memory:` database SHALL require no filesystem directory preparation. Directory creation failure SHALL stop migration before opening or mutating the selected database and SHALL remain visible to the caller. This preparation SHALL NOT introduce automatic API startup migrations or alter shared SQLite/D1 migration SQL.

#### Scenario: Fresh nested file path
- **WHEN** explicit Node migration selects a SQLite file whose parent and intermediate directories do not exist
- **THEN** those directories are created and all checked-in forward migrations are installed at the selected path

#### Scenario: Relative path uses the operator working directory
- **WHEN** explicit Node migration selects a relative nested SQLite path
- **THEN** the directories and database are created relative to the invoking process working directory

#### Scenario: Repeated migration preserves existing data
- **WHEN** explicit Node migration runs again on a migrated database containing stored application data and neighbouring files
- **THEN** it reports the installed versions without duplicate ledger entries and preserves the application data and neighbouring files

#### Scenario: In-memory migration avoids filesystem preparation
- **WHEN** explicit Node migration selects `:memory:`
- **THEN** it installs and reports migrations without creating or preparing a filesystem directory or database file

#### Scenario: Parent directory cannot be created
- **WHEN** a parent component is an existing file or filesystem permissions reject directory creation
- **THEN** migration fails before opening the selected database, leaves existing data intact and reports the failure to its caller

#### Scenario: Concurrent parent preparation
- **WHEN** another process creates a required directory during explicit migration's directory preparation
- **THEN** preparation accepts the existing directory without deleting or replacing it, while database migration retains its existing locking behavior

### Requirement: Site-build status migration reclassifies unproven outcomes
The shared schema SHALL restrict `site_builds.status` to `pending`, `running`, `accepted`, `succeeded`, `failed`, `cancelled`, and `unknown`, and SHALL store nullable provider tracking stage, last-check time, and next-check time with an index for selecting due tracked builds. A single forward migration shared by Node SQLite and D1 SHALL introduce these without losing any build row, identity, target version, requester, timestamps, provider ID, or stored diagnostic. Existing `running` rows SHALL become `accepted` with a completion time, because no runtime tracked them. On D1, `succeeded` rows without a provider ID SHALL become `accepted`, because deploy-hook acceptance never proved publication. On Node SQLite, `succeeded` rows SHALL remain `succeeded`, because the self-hosted builder proved the release. `pending` and `failed` rows, outbox events, attempts, leases, and coalescing state SHALL be unchanged. The migration SHALL be recorded like every other checked-in migration and SHALL be refused by no supported runtime.

#### Scenario: D1 history is reclassified
- **WHEN** a migrated D1 database containing `running` rows with provider IDs and `succeeded` rows without provider IDs applies the migration
- **THEN** all of those rows become `accepted`, keep their provider IDs and timestamps, and gain a completion time when absent

#### Scenario: Node builder history is preserved
- **WHEN** a Node SQLite database containing builder `succeeded`, `failed`, and `pending` rows applies the migration
- **THEN** each row keeps its status, timestamps, and diagnostics

#### Scenario: New status values are enforced
- **WHEN** a write stores `accepted`, `cancelled`, or `unknown` after migration, or an unsupported status value
- **THEN** the three new values are accepted and the unsupported value is rejected

### Requirement: Account token tables support invitations and password resets
Migration `0004` SHALL add an `invitations` table (identifier, normalized
email, Lace role, unique token digest, inviting user, created, expiry, accepted,
revoked and accepted-user columns) with a role check and a partial unique index
that allows one active invitation per email, and a `password_reset_tokens`
table (token digest primary key, user reference with cascade delete, created,
expiry, consumed and requesting-administrator columns) indexed by user. The
migration SHALL be additive, SHALL apply identically to Node SQLite and D1, and
SHALL store no plaintext token.

#### Scenario: Migration applies to an alpha.4 database
- **WHEN** migration `0004` runs on a database migrated to `0003`
- **THEN** both tables exist, existing users and content are unchanged, and
  readiness reports the schema as current

#### Scenario: Second active invitation is rejected by the schema
- **WHEN** two active invitation rows for one email are inserted
- **THEN** the second insert fails the unique constraint

### Requirement: Content models store a verifiable structure baseline
Migration `0005` SHALL add two nullable text columns to `content_models`:
`structure_json`, holding the canonical JSON structure of the model as of the
last successful synchronization, and `structure_json_hash`, holding the
structural hash that structure was written for. The migration SHALL be
additive, SHALL apply identically to Node SQLite and D1, and SHALL leave every
existing row with both columns `NULL`. A stored baseline SHALL be considered
valid only when `structure_json_hash` equals the row's `structure_hash`; the
configuration file remains the only authoritative definition.

#### Scenario: Migration applies to an alpha.4 database
- **WHEN** migration `0005` runs on a database migrated to `0004` that holds
  content models and entries
- **THEN** both columns exist and are `NULL` for every model, entries and
  snapshots are unchanged, and readiness reports the schema as current

#### Scenario: Identity write without baseline invalidates it
- **WHEN** a model row has a baseline and its `structure_hash` is later changed
  without updating `structure_json_hash`
- **THEN** reads of the synchronization state report that the model has no
  valid baseline

### Requirement: Media rows store constrained descriptive metadata
Migration `0006` SHALL add four nullable columns to `media`: `alt` and
`caption` as text, and `focal_x` and `focal_y` as reals. The database SHALL
enforce that `alt` has at most 1,000 characters, that `caption` has at most
2,000 characters, that `focal_x` and `focal_y` are each from 0 to 1 inclusive,
and that both focal coordinates are set or both are `NULL`. The migration SHALL
be additive, SHALL not rebuild the `media` table, SHALL apply identically to
Node SQLite and D1, and SHALL leave every existing row with all four columns
`NULL`. The `metadata_json` column SHALL remain reserved and unchanged.

#### Scenario: Migration applies to a database with media
- **WHEN** migration `0006` runs on a database migrated to `0005` that holds
  media referenced by drafts and publications
- **THEN** the four columns exist and are `NULL` for every row, media
  references and `metadata_json` are unchanged, and readiness reports the
  schema as current

#### Scenario: The database refuses an inconsistent focal point
- **WHEN** a statement sets `focal_x` to `0.5` while `focal_y` stays `NULL`,
  or sets `focal_y` to `1.5`
- **THEN** the statement fails with a check-constraint error and the row is
  unchanged

#### Scenario: The database refuses over-long text
- **WHEN** a statement stores an `alt` value of 1,001 characters
- **THEN** the statement fails with a check-constraint error

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

### Requirement: Content snapshots store an optional SEO group
`content_snapshots` SHALL have a nullable `seo_json` column that holds the
normalized SEO group as a JSON object, or `NULL` when the snapshot has none.
Migration `0008` SHALL add the column with one additive `ALTER TABLE … ADD`
on Node SQLite and D1. The migration SHALL not rebuild a table, backfill rows
or change any existing row, index or foreign key. The checked-in migration
inventory SHALL list the migration.

#### Scenario: Upgrade a populated database
- **WHEN** a database at migration `0007` holding pages, collection entries,
  published snapshots, blocks and media references is migrated to `0008` on
  Node SQLite or D1
- **THEN** every existing row is unchanged, every existing snapshot has
  `seo_json` `NULL`, and foreign keys still hold

#### Scenario: Store a snapshot with an SEO group
- **WHEN** a snapshot is inserted with an SEO group after the migration
- **THEN** reading it back returns the same group
