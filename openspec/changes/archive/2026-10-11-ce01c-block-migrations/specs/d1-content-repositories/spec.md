## ADDED Requirements

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
