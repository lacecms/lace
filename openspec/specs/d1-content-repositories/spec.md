# d1-content-repositories Specification

## Purpose
Defines how the Cloudflare D1 persistence adapter provides the same content,
media, outbox, and site-build contracts as Node SQLite using only prepared
statements and atomic batches.

## Requirements

### Requirement: D1 adapter implements the portable persistence ports
The Cloudflare platform SHALL provide a D1 content repository implementing the
same portable content-entry read and command, public-content read, configuration
synchronization state and apply, media command/read/list/catalog/deletion
dispatch, dispatcher lease, and site-build command/read/dispatch contracts as
the Node SQLite adapter. It SHALL return portable application values and stable
domain error codes, never D1 row or driver types. It SHALL depend only on a
structural D1 database binding and runtime-neutral packages, and SHALL NOT
import Node built-ins, a Node SQLite driver, an S3 client, filesystem APIs, or
secret material.

#### Scenario: Same inputs give the same observable result
- **WHEN** the same sequence of repository calls runs against migrated Node
  SQLite and migrated local D1
- **THEN** both return equal portable values and the same success or stable
  error code for every call

#### Scenario: Worker bundle stays runtime-neutral
- **WHEN** the D1 adapter's source dependencies are verified
- **THEN** it imports only architecture-permitted public package entry points
  and no Node-only module

### Requirement: D1 multi-statement mutations are single guarded batches
Every D1 mutation that changes more than one row SHALL execute as exactly one
atomic `batch()` of prepared statements and SHALL NOT emulate an interactive
transaction callback or split one logical mutation across batches. A mutation's
precondition SHALL be evaluated inside the batch by its first statement; every
later statement SHALL be conditional on that first statement having taken
effect, so a false precondition makes the whole batch a no-op. The adapter SHALL
inspect the affected-row count of the guard statement and SHALL classify a
zero-row result as the operation's stable conflict or invalid-state failure. A
statement error SHALL roll back every statement of the batch.

#### Scenario: Concurrent saves at one revision
- **WHEN** two complete-draft saves supply the same expected revision
  concurrently
- **THEN** exactly one save commits and advances the revision once, and the
  other returns the revision conflict leaving the winner's fields, blocks, and
  media references intact

#### Scenario: A failing later statement rolls back the batch
- **WHEN** a statement after the guard fails inside a draft save, publication,
  deletion, or synchronization batch
- **THEN** no row changed by an earlier statement of that batch remains changed

### Requirement: D1 publication uses a guarded snapshot insert
D1 publication SHALL create the new published snapshot with an
`INSERT ... SELECT` that copies the draft only while the entry still points to
that draft at the expected revision and the idempotency scope/key has no stored
result. Block and media-reference copies, route replacement, published pointer
update, published-state increment, build-event enqueue or coalescing,
idempotency record, and removal of every other non-draft snapshot of the entry
SHALL each be conditional on the new snapshot existing. A zero-row snapshot
insert SHALL return the revision conflict, or the stored idempotent result when
a concurrent publication with the same scope/key committed first. A route
uniqueness violation SHALL roll back the batch and return the stable
route-conflict failure.

#### Scenario: Route conflict rolls back publication
- **WHEN** publication resolves to a public path owned by another entry
- **THEN** the adapter returns `CONTENT_ROUTE_CONFLICT`, no new snapshot exists,
  and both entries' routes, published pointers, the published-state version,
  and pending build work are unchanged

#### Scenario: Concurrent idempotent publication commits once
- **WHEN** two publications with the same actor, entry, idempotency key, and
  fingerprint run concurrently
- **THEN** one commits a single snapshot and build event, and the other returns
  the replayed result without another snapshot, version increment, or event

### Requirement: D1 draft writes respect statement and invocation budgets
The D1 adapter SHALL bind at most 100 parameters in any statement and SHALL
chunk complete-draft block and media-reference inserts into multi-row
statements within that bound while keeping all chunks in the save's single
atomic batch. It SHALL reject a draft with more than 200 blocks or more than
200 media references before sending any statement. A create or complete-draft
save at those caps, including reloading the saved aggregate, SHALL issue no
more than 50 D1 queries. Set-based reads keyed by identifier lists SHALL chunk
to the same bound-parameter limit.

#### Scenario: Maximum draft saves atomically
- **WHEN** a complete draft with 200 blocks and 200 media references is saved
- **THEN** every block and reference is stored, the revision advances once, no
  statement binds more than 100 parameters, and the call issues at most 50
  queries

#### Scenario: Oversized draft is rejected
- **WHEN** a draft supplies 201 blocks or 201 media references
- **THEN** the adapter rejects it with the stable invalid-state failure and
  sends no write statement

#### Scenario: Unavailable media rolls back a chunked save
- **WHEN** a reference in the last chunk names media that is missing or not
  active
