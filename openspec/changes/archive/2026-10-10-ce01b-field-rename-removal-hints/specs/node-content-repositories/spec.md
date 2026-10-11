## MODIFIED Requirements

### Requirement: Node configuration synchronization applies fresh plans atomically
The Node persistence adapter SHALL provide the portable configuration
synchronization read, bounded snapshot scan, and guarded apply operations over
SQLite. Its apply operation SHALL re-check the supplied plan against stored
model identity, baseline presence, content cardinality and snapshot
fingerprints within one SQLite transaction, perform all allowed model identity
changes, structure baseline writes, hinted field renames, field removals,
block-type removals with their media-reference maintenance, default backfills
and page-singleton creation, and roll back all effects on any failed
statement, stale guard, or concurrent conflict. It SHALL reuse the schema's
cascading model-key update for an explicit rename and the pending site-build
uniqueness rule for build coalescing. Content rewrites SHALL run after the
model identity update, renames before removals and removals before backfills.
Each rename, removal and backfill SHALL be a set-based update of the model's
snapshots and SHALL NOT change revisions, audit columns, or timestamps.

#### Scenario: Atomic rename retains attached content
- **WHEN** a fresh valid synchronization plan explicitly renames a populated
  page or collection model to an unused key of the same kind
- **THEN** the transaction commits the new model key and every attached entry
  under that key, with no intermediate visible state or inferred replacement

#### Scenario: Concurrent apply permits one winner
- **WHEN** two Node callers try to apply plans derived from the same persisted
  state and one commits a model change first
- **THEN** at most one transaction commits that change and the other returns a
  stale-plan failure without overwriting data or creating a second build request

#### Scenario: Statement failure preserves all synchronization state
- **WHEN** a SQLite statement fails after the adapter has started a
  synchronization transaction
- **THEN** content models, baselines, snapshots, blocks, media references,
  singleton entries, published-state version, and pending build outbox rows
  retain their pre-apply values

#### Scenario: Backfill and baseline commit together
- **WHEN** a fresh plan adds a defaulted field to a populated model
- **THEN** one transaction stores the new identity and baseline, writes the
  default into every draft and published snapshot lacking it, advances the
  published-state version once, and coalesces one build request

#### Scenario: Hinted rewrites commit together
- **WHEN** a fresh plan renames one populated field, removes one populated
  media field and disallows one used block type through hints
- **THEN** one transaction stores the new identity and baseline, moves and
  prunes the field values, deletes the blocks, moves or deletes the affected
  media references, advances the published-state version once, and coalesces
  one build request
