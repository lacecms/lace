## ADDED Requirements

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