- **THEN** the batch fails and the draft's previous fields, blocks, references,
  and revision remain

### Requirement: D1 build claims and outcomes use guarded batches
The D1 adapter SHALL claim site-build work and create or recover its build row as `running` in the same batch as the outbox lease, using a guarded update that succeeds only from `pending` or `running` and keeps the original start time. An unprocessed event whose build row is already terminal SHALL be completed in that batch without being returned for dispatch. Every outcome SHALL be one guarded batch requiring the same live lease and a `running` build row, and SHALL record retry (`pending`), `failed`, `succeeded`, `accepted`, or tracked `running` together with the event. Tracked completion SHALL be guarded by build ID, provider ID, `running` status, and a completed event, and SHALL be idempotent for the same outcome. Results SHALL match the Node adapter for every transition.

#### Scenario: Batch claim marks running
- **WHEN** the scheduled Worker claims an available build event
- **THEN** the lease and the `running` build row with its start time are committed together

#### Scenario: Stale Worker records after reclaim
- **WHEN** an expired claim is recovered by another invocation and the stale invocation records acceptance
- **THEN** the batch changes nothing and the recovered build remains `running`

#### Scenario: Tracked completion after restart
- **WHEN** a new Worker invocation completes a tracked build with its provider ID
- **THEN** only that build becomes terminal, and a repeated identical completion is a no-op

### Requirement: D1 tracking checks use guarded leases
The D1 adapter SHALL select due tracked builds (`running`, provider ID present, next check due, outbox event completed) in next-check order and lease them in one batch with updates guarded by build ID, provider ID, `running`, and the selected next-check value, returning only rows whose update changed one row together with the event completion time as tracking start and the last successful check time. Check records and completions SHALL be single guarded statements, and results SHALL match the Node adapter.

#### Scenario: Two invocations claim the same check
- **WHEN** two Worker invocations claim due tracking checks at the same time
- **THEN** each due build is returned to at most one of them until its check lease expires

### Requirement: D1 configuration synchronization evolves content in one guarded batch
The D1 adapter SHALL provide the same bounded snapshot scan as the Node adapter
using read-only statements within D1's bound-parameter limit. Its
synchronization apply SHALL evaluate the stored model summary, including
baseline presence and snapshot fingerprints, as the guard of one atomic batch,
and SHALL perform every identity change, structure baseline write, hinted
field rename, field removal, block-type removal with its media-reference
maintenance, default backfill, page-singleton creation, published-state
advancement and build coalescing as later statements of that batch conditional
on the guard, in the same order as the Node adapter. Each rename, removal and
backfill SHALL be a fixed number of set-based statements per model field or
block type, independent of the number of snapshots. A false guard SHALL leave
the database unchanged and SHALL be reported as a stale plan.

#### Scenario: Same evolution result on both runtimes
- **WHEN** the same populated model gains an optional field, a required field
  without a default, a required field with a default, a relaxed constraint and
  a newly allowed block type on Node SQLite and on local D1
- **THEN** both runtimes report the same plan, store the same baseline, and
  return equal drafts and published snapshots after apply

#### Scenario: Same hinted rewrite result on both runtimes
- **WHEN** the same populated model renames a field, removes a media field and
  disallows a used block type through hints on Node SQLite and on local D1
- **THEN** both runtimes report the same plan and return equal drafts,
  published snapshots, blocks and media usage after apply

#### Scenario: Stale D1 synchronization batch is a no-op
- **WHEN** a draft of the scanned model is saved between planning and the D1
  apply batch
- **THEN** the guard statement affects no row, no baseline, snapshot, block,
  media-reference, public state or outbox row changes, and the adapter reports
  a stale plan

### Requirement: D1 block migrations use bounded reads and budgeted guarded batches
The D1 adapter SHALL provide the same block-migration entry scan as the Node
adapter, using read-only statements within D1's bound-parameter limit. Its
block-migration write SHALL perform the same row changes as the Node adapter.
It SHALL pack whole entry units into atomic guarded batches that stay within
D1's per-batch statement budget and bound-parameter limit. Each batch SHALL
start with the guard of every unit it contains, and every later write SHALL be
conditional on all guards of the batch holding. When one entry's unit does not fit in one batch,
the adapter SHALL write its published snapshot in one batch and then its draft
in a following batch, each guarded on its own conditions. No snapshot's writes
SHALL span batches. A false guard SHALL leave that batch's rows unchanged,
SHALL be reported as a stale migration, and SHALL stop later batches. Batches
committed earlier SHALL remain committed.

#### Scenario: Same migration result on both runtimes
- **WHEN** the same populated model migrates a block type from version 1 to
  version 3 on Node SQLite and on local D1
