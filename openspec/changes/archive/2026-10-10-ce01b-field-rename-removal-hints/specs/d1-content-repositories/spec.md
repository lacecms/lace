## MODIFIED Requirements

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
