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
The system SHALL supply one baseline migration that creates the complete
schema, followed by ordered forward migrations for later schema changes, and
expose the installed migration version(s) after migration. The baseline SHALL
be generated from the declared schema and SHALL be the same SQL for Node SQLite
and D1. It SHALL index model entry lists, route
lookups, blocks by snapshot and position, media-reference reverse lookups,
available outbox work, and site-build history. A newly migrated Node SQLite
database SHALL enable foreign-key enforcement and write-ahead logging every time
it is opened; those Node-specific connection settings SHALL not change the
shared SQLite/D1 schema or migration SQL.

#### Scenario: Empty database migrates and reopens safely
- **WHEN** a Node process migrates a new SQLite file and opens it again
- **THEN** the baseline and every later checked-in migration report as
  installed, required tables and
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

### Requirement: Shared SQL and the declared schema stay consistent with the checked-in migrations

The repository SHALL verify that the shared column lists used by both the Node
SQLite and D1 repositories name only columns created by the checked-in
migrations. For each shared entry, media, snapshot, block and block-copy column
list, a test SHALL apply every checked-in migration in journal order to an empty
in-memory SQLite database. The test SHALL then fail when the list names a column
missing from its table's column information, or when the list's statement does
not prepare against that database.

The root lint gate SHALL fail when the migration snapshot chain is inconsistent,
or when the declared table schema differs from the latest checked-in migration
snapshot, so that generating migrations would produce a new migration. The
check SHALL not write to the committed migration directory, and SHALL fail
rather than wait for interactive input. Both checks SHALL use the same schema
definition and migrations that Node SQLite and D1 apply, so the parity of the
two runtimes is unchanged.

#### Scenario: Column lists match the migrated schema

- **WHEN** the package tests run against the committed migrations and column lists
- **THEN** every column named by each shared column list exists in its table, every list's statement prepares, and the test passes

#### Scenario: A column list names a column no migration creates

- **WHEN** a shared column list names a column that no checked-in migration adds to its table
- **THEN** the test fails and its message names the list, the table and the missing column

#### Scenario: The declared schema changes without a migration

- **WHEN** a table, column, index or constraint is added to or changed in the declared schema and no migration is generated
- **THEN** `pnpm lint` fails, reports that a migration is pending, and leaves the committed migration directory unchanged

#### Scenario: The migration snapshot chain is inconsistent

- **WHEN** two checked-in migration snapshots collide or a snapshot does not follow its predecessor
- **THEN** `pnpm lint` fails with the migration tool's check result

#### Scenario: Schema and migrations agree

- **WHEN** `pnpm lint` runs on a checkout whose declared schema matches the latest checked-in snapshot
- **THEN** the schema check passes without creating, changing or deleting a file under the committed migration directory

### Requirement: The schema stores invitation and password-reset tokens
The schema SHALL have an `invitations` table (identifier, normalized
email, Lace role, unique token digest, inviting user, created, expiry, accepted,
revoked and accepted-user columns) with a role check and a partial unique index
that allows one active invitation per email, and a `password_reset_tokens`
table (token digest primary key, user reference with cascade delete, created,
expiry, consumed and requesting-administrator columns) indexed by user. Both
tables SHALL be identical on Node SQLite and D1 and SHALL store no plaintext
token.

#### Scenario: Second active invitation is rejected by the schema
- **WHEN** two active invitation rows for one email are inserted
- **THEN** the second insert fails the unique constraint

### Requirement: Content-model rows hold a verifiable structure baseline
`content_models` SHALL have two nullable text columns:
`structure_json`, holding the canonical JSON structure of the model as of the
last successful synchronization, and `structure_json_hash`, holding the
structural hash that structure was written for, identical on Node SQLite and
D1. A model row written before its first synchronization records a baseline
holds both columns `NULL`. A stored baseline SHALL be considered
valid only when `structure_json_hash` equals the row's `structure_hash`; the
configuration file remains the only authoritative definition.

#### Scenario: Identity write without baseline invalidates it
- **WHEN** a model row has a baseline and its `structure_hash` is later changed
  without updating `structure_json_hash`
- **THEN** reads of the synchronization state report that the model has no
  valid baseline

### Requirement: The schema constrains media descriptive metadata
`media` SHALL have four nullable columns: `alt` and `caption` as text, and
`focal_x` and `focal_y` as reals. The database SHALL
enforce that `alt` has at most 1,000 characters, that `caption` has at most
2,000 characters, that `focal_x` and `focal_y` are each from 0 to 1 inclusive,
and that both focal coordinates are set or both are `NULL`, identically on Node
SQLite and D1. The `metadata_json` column SHALL remain reserved.

#### Scenario: The database refuses an inconsistent focal point
- **WHEN** a statement sets `focal_x` to `0.5` while `focal_y` stays `NULL`,
  or sets `focal_y` to `1.5`
- **THEN** the statement fails with a check-constraint error and the row is
  unchanged

#### Scenario: The database refuses over-long text
- **WHEN** a statement stores an `alt` value of 1,001 characters
- **THEN** the statement fails with a check-constraint error