- **THEN** both runtimes report the same plan and migrated counts and return
  equal drafts, published snapshots, blocks, revisions and media usage after
  apply

#### Scenario: Large entry stays within the batch budget
- **WHEN** an entry's draft and published snapshot each hold the maximum number
  of blocks and every block is migrated
- **THEN** every submitted batch stays within the statement budget, the
  published snapshot is committed before the draft, and the final state equals
  the Node result

#### Scenario: Stale D1 migration batch is a no-op
- **WHEN** a draft of an entry in a batch is saved between the migration scan
  and the batch
- **THEN** the batch changes no row and the adapter reports a stale migration

### Requirement: D1 entry lifecycle commands use guarded batches
D1 unpublication, draft revert, and guarded duplicate creation SHALL each
execute as one guarded `batch()`. The unpublication guard SHALL require that the
entry's published pointer equals the expected snapshot identity and, when an
idempotency key is supplied, that no record exists for its scope and key; route
removal, pointer clearing, snapshot deletion, published-state increment,
build-event enqueue or coalescing, and the idempotency record SHALL be
conditional on that guard. The revert guard SHALL require the expected draft
revision and published snapshot identity; block and media-reference
replacement and both snapshot updates SHALL be conditional on it. A duplicate
creation guard SHALL require the source entry's draft at the expected revision;
the entry, snapshot, block, and media-reference inserts SHALL be conditional on
it. A zero-row guard SHALL be classified after the batch: an unpublication
returns the stored idempotent result when one exists, `CONTENT_NOT_PUBLISHED`
when the entry has no publication, and `CONTENT_REVISION_CONFLICT` otherwise; a
revert returns `CONTENT_NOT_PUBLISHED` or `CONTENT_REVISION_CONFLICT` by the
same rule; a duplicate creation returns `CONTENT_REVISION_CONFLICT`, or the
invalid-state failure when the source no longer exists.

#### Scenario: Concurrent unpublications commit once
- **WHEN** two unpublications of the same publication without an idempotency key
  run concurrently
- **THEN** one commits a single version increment and build request, and the
  other returns `CONTENT_NOT_PUBLISHED`

#### Scenario: A failing statement rolls back a revert
- **WHEN** a statement after the guard fails inside a revert batch
- **THEN** the draft's fields, blocks, media references, and both revisions are
  unchanged

### Requirement: D1 media metadata updates use one guarded batch
D1 media metadata updates SHALL execute as one guarded `batch()`. The guard
SHALL require that the item exists, is `active`, and has the expected
`updated_at`. The row update SHALL be conditional on the guard. The
published-content version increment and the build-event enqueue or
coalescing SHALL be conditional on the guard and on a reference from a current
published snapshot, evaluated inside the same batch. A zero-row guard SHALL be
classified after the batch with the same rule as Node: `CONTENT_INVALID_STATE`
for an existing item that is not `active`, and `MEDIA_UPDATE_CONFLICT`
otherwise.

#### Scenario: Concurrent edits commit once
- **WHEN** two metadata updates with the same expected `updated_at` run
  concurrently on an item used by a publication
- **THEN** one commits its values with a single version increment and build
  request, and the other fails with `MEDIA_UPDATE_CONFLICT`

#### Scenario: A failing statement rolls back the update
- **WHEN** a statement after the guard fails inside a metadata update batch
- **THEN** the metadata, `updated_at`, the published-content version and build
  work are unchanged

### Requirement: D1 build-export pages use bounded batched reads
The D1 adapter SHALL read a build-export page with at most two D1 batches and
at most ten read statements in total, independent of the number of entries,
blocks, globals and media on the page:

1. The first batch SHALL read the published-state version and the candidate
   routed entries after the cursor, with each candidate's stored JSON size.
2. The second batch SHALL read the published-state version again, then the
   page's snapshots, visible blocks and delivered media through path-range
   predicates, and, on the first page, the published globals with their
   snapshots, blocks and media.

Statements SHALL bind at most 100 parameters and SHALL NOT use identifier
lists that grow with page size. The page fails with
`BUILD_EXPORT_VERSION_CHANGED` in either of these cases:

- the version read in either batch differs from the cursor's version;
- on a first page, the two batches observe different versions.

Including build-token verification, a page request SHALL stay within the
Workers Free limit of 50 D1 queries per invocation.

#### Scenario: A full page stays within the statement budget
- **WHEN** a page holds 100 entries with 200 blocks and 200 media references
  each, and the first page also holds globals
- **THEN** the adapter issues at most two batches with at most ten read
  statements, and the complete HTTP page request issues at most 50 D1 queries

#### Scenario: A publication lands between the two batches
- **WHEN** the published-state version changes after the first batch and
  before the second
- **THEN** the page fails with `BUILD_EXPORT_VERSION_CHANGED` and no mixed
  page is returned
