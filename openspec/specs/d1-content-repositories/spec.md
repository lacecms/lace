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
