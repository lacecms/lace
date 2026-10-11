## MODIFIED Requirements

### Requirement: Block registry identity and starter blocks
The system SHALL create a registry of block definitions and reject duplicate
block types or duplicate type/schema-version registrations. The registry SHALL
ship the `hero`, `richText`, `image`, `quote`, and `cta` built-ins, defined only
through the public block and field DSL. `hero` SHALL contain optional eyebrow,
required heading, optional rich-text body, optional media, and optional
primary-action label and URL; `richText` SHALL contain required rich-text data;
`image` SHALL contain required media plus optional alt text and optional
caption, where the block's alt text overrides the media item's alt text;
`quote` SHALL contain required quote text plus optional attribution; and `cta`
SHALL contain required heading, action label, and action URL plus optional body.
`image` SHALL be at definition version 2 and SHALL declare a migration to
version 2 that returns the stored version 1 data unchanged, because version 2
only relaxes the alt text from required to optional. The other built-ins SHALL
stay at version 1.
Each built-in SHALL carry a non-empty human-readable label and a non-empty
one-sentence description, and its serializable metadata projection SHALL
include both. A block's label and description SHALL be display metadata: they
SHALL contribute to the configuration projection hash and SHALL NOT contribute
to the structural hash.

#### Scenario: Resolve each built-in by type
- **WHEN** the starter block registry is created
- **THEN** it resolves exactly one versioned definition each for `hero`,
  `richText`, `image`, `quote`, and `cta` with serializable field metadata,
  a label, and a description

#### Scenario: Image alt text is optional
- **WHEN** `image` block data holds a media identifier and no alt text is
  validated in publish mode
- **THEN** the data is valid, and data that omits the media identifier is
  still rejected

#### Scenario: Version 1 image blocks migrate unchanged
- **WHEN** a version 1 `image` block with media, alt text and caption is
  migrated to the configured version 2
- **THEN** the migrated data equals the stored data and only the block's
  schema version changes

#### Scenario: Reject a duplicate registry registration
- **WHEN** configuration supplies two definitions with the same block type and
schema version, or attempts to register a duplicate type
- **THEN** registry creation fails before application startup

#### Scenario: Block display metadata stays out of structural identity
- **WHEN** two otherwise identical configurations differ only in a block's
  label or description
- **THEN** their normalized configurations have different projection hashes
  and the same structural hash
