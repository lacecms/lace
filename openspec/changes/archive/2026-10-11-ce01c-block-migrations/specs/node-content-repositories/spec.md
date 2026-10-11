## ADDED Requirements

### Requirement: Node block migrations read bounded entry pages and write guarded units
The Node persistence adapter SHALL provide the portable block-migration entry
scan over SQLite with read-only statements. It SHALL also provide the portable
block-migration write. The write SHALL apply each supplied entry unit in one
SQLite transaction and SHALL:

- verify the unit's guards (snapshot revisions, current draft and published
  snapshot identity, stored block schema versions, and the draft revision when
  the published revision follows it);
- update each migrated block's schema version, data and update time in place;
- delete and reinsert the migrated blocks' media references, accepting only
  active media;
- update the snapshot revisions, audit actor and update times as the
  schema-evolution capability defines.

A failed guard or statement SHALL roll back that unit and SHALL report a stale
migration without attempting later units. Units committed earlier SHALL remain
committed. The write SHALL NOT change content models, baselines, entries,
published routes, published state or outbox rows.

#### Scenario: Unit commits blocks, references and revisions together
- **WHEN** a unit migrates two blocks of a draft and the same blocks of its
  in-sync published snapshot, one block moving a media ID to a new field
- **THEN** one transaction stores both snapshots' migrated blocks and
  revisions and the moved media references, and every other row is unchanged

#### Scenario: Guard failure rolls back the unit
- **WHEN** a draft's revision changed after the migration scan read it
- **THEN** the unit's transaction writes nothing and the adapter reports a
  stale migration

#### Scenario: Repeated write is a no-op
- **WHEN** the same unit is supplied again after it committed
- **THEN** its guard fails on the changed revision and no row changes
