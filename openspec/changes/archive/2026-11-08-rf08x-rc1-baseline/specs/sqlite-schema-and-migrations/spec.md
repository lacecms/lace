## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Account token tables support invitations and password resets
**Reason**: The numbered migration this requirement described was squashed into the baseline migration; its upgrade scenarios no longer apply (owner decision 11, rc1 is the oldest supported state).
**Migration**: Replaced by "The schema stores invitation and password-reset tokens", which keeps the current behavior.

### Requirement: Content models store a verifiable structure baseline
**Reason**: The numbered migration this requirement described was squashed into the baseline migration; its upgrade scenarios no longer apply (owner decision 11, rc1 is the oldest supported state).
**Migration**: Replaced by "Content-model rows hold a verifiable structure baseline", which keeps the current behavior.

### Requirement: Media rows store constrained descriptive metadata
**Reason**: The numbered migration this requirement described was squashed into the baseline migration; its upgrade scenarios no longer apply (owner decision 11, rc1 is the oldest supported state).
**Migration**: Replaced by "The schema constrains media descriptive metadata", which keeps the current behavior.

### Requirement: Content-model kinds include global through a guarded table rebuild
**Reason**: The numbered migration this requirement described was squashed into the baseline migration; its upgrade scenarios no longer apply (owner decision 11, rc1 is the oldest supported state).
**Migration**: Replaced by "Content-model kinds include global", which keeps the current behavior.

### Requirement: Content snapshots store an optional SEO group
**Reason**: The numbered migration this requirement described was squashed into the baseline migration; its upgrade scenarios no longer apply (owner decision 11, rc1 is the oldest supported state).
**Migration**: Replaced by "Snapshot rows hold an optional SEO group", which keeps the current behavior.

### Requirement: Content blocks store the block envelope
**Reason**: The numbered migration this requirement described was squashed into the baseline migration; its upgrade scenarios no longer apply (owner decision 11, rc1 is the oldest supported state).
**Migration**: Replaced by "Block rows hold the block envelope", which keeps the current behavior.

### Requirement: Media tags are stored in an indexed join table
**Reason**: The numbered migration this requirement described was squashed into the baseline migration; its upgrade scenarios no longer apply (owner decision 11, rc1 is the oldest supported state).
**Migration**: Replaced by "Media tags use an indexed join table", which keeps the current behavior.

### Requirement: Import credentials and media hashes are stored additively
**Reason**: The numbered migration this requirement described was squashed into the baseline migration; its upgrade scenarios no longer apply (owner decision 11, rc1 is the oldest supported state).
**Migration**: Replaced by "Import credentials and media hashes are stored", which keeps the current behavior.

### Requirement: Site-build status migration reclassifies unproven outcomes
**Reason**: The numbered migration this requirement described was squashed into the baseline migration; its upgrade scenarios no longer apply (owner decision 11, rc1 is the oldest supported state).
**Migration**: Replaced by "Site builds store provider-tracked statuses", which keeps the current behavior.

## ADDED Requirements

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
