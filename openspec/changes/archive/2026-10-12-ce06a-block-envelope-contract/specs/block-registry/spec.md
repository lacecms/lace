## MODIFIED Requirements

### Requirement: Versioned portable block definitions
The system SHALL define a block with a stable type beginning with an ASCII
letter and containing only ASCII letters, digits, and hyphens, a positive
integer schema version, optional human-readable label and description, typed
field descriptors, an optional valid default field record, optional declared
settings, and optional migrations. A block definition SHALL be detached, deeply
readonly data; it SHALL expose a runtime validator for its fields and a
detached serializable metadata projection that contains no executable value.
Defaults and present values SHALL follow the same draft and publish
field-validation rules as model fields. A block field SHALL NOT declare a
`renamedFrom` hint, because changes to stored block data are expressed through
block versions, not field hints.

Settings SHALL be declared as a map from a field key to a `select`, `boolean`,
`number` or `text` field descriptor that declares a `defaultValue`; any other
field type, a setting without a default, a `renamedFrom` hint or a malformed
key SHALL fail the definition. Declared settings SHALL appear in the metadata
projection under `settings`, and so in the canonical model structure and both
hashes. A block that declares no settings, or an empty settings map, SHALL
produce metadata without a `settings` key, so its structure and hashes equal
those of the same block before settings existed.

Migrations SHALL be declared as a map from a target version to a synchronous
function that receives `{data, settings}` of the previous version and returns
`{data, settings?}` of the target version, where a result without `settings`
keeps the input settings. The target versions SHALL form one contiguous range
of integers that ends at the block's version and starts no lower than 2; a
version 1 block SHALL declare no migrations, and every value SHALL be a
function. Migrations SHALL be retained only on the runtime definition: they
SHALL NOT appear in the metadata projection, the canonical model structure,
the structural or projection hash, or any public projection. Migrating stored
data SHALL compose the declared functions in ascending order from the version
after the stored version to the block's version. Composition SHALL fail as a
missing step when the stored version is below the range the declared
migrations reach. It SHALL fail when a function throws or returns a value that
is not an object holding a JSON object `data`, an optional JSON object
`settings` and no other key. Each function SHALL receive a detached copy of
its input, so it cannot alter stored data.

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

#### Scenario: Define a block with settings
- **WHEN** a block declares an `align` select setting with choices `left` and
  `center` and default `left`, and a `boxed` boolean setting with default
  `false`
- **THEN** definition succeeds and its metadata carries both settings with
  their defaults under `settings`

#### Scenario: Reject an unsupported or undefaulted setting
- **WHEN** a block declares a `media`, `richText`, `textarea`, `url`, `date`
  or `datetime` setting, a setting without `defaultValue`, or a setting that
  declares `renamedFrom`
- **THEN** definition fails before application startup with an error naming
  the setting

#### Scenario: Blocks without settings keep their identity
- **WHEN** a block declares no settings or `settings: {}`
- **THEN** its metadata has no `settings` key and its structural and
  projection hashes equal the values computed before settings existed

#### Scenario: Settings are structural
- **WHEN** two otherwise identical configurations differ only in a block
  setting's choices or default
- **THEN** their structural hashes differ

#### Scenario: Define a block with a migration chain
- **WHEN** a block of version 3 declares migrations for versions 2 and 3
- **THEN** definition succeeds, the metadata projection, structure and hashes
  equal those of the same block without migrations, and migrating version 1
  data and settings applies the version 2 function and then the version 3
  function

#### Scenario: A migration that leaves out settings keeps them
- **WHEN** a migration returns only `{data}` for a block stored with settings
  `{align: "center"}`
- **THEN** the composed result carries the migrated data and settings
  `{align: "center"}`

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
- **WHEN** a migration throws, returns an array, a promise, an object without
  `data`, an object with another key besides `data` and `settings`, or a value
  containing a function or a non-finite number
