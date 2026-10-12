## ADDED Requirements

### Requirement: Blocks carry a presentation envelope
A block of a draft or published snapshot SHALL carry, besides its key, type,
schema version, position and data, an envelope of presentation values: an
optional `anchor`, an optional `className`, a boolean `hidden` and a `settings`
object. The domain SHALL treat the envelope as part of the snapshot value: it
SHALL copy the envelope with the block wherever a snapshot is cloned,
published, reverted or duplicated, and a block built without envelope values
SHALL be completed as visible with no anchor or class name and `{}` settings.
Envelope values SHALL NOT affect block ordering, key or position rules.

#### Scenario: Publication copies the envelope
- **WHEN** a draft whose block carries anchor `pricing`, class name `wide`,
  `hidden: true` and settings `{align: "center"}` is published
- **THEN** the published snapshot's block carries the same four values

#### Scenario: A legacy block value is completed
- **WHEN** a snapshot is built from a block that carries no envelope values
- **THEN** the block reads as visible with `{}` settings and without an anchor
  or class name
