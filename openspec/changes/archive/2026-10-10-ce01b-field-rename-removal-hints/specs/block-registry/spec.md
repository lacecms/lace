## MODIFIED Requirements

### Requirement: Versioned portable block definitions
The system SHALL define a block with a stable type beginning with an ASCII
letter and containing only ASCII letters, digits, and hyphens, a positive
integer schema version, optional human-readable label and description, typed
field descriptors, and an optional valid default field record. A block
definition SHALL be detached, deeply readonly plain data; it SHALL expose a
runtime validator for its fields and a detached serializable metadata projection
that contains no executable value. Defaults and present values SHALL follow the
same draft and publish field-validation rules as model fields. A block field
SHALL NOT declare a `renamedFrom` hint, because changes to stored block data
are expressed through block versions, not field hints.

#### Scenario: Define a serializable block
- **WHEN** configuration defines a valid versioned block using public field descriptors
- **THEN** it receives detached readonly metadata, a runtime validator, and any
  validated default field data

#### Scenario: Reject an invalid block definition
- **WHEN** a block type or version is unstable, metadata is non-serializable,
  a field map is malformed, or default data violates its fields
- **THEN** definition fails before application startup

#### Scenario: Reject a rename hint in a block field
- **WHEN** a block definition contains a field that declares `renamedFrom`
- **THEN** definition fails before application startup with an error naming
  the field
