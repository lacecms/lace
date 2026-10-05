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
The schema SHALL enforce one page entry per model through partial uniqueness,
one globally owned published path, unique media storage keys, one idempotency
record per scope/key, and at most one unclaimed pending site-build request. It
SHALL represent outbox dispatcher leases with nullable owner and timestamp
fields. Required foreign keys and actions SHALL cascade entry/snapshot removal
to blocks, media-reference projections, and published routes; restrict deletion
of a model with entries or media with references; set entry snapshot pointers to
NULL when their snapshot is deleted; and cascade a content-model key update to
entries.

#### Scenario: Conflicting singleton or public route is rejected
- **WHEN** writes attempt to create a second singleton entry for one page model
  or assign an already-owned published path to another entry
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
