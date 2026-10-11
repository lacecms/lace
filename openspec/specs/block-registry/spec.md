# block-registry Specification

## Purpose

Defines portable versioned block definitions and registry behavior so Lace can
validate ordered block content and expose safe metadata to editors and clients.

## Requirements

### Requirement: Versioned portable block definitions
The system SHALL define a block with a stable type beginning with an ASCII
letter and containing only ASCII letters, digits, and hyphens, a positive
integer schema version, optional human-readable label and description, typed
field descriptors, an optional valid default field record, and optional data
migrations. A block definition SHALL be detached, deeply readonly data; it
SHALL expose a runtime validator for its fields and a detached serializable
metadata projection that contains no executable value. Defaults and present
values SHALL follow the same draft and publish field-validation rules as model
fields. A block field SHALL NOT declare a `renamedFrom` hint, because changes
to stored block data are expressed through block versions, not field hints.

Migrations SHALL be declared as a map from a target version to a synchronous
function that receives the block data of the previous version and returns the
data of the target version. The target versions SHALL form one contiguous
range of integers that ends at the block's version and starts no lower than 2;
a version 1 block SHALL declare no migrations, and every value SHALL be a
function. Migrations SHALL be retained only on the runtime definition: they
SHALL NOT appear in the metadata projection, the canonical model structure,
the structural or projection hash, or any public projection. Migrating stored
data SHALL compose the declared functions in ascending order from the version
after the stored version to the block's version. Composition SHALL fail as a
missing step when the stored version is below the range the declared
migrations reach. It SHALL fail when a function throws or returns a value that
is not a JSON object. Each function SHALL receive a detached copy of its input,
so it cannot alter stored data.

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

#### Scenario: Define a block with a migration chain
- **WHEN** a block of version 3 declares migrations for versions 2 and 3
- **THEN** definition succeeds, the metadata projection, structure and hashes
  equal those of the same block without migrations, and migrating version 1
  data applies the version 2 function and then the version 3 function

#### Scenario: Reject a malformed migration map
- **WHEN** a block declares a migration for a version above its own version,
  for version 1 or below, a gap such as versions 2 and 4 for a version 4
  block, a range that does not end at its version, a non-integer key, or a
  value that is not a function
- **THEN** definition fails before application startup with an error naming
  the offending migration key

#### Scenario: Composition fails for an unreachable stored version
- **WHEN** a version 3 block declares only the migration to version 3 and
  stored data of version 1 is migrated
- **THEN** composition fails as a missing step naming versions 1 and 3

#### Scenario: Migration output must be a JSON object
- **WHEN** a migration throws, returns an array, a promise, or a value
  containing a function or a non-finite number
- **THEN** composition fails naming the step's target version and the stored
  input is unchanged

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
