## ADDED Requirements

### Requirement: D1 configuration synchronization evolves content in one guarded batch
The D1 adapter SHALL provide the same bounded snapshot scan as the Node adapter
using read-only statements within D1's bound-parameter limit. Its
synchronization apply SHALL evaluate the stored model summary, including
baseline presence and snapshot fingerprints, as the guard of one atomic batch,
and SHALL perform every identity change, structure baseline write, default
backfill, page-singleton creation, published-state advancement and build
coalescing as later statements of that batch conditional on the guard. Each
backfill SHALL be one set-based statement per model field. A false guard SHALL
leave the database unchanged and SHALL be reported as a stale plan.

#### Scenario: Same evolution result on both runtimes
- **WHEN** the same populated model gains an optional field, a required field
  without a default, a required field with a default, a relaxed constraint and
  a newly allowed block type on Node SQLite and on local D1
- **THEN** both runtimes report the same plan, store the same baseline, and
  return equal drafts and published snapshots after apply

#### Scenario: Stale D1 synchronization batch is a no-op
- **WHEN** a draft of the scanned model is saved between planning and the D1
  apply batch
- **THEN** the guard statement affects no row, no baseline, backfill, public
  state or outbox row changes, and the adapter reports a stale plan
