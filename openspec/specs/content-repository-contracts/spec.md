# content-repository-contracts Specification

## Purpose

Defines reusable persistence contracts that prove lifecycle invariants across database runtimes.

## Requirements

### Requirement: Repository contract fixtures preserve lifecycle invariants
The system SHALL provide a reusable, factory-driven repository contract suite
with deterministic fixtures for cardinality, revision guards, route conflict
and rollback, immutable publications, idempotency, projections, cascades,
outbox coalescing, dispatcher leases, site-build transitions, configuration
synchronization, media catalog and usage, and cursor ordering. A runtime
adapter SHALL participate only by supplying a factory for a freshly migrated
database, its repository, a second independent repository over the same
database, and parameterized SQL seeding/inspection; the cases themselves SHALL
be identical for every runtime.

#### Scenario: SQLite modes conform
- **WHEN** contracts run against migrated file-backed and in-memory SQLite
- **THEN** both modes satisfy all lifecycle assertions

#### Scenario: Local D1 conforms
- **WHEN** the same contract cases run against a migrated local D1 database
- **THEN** every case passes without a D1-specific case variant or skipped
  assertion

#### Scenario: Independent writers conflict deterministically
- **WHEN** two repositories over the same database save complete drafts at the
  same expected revision, or publish with the same idempotency key
- **THEN** the suite observes exactly one committed save and one stable revision
  conflict, or one committed publication and one replay, in every runtime

### Requirement: Repository contract fixtures verify atomicity and indexes
The system SHALL inject mutation failures and inspect query plans for route, block, media-reference, entry-list, and outbox lookups.

#### Scenario: Failed checkpoint rolls back
- **WHEN** a configured mutation checkpoint throws
- **THEN** no partial aggregate or public projection remains

#### Scenario: Critical lookups use indexes
- **WHEN** representative queries are explained
- **THEN** each plan names its required index

#### Scenario: Injected D1 failure happens inside the batch
- **WHEN** a D1 mutation checkpoint is configured to fail
- **THEN** the failure is raised by a statement executing within the mutation's
  batch after earlier statements ran, and none of their effects remain

### Requirement: Repository contract fixtures cover entry lifecycle commands
The shared repository contract suite SHALL include identical cases, for every
SQL runtime, for unpublication, draft revert, and guarded duplicate creation.
The cases SHALL assert the complete state after success: routes, by-path
lookup, build export, published-state version, pending build work, snapshots,
blocks, media references, draft revision, and derived status. They SHALL assert
that every guard failure leaves that state unchanged, including a stale
published snapshot identity, a stale draft revision, a publication removed or
replaced between read and write, and a changed duplicate source. They SHALL
cover an idempotent unpublication retry from an independent repository over the
same database and injected failures at the unpublication checkpoints.

#### Scenario: Unpublication conforms on every runtime
- **WHEN** the unpublication cases run against Node SQLite and local D1
- **THEN** both remove the route and published snapshot, keep the draft,
  increment the version once, coalesce one build request, and refuse a second
  unpublication with `CONTENT_NOT_PUBLISHED`

#### Scenario: An unpublication retry replays on every runtime
- **WHEN** a second repository over the same database repeats a successful
  unpublication with the same actor, key, and input
- **THEN** it returns the replayed result and the version and build work are
  unchanged

#### Scenario: Injected unpublication failure rolls back
- **WHEN** a configured unpublication checkpoint throws
- **THEN** the route, published pointer, published snapshot, version, and build
  work are unchanged

#### Scenario: Revert and duplicate races conform
- **WHEN** a revert uses a stale revision or a publication replaced after it was
  read, or a duplicate creation guards on a stale source revision
- **THEN** each fails with `CONTENT_REVISION_CONFLICT` and leaves every table
  unchanged on every runtime

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
