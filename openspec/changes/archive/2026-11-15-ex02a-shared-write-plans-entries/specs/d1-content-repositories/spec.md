## MODIFIED Requirements

### Requirement: D1 multi-statement mutations are single guarded batches
Every D1 mutation that changes more than one row SHALL execute as exactly one
atomic `batch()` of prepared statements. D1 SHALL use the batch as the atomic
unit for the entire logical mutation, without emulating an interactive
transaction. A mutation's precondition SHALL be evaluated inside the batch by
its first statement. Every later write SHALL depend on the guard so a false
precondition makes the batch a persistent no-op. Shared entry write plans
SHALL read any diagnostics needed to classify a false guard in the same
batch. The adapter SHALL inspect the guard's
affected-row count and classify a zero-row result as the operation's stable
conflict, replay or invalid-state outcome. A statement error SHALL roll back
every statement of the batch.

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
D1 publication SHALL admit the shared plan in a single atomic batch. Admission
SHALL require that the entry still points to the validated draft at the
expected revision, delivered internal links are valid, no live idempotency
record exists for the supplied scope and key, and any candidate route is
unowned or already owned by the entry. The plan SHALL insert the publication
with an `INSERT ... SELECT` from the guarded draft. Block, media and link
projections, route replacement, published pointer update, published-state
increment, build enqueue or coalescing, optional idempotency record and
removal of every other non-draft snapshot of the entry SHALL depend on
successful admission and insertion of the new snapshot.

A guard miss SHALL produce a typed outcome, giving the live idempotent
result precedence over revision and validation conflicts. A stale revision
SHALL take precedence over invalid delivered internal links. A route owned
by another entry SHALL return `CONTENT_ROUTE_CONFLICT` without relying on a
database uniqueness error. The route uniqueness constraint SHALL still
protect stored data.

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
