# block-registry Specification

## Purpose

Defines portable versioned block definitions and registry behavior so Lace can
validate ordered block content and expose safe metadata to editors and clients.

## Requirements

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

### Requirement: Block registry identity and starter blocks
The system SHALL create a registry of block definitions and reject duplicate
block types or duplicate type/schema-version registrations. The registry SHALL
ship the `hero`, `richText`, `image`, `quote`, `cta`, `gallery` and
`navigation` built-ins, defined only through the public block and field DSL.
`hero` SHALL contain optional eyebrow,
required heading, optional rich-text body, optional media, and optional
primary-action label and URL; `richText` SHALL contain required rich-text data;
`image` SHALL contain required media plus optional alt text, optional
caption and an optional URL `link`, where the block's alt text overrides the
media item's alt text;
`quote` SHALL contain required quote text plus optional attribution; and `cta`
SHALL contain required heading, action label, and action URL plus optional body.
`gallery` SHALL contain an optional text `title` and an `images` list whose
default is an empty list, with a publication minimum of 1 and a maximum of 50
items, each item a group of required `media`, optional text `alt` that
overrides the media item's alt text, optional text `caption` and an optional
URL `link`; the list's item label SHALL be `caption`. Each `link` field SHALL
be labelled "Link" with a description stating that a selected image opens the
link instead of the full-screen view. `navigation` SHALL contain an optional text
`name` and a `links` list whose default is an empty list, with a publication
minimum of 1 and a maximum of 20 items, each item a group of a required text
`label`, an optional `url` and an optional `children` list of at most 20 items,
each child a group of a required text `label` and a required `url`; both link
lists SHALL use `label` as their item label. URL values SHALL follow the
existing safe URL rules.
`image` SHALL be at definition version 4 and `gallery` at definition version
3. Both SHALL declare one boolean setting `lightbox` labelled "Open full
screen" with a description and the default `false`. `image` SHALL declare
migrations to versions 2, 3 and 4, and `gallery` migrations to versions 2 and
3, each returning the stored data unchanged and no settings, so migrated
blocks keep their data and settings and receive the setting's default when
they had none. `navigation` SHALL
be at definition version 1. The other built-ins SHALL stay at version 1 and
SHALL declare no settings.
Each built-in SHALL carry a non-empty human-readable label and a non-empty
one-sentence description, and its serializable metadata projection SHALL
include both. A block's label and description SHALL be display metadata: they
SHALL contribute to the configuration projection hash and SHALL NOT contribute
to the structural hash. Adding built-ins SHALL NOT change the normalized
configuration or hashes of a configuration that does not register them.

#### Scenario: Resolve each built-in by type
- **WHEN** the starter block registry is created
- **THEN** it resolves exactly one versioned definition each for `hero`,
  `richText`, `image`, `quote`, `cta`, `gallery` and `navigation` with
  serializable field metadata, a label, and a description

#### Scenario: Image alt text is optional
- **WHEN** `image` block data holds a media identifier and no alt text is
  validated in publish mode
- **THEN** the data is valid, and data that omits the media identifier is
  still rejected

#### Scenario: Version 1 image blocks migrate unchanged
- **WHEN** a version 1 `image` block with media, alt text and caption is
  migrated to the configured version 4
- **THEN** the migrated data equals the stored data, its settings are
  `{ lightbox: false }` after defaults, and only the block's schema version
  changes

#### Scenario: Version 1 gallery blocks migrate unchanged
- **WHEN** a version 1 `gallery` block is migrated to the configured version 3
- **THEN** the migrated data equals the stored data and its settings are
  `{ lightbox: false }` after defaults

#### Scenario: Version 3 image blocks keep their lightbox setting
- **WHEN** a version 3 `image` block with settings `{ lightbox: true }` is
  migrated to version 4
- **THEN** its data and settings are unchanged and it has no `link`