### Requirement: Content-model kinds include global
The `content_models.kind` check SHALL accept exactly `page`, `collection` and
`global`, identically on Node SQLite and D1. `content_entries.model_key` SHALL
reference `content_models` with a key-update cascade and a delete restriction.
The explicit Node migrator SHALL apply pending migrations with
foreign-key enforcement suspended on its connection, SHALL run a foreign-key
integrity check before restoring enforcement, and SHALL fail without reporting
success when the check finds a violation. Connections that serve the
application SHALL keep foreign-key enforcement on.

#### Scenario: Foreign keys survive the rebuild
- **WHEN** a migrated database deletes a model that has entries, renames a
  model key, or inserts an entry naming an unknown model
- **THEN** the deletion and the unknown reference are rejected and the key
  update cascades to the model's entries

#### Scenario: Node migration verifies referential integrity
- **WHEN** the Node migrator finishes applying pending migrations
- **THEN** it runs the foreign-key integrity check, restores enforcement on the
  connection, and reports the installed versions only when no violation exists

### Requirement: Snapshot rows hold an optional SEO group
`content_snapshots` SHALL have a nullable `seo_json` column that holds the
normalized SEO group as a JSON object, or `NULL` when the snapshot has none,
identically on Node SQLite and D1.

#### Scenario: Store a snapshot with an SEO group
- **WHEN** a snapshot is inserted with an SEO group
- **THEN** reading it back returns the same group

### Requirement: Block rows hold the block envelope
`content_blocks` SHALL have the columns `anchor` (nullable text), `class_name`
(nullable text), `hidden` (integer, not null, default `0`, constrained to `0`
or `1`) and `settings_json` (text, not null, default `'{}'`). A partial unique
index SHALL make `(snapshot_id, anchor)` unique for rows whose `anchor` is not
`NULL`, identically on Node SQLite and D1. A block row written without
envelope values SHALL read as visible, without an anchor or class name, with
`{}` settings.

#### Scenario: The database rejects a duplicate anchor
- **WHEN** two blocks of the same snapshot are written with the same anchor
  directly, bypassing validation
- **THEN** the write fails on the unique index, while the same anchor in a
  different snapshot is accepted

#### Scenario: The database rejects an invalid hidden value
- **WHEN** a block row is written with `hidden` `2`
- **THEN** the write fails on the column constraint

### Requirement: Media tags use an indexed join table
The schema SHALL have `media_tags` with non-null text columns
`media_id` and `tag`, a composite primary key `(media_id, tag)`, a foreign key
from `media_id` to `media.id` with `ON DELETE CASCADE`, an index on
`(tag, media_id)`, and checks that `tag` has 1 to 40 characters and contains only ASCII `a-z`, `0-9` and `-`, identically on Node SQLite and
D1.

#### Scenario: The database refuses invalid tag rows
- **WHEN** a statement inserts a duplicate `(media_id, tag)` pair, a tag of 41 characters, a tag with a comma, uppercase letter, space or non-ASCII character, or a row for a missing media item
- **THEN** the statement fails with a constraint error and no row is stored

### Requirement: Import credentials and media hashes are stored
The schema SHALL have nullable integer `api_tokens.expires_at`, nullable text
`api_tokens.created_by`, nullable text `media.sha256` with a check that a
non-null value has 64 characters from `0-9a-f`, and a non-unique index on
`media.sha256`, identically on Node SQLite and D1.

#### Scenario: The database refuses a malformed hash
- **WHEN** a statement stores a `media.sha256` value of 63 characters or with an uppercase letter
- **THEN** the statement fails with a constraint error

### Requirement: Site builds store provider-tracked statuses
The shared schema SHALL restrict `site_builds.status` to `pending`, `running`, `accepted`, `succeeded`, `failed`, `cancelled`, and `unknown`, and SHALL store nullable provider tracking stage, last-check time, and next-check time with an index for selecting due tracked builds, identically on Node SQLite and D1.

#### Scenario: New status values are enforced
- **WHEN** a write stores `accepted`, `cancelled`, or `unknown`, or an unsupported status value
- **THEN** the three new values are accepted and the unsupported value is rejected

### Requirement: Databases migrated before the baseline are refused
A database whose migration ledger records a migration that is not checked in
SHALL be treated as created by an engine older than the baseline and SHALL be
refused before any schema or data change, identically for Node SQLite and D1.
Explicit Node migration SHALL fail with an error that names the selected
database as unsupported and tells the operator to recreate it (exporting
content first when it must be kept); it SHALL leave the database file, its
ledger and its data unchanged. The Node API and the Worker SHALL NOT report
ready for such a database, because the baseline is not recorded as installed.
A database whose ledger records exactly the checked-in migrations, or a prefix
of them in order, SHALL migrate normally.

#### Scenario: Node database from an older engine
- **WHEN** explicit Node migration selects a SQLite file whose ledger records
  migrations that are not checked in
- **THEN** migration fails before applying any statement, names the database as
  unsupported with recreate advice, and the file, ledger and rows are unchanged

#### Scenario: D1 database from an older engine
- **WHEN** a Worker serves a D1 database whose `d1_migrations` table records
  only migration names that are not checked in
- **THEN** readiness reports unavailable and no request writes to the database

#### Scenario: Fresh database
- **WHEN** explicit Node migration selects a new SQLite file
- **THEN** it installs the baseline and reports it as the installed version