- **THEN** composition fails naming the step's target version and the stored
  input is unchanged

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

Each block SHALL also accept the optional envelope values `anchor`,
`className`, `hidden` and `settings`:

- `anchor` SHALL be a string that starts with a lowercase ASCII letter,
  continues with lowercase ASCII letters, digits and hyphens, and has at most
  64 characters. It SHALL be unique among the anchors of the aggregate,
  including hidden blocks. A malformed anchor SHALL fail with
  `invalid_block_anchor` and a repeated anchor with `duplicate_block_anchor`,
  both at the block's `anchor` path.
- `className` SHALL be a string of 1–16 whitespace-separated class tokens,
  each 1–64 characters that start with an ASCII letter, `_` or `-` and contain
  only ASCII letters, digits and `_ - : / . % # [ ]`. It SHALL be normalized
  by dropping repeated tokens and joining the rest with single spaces. The
  normalized value SHALL have at most 256 characters. A blank string, a
  malformed token or a value that is too long or has too many tokens SHALL
  fail with `invalid_block_class_name` at the block's `className` path.
- `hidden` SHALL be a boolean, defaulting to `false`; another value SHALL fail
  with `invalid_block_hidden`.
- `settings` SHALL be an object, defaulting to `{}`, validated against the
  block's declared settings with their defaults applied. Another value SHALL
  fail with `invalid_block_settings`. An undeclared key SHALL fail with
  `unknown_field`, and an invalid value SHALL fail with its field validation
  code, at the setting's path under `settings`.

The normalized block SHALL carry `hidden` and the complete settings record,
and carry `anchor` and `className` only when set. A hidden block SHALL be
validated in draft mode even when the aggregate is validated in publish mode;
its envelope, type, version, key and size checks SHALL stay unchanged.

#### Scenario: Validate a complete draft aggregate
- **WHEN** a model permits a registered block and a draft supplies one or more
ordered blocks with unique keys and valid present data
- **THEN** validation returns the normalized block data including applicable
  defaults, `hidden: false` and the block's default settings

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

#### Scenario: Accept and reject anchors
- **WHEN** blocks carry the anchors `pricing`, `faq-2`, `Pricing`, `2nd`,
  `-top`, an empty string and a 65-character value
- **THEN** `pricing` and `faq-2` are accepted and every other value fails with
  `invalid_block_anchor` at that block's `anchor` path

#### Scenario: Reject a duplicate anchor
- **WHEN** a visible block and a hidden block of the same aggregate both carry
  the anchor `pricing`
- **THEN** validation fails with `duplicate_block_anchor` at the second
  block's `anchor` path

#### Scenario: Normalize a class name
- **WHEN** a block carries the class name `"  hero--wide  md:w-1/2 hero--wide "`
- **THEN** the normalized block carries `className` `"hero--wide md:w-1/2"`

#### Scenario: Reject a class name
- **WHEN** a block carries a class name that is blank, contains `"` or `<`,
  starts a token with a digit, has 17 tokens or exceeds 256 characters
- **THEN** validation fails with `invalid_block_class_name` at that block's
  `className` path

#### Scenario: Apply and validate settings
- **WHEN** a block that declares `align` (default `left`) and `boxed` (default
  `false`) is submitted with settings `{boxed: true}`
- **THEN** the normalized block carries settings `{align: "left", boxed: true}`

#### Scenario: Reject undeclared or invalid settings
- **WHEN** a block is submitted with settings `{width: 3}` for a block that
  declares no `width`, or with `{align: "right"}` outside the declared choices
- **THEN** validation fails at `settings/width` with `unknown_field`, or at
  `settings/align` with the select validation code

#### Scenario: A hidden incomplete block passes publish validation
- **WHEN** an aggregate is validated in publish mode and a hidden block omits
  a field its definition requires
- **THEN** validation succeeds, and the same block when visible fails with
  `missing_required_field`
