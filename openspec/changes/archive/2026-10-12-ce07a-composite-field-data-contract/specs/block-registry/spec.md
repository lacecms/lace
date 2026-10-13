## ADDED Requirements

### Requirement: Block composites are data without nested block identity
Project-defined block data SHALL accept group/list descriptors with the same
inference, finite schema bounds and draft/publish rules as model fields. List
items SHALL have no block identity, schema version, route or lifecycle of their
own. Ordered top-level blocks SHALL stay flat. Composite settings SHALL be
rejected; the text, number, boolean and select settings allowlist with required
defaults SHALL remain unchanged. Block rename hints SHALL be rejected at every
descriptor depth; data changes SHALL continue to use versioned migrations.

#### Scenario: Custom block list
- **WHEN** a custom block declares an images list of groups holding media and caption
- **THEN** its metadata and typed data represent one block with an array of objects

#### Scenario: Composite setting is refused
- **WHEN** a block declares a group or list under settings, even with a valid default
- **THEN** definition fails before startup

#### Scenario: Nested block rename hint is refused
- **WHEN** a block's group child declares renamedFrom
- **THEN** definition fails and directs the operator to block versions
