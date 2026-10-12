## ADDED Requirements

### Requirement: The editor preserves block envelopes it does not edit
Until the editor offers envelope controls, it SHALL keep every block's loaded
anchor, class name, hidden flag and settings through edits, reordering,
discard, conflict reload and saves, and SHALL send them back unchanged with
every save. A block added in the editor SHALL start visible, without an anchor
or class name, with the default of every setting its definition declares.
Duplicating a block SHALL copy its class name, hidden flag and settings and
SHALL leave out its anchor, so the copy never repeats an anchor. Validation
issues reported for a block's anchor, class name, hidden flag or settings
SHALL be shown at that block and in the validation summary.

#### Scenario: Saving keeps envelopes set through the API
- **WHEN** an editor loads a draft whose block has anchor `pricing`,
  `hidden: true` and settings `{align: "center"}`, edits a field of that block
  and saves
- **THEN** the save request carries the same anchor, hidden flag and settings
  for the block

#### Scenario: A new block takes declared setting defaults
- **WHEN** an editor adds a block whose definition declares `align` with
  default `left`
- **THEN** the new block is visible with settings `{align: "left"}` and no
  anchor

#### Scenario: Duplicating a block drops its anchor
- **WHEN** an editor duplicates a block with anchor `pricing` and class name
  `wide`
- **THEN** the copy carries class name `wide` and no anchor, and the draft
  saves without an anchor conflict
