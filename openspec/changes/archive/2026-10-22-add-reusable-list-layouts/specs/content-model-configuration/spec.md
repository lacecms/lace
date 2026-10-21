## ADDED Requirements

### Requirement: Choice presentation changes only descriptor projection identity
Select `presentation` metadata SHALL contribute to projection identity and SHALL
be excluded from structural identity only at descriptor positions, recursively
through model fields, block data and declared scalar settings. Changing labels,
descriptions, diagrams or adding/removing the presentation SHALL NOT require a
model/block version increase, content rewrite or publication/build mutation.
Changing the option set or default SHALL retain existing structural rules.
Unopted configurations SHALL retain their previous projections and hashes.

Synchronization SHALL classify presentation-only changes as display changes and
apply existing baseline/concurrency guards. It SHALL preserve draft/published
values, revisions, audit fields, media references and published version.
Content and default-value keys literally named `presentation`, `choices` or
`diagram` SHALL remain structural content rather than being recursively removed.

#### Scenario: Change schematic thumbnails on a populated model
- **WHEN** configuration changes only a nested select's card diagram and its label
- **THEN** the projection hash changes, structure hash and versions remain the
  same, and synchronization updates metadata without rewriting content or builds

#### Scenario: Preserve identically named content keys
- **WHEN** a group default contains a key named `presentation` and its value changes
- **THEN** the change remains structural even when a sibling descriptor has
  presentation metadata

#### Scenario: Stale presentation-only synchronization
- **WHEN** a presentation-only plan is applied after its synchronization baseline
  has changed
- **THEN** the existing concurrency guard rejects the stale plan without partial writes
