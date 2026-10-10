# block-registry Specification

## Purpose

Defines portable versioned block definitions and registry behavior so Lace can
validate ordered block content and expose safe metadata to editors and clients.

## Requirements

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

### Requirement: Block registry identity and starter blocks
The system SHALL create a registry of block definitions and reject duplicate
block types or duplicate type/schema-version registrations. The registry SHALL
ship the `hero`, `richText`, `image`, `quote`, and `cta` built-ins, defined only
through the public block and field DSL. `hero` SHALL contain optional eyebrow,
required heading, optional rich-text body, optional media, and optional
primary-action label and URL; `richText` SHALL contain required rich-text data;
`image` SHALL contain required media and alt text plus optional caption;
`quote` SHALL contain required quote text plus optional attribution; and `cta`
SHALL contain required heading, action label, and action URL plus optional body.
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

#### Scenario: Reject a duplicate registry registration
- **WHEN** configuration supplies two definitions with the same block type and
schema version, or attempts to register a duplicate type
- **THEN** registry creation fails before application startup

#### Scenario: Block display metadata stays out of structural identity
- **WHEN** two otherwise identical configurations differ only in a block's
  label or description
- **THEN** their normalized configurations have different projection hashes
  and the same structural hash

### Requirement: Ordered block aggregate validation
The system SHALL validate a complete flat ordered block aggregate against a
model's allowed block types and a registry in draft or publish mode. Each block
SHALL have a unique stable block key, accepting canonical ULID-format keys as
well as existing named stable keys, registered block type, exact current
schema version, and JSON data validated by that block's fields; it SHALL reject
unknown properties, duplicate keys, malformed keys, disallowed or unregistered
types, stale versions, malformed data, oversized data, and more than the shared
top-level block limit. Draft mode SHALL permit fields required by a block to be
absent unless their defaults supply them; publish mode SHALL require them.

#### Scenario: Validate a complete draft aggregate
- **WHEN** a model permits a registered block and a draft supplies one or more
ordered blocks with unique keys and valid present data
- **THEN** validation returns the normalized block data including applicable defaults

#### Scenario: Accept a browser-generated stable key
- **WHEN** a draft block has a canonical ULID-format key, including one beginning with a digit
- **THEN** aggregate validation accepts and retains that key through draft and publish validation

#### Scenario: Reject a stale or disallowed block
- **WHEN** an aggregate contains a block type absent from the model's allowed
types, a registry-missing type, or a schema version other than its registry definition
- **THEN** validation fails at that block's deterministic path

#### Scenario: Reject malformed or duplicate keys
- **WHEN** an aggregate contains an invalid stable key or repeats a block key
- **THEN** validation fails at that block's key path
