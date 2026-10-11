## MODIFIED Requirements

### Requirement: Node configuration synchronization applies fresh plans atomically
The Node persistence adapter SHALL provide the portable configuration
synchronization read, bounded snapshot scan, and guarded apply operations over
SQLite. Its apply operation SHALL re-check the supplied plan against stored
model identity, baseline presence, content cardinality and snapshot
fingerprints within one SQLite transaction, perform all allowed model identity
changes, structure baseline writes, default backfills and page-singleton
creation, and roll back all effects on any failed statement, stale guard, or
concurrent conflict. It SHALL reuse the schema's cascading model-key update for
an explicit rename and the pending site-build uniqueness rule for build
coalescing. A backfill SHALL be a set-based update of the model's current
snapshots that lack the field key and SHALL NOT change revisions, audit
columns, or timestamps.

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
- **THEN** content models, baselines, snapshots, singleton entries,
  published-state version, and pending build outbox rows retain their
  pre-apply values

#### Scenario: Backfill and baseline commit together
- **WHEN** a fresh plan adds a defaulted field to a populated model
- **THEN** one transaction stores the new identity and baseline, writes the
  default into every draft and published snapshot lacking it, advances the
  published-state version once, and coalesces one build request
