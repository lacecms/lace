## ADDED Requirements

### Requirement: Composite block parsing shares publication validation
The render core SHALL parse nested block values with the content package's
publication rules, defaults, per-list and standalone block list budget and
return nested inferred component data. Invalid descendants SHALL produce
`invalid_block_data` with the existing context/cause and exact key/index path.
Nested media SHALL use the existing image describer. Hidden blocks SHALL still
be skipped before resolution and validation. Render SHALL not migrate data or
claim to validate an unseen complete snapshot's fields or hidden blocks.

#### Scenario: Nested component data
- **WHEN** a block has a list of groups with child defaults and a literal-select child
- **THEN** parsing applies those defaults and component props retain the inferred object array and literal union

#### Scenario: Leaf failure matches the CMS
- **WHEN** a visible block has an invalid URL at links item index 1
- **THEN** CMS and render validation reject it and render reports `links`, numeric index 1 and the URL child key in its field path

#### Scenario: Hidden composites are skipped
- **WHEN** a hidden block has incomplete composite data or an unknown block type
- **THEN** preparation skips it before parsing and produces no component for it
