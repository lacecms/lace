## ADDED Requirements

### Requirement: Entry lifecycle use cases carry the block envelope
Create and save SHALL accept each block's optional envelope values as part of
the complete editable draft and store the normalized envelope that aggregate
validation returns. An omitted envelope value SHALL take its default (no
anchor, no class name, visible, declared setting defaults), so a client that
does not send envelope values keeps working, but a save still replaces the
whole draft, including the envelope. Publication SHALL validate the stored
draft again in publish mode, where hidden blocks are validated in draft mode,
and the publication idempotency fingerprint SHALL cover the envelope. Media
fields of a hidden block SHALL remain draft media references: they SHALL count
toward the 200-reference limit and SHALL require `active` media. Revert SHALL
restore the published envelopes. Duplicate SHALL copy every source block's
envelope, including its anchor, under new block keys. Envelope validation
failures SHALL be content validation issues under the block's path, with no
repository write.

#### Scenario: Publish an entry with an unfinished hidden block
- **WHEN** an editor publishes a draft whose only incomplete block is hidden
- **THEN** publication succeeds, and the published snapshot stores the hidden
  block with its incomplete data

#### Scenario: Unhiding an incomplete block blocks publication
- **WHEN** the editor saves the same draft with the block visible and
  publishes it
- **THEN** publication fails with `missing_required_field` under that block's
  data path, and public content is unchanged

#### Scenario: Omitted envelope values default
- **WHEN** a client saves a block with only `key`, `type`, `schemaVersion`,
  `position` and `data` for a block that declares settings
- **THEN** the stored block is visible, has no anchor or class name, and
  carries the declared setting defaults

#### Scenario: A duplicate anchor is refused before writing
- **WHEN** a save submits two blocks with the anchor `faq`
- **THEN** it fails with `422` issue `duplicate_block_anchor` and the draft
  revision is unchanged

#### Scenario: Hidden-block media stays referenced
- **WHEN** a draft holds a hidden image block that references `media-1`
- **THEN** the draft's media references include `media-1` from that block's
  key, and the save fails if `media-1` is not `active`

#### Scenario: Duplicate and revert copy envelopes
- **WHEN** an entry with an anchored hidden block is duplicated, and another
  entry whose draft changed a published block's settings is reverted
- **THEN** the copy holds the anchored hidden block under a new key, and the
  reverted draft holds the published settings