#### Scenario: Image links follow the safe URL rules
- **WHEN** `image` data with `link` `/work/kitchen` and a gallery item with
  `link` `https://example.com/` are validated in publish mode
- **THEN** both are valid, data without `link` is valid, and a `link`
  `javascript:alert(1)` fails at the `link` path of the block or of that item

#### Scenario: The lightbox setting is validated
- **WHEN** `image` settings `{ lightbox: true }` and `{}` are validated
- **THEN** they parse as `{ lightbox: true }` and `{ lightbox: false }`, and
  settings `{ lightbox: "yes" }` or `{ zoom: true }` are rejected

#### Scenario: Image metadata exposes the setting
- **WHEN** the metadata projection of `image` or `gallery` is read
- **THEN** it lists the boolean `lightbox` setting with its label,
  description and default `false`

#### Scenario: A new gallery is a valid draft but not publishable
- **WHEN** `gallery` data `{}` is normalized
- **THEN** it becomes `{ images: [] }`, passes draft validation, and fails
  publish validation at `/images` for the list minimum

#### Scenario: Gallery item without media
- **WHEN** a gallery item omits `media` and the data is validated in publish
  mode
- **THEN** validation fails at that item's `media` path, while draft
  validation accepts it

#### Scenario: Gallery over its maximum
- **WHEN** a gallery's `images` list holds 51 items
- **THEN** both draft and publish validation fail at `/images`

#### Scenario: Navigation with one submenu level
- **WHEN** `navigation` data has a link `{ label: "Docs", children: [{ label:
  "Guide", url: "/guide" }] }` without its own URL
- **THEN** it passes publish validation, and a child without `url` or a
  child URL `javascript:alert(1)` fails at that child's `url` path

#### Scenario: Built-in navigation fits the entry list budget
- **WHEN** a navigation block holds 20 links with 20 children each
- **THEN** it counts 420 list elements and is accepted, while a 21st child in
  one link fails at that link's `children` path

#### Scenario: Reject a duplicate registry registration
- **WHEN** configuration supplies two definitions with the same block type and
schema version, or attempts to register a duplicate type
- **THEN** registry creation fails before application startup

#### Scenario: Block display metadata stays out of structural identity
- **WHEN** two otherwise identical configurations differ only in a block's
  label or description
- **THEN** their normalized configurations have different projection hashes
  and the same structural hash

#### Scenario: Existing configurations keep their hashes
- **WHEN** a configuration registering only `hero`, `richText`, `quote`, `cta`
  and `navigation` is normalized after the `image` and `gallery` versions
  changed
- **THEN** its structural and projection hashes equal the pinned values from
  before the change

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

### Requirement: Built-in image fields declare media first
The built-in `image` block SHALL declare its fields in the order `media`,
`alt`, `caption`, `link`, and the `gallery` list item group SHALL declare its
fields in the same order, so generic editors that follow declaration order
present the image before the values that override or extend it. Field
declaration order SHALL be presentation only: it SHALL NOT change field keys,
paths, constraints, defaults, required status, definition versions,
migrations, structural hashes or projection hashes, and stored block data
SHALL remain valid without migration.

#### Scenario: Image fields are projected media first
- **WHEN** the starter registry's `image` block and `gallery` block metadata
  are projected for the admin
- **THEN** the first key of the `image` fields and of the gallery item group's
  fields is `media`, followed by `alt`, `caption` and `link`

#### Scenario: Reordering keeps identity and versions
- **WHEN** a configuration registering `image` and `gallery` is normalized
  with the media-first declaration order and compared with the same
  configuration declared in the earlier alphabetical order
- **THEN** both blocks keep versions 4 and 3, and every model and
  whole-configuration structural and projection hash is equal

#### Scenario: Existing data stays valid
- **WHEN** a saved `image` block or gallery item from before the reordering is
  loaded and validated in draft and publish modes
- **THEN** it validates exactly as before and no migration runs
