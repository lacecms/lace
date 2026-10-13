# Field Descriptors Specification

## Purpose

Defines the portable, code-first field descriptors that Lace models and blocks
use to derive static value types and safe admin-form metadata from one source.

## Requirements

### Requirement: Initial portable field descriptor set

The content package SHALL expose a discriminated `FieldDefinition` contract and
builder for each MVP field kind: text, textarea, rich text, number, boolean,
date, datetime, select, URL, and media. Every completed definition SHALL retain
its kind and normalized common options (`label`, `description`, `required`, and
`defaultValue`) in a portable representation. Builders SHALL preserve the
corresponding TypeScript value type, including the literal union of select
choices where statically known.

#### Scenario: Define each MVP field kind

- **WHEN** configuration code creates one descriptor through each supported
  `field.*` builder
- **THEN** each result is distinguishable by its field kind and carries the
  field kind's inferred value type

#### Scenario: Infer a select value from choices

- **WHEN** configuration code defines a select field with literal choices
- **THEN** its inferred value type accepts those choices and rejects other
  values at compile time

### Requirement: Serializable normalized configuration

The content package SHALL accept only JSON-serializable builder option values
and SHALL return a detached, normalized field definition. The returned
definition and its derived form metadata SHALL survive a JSON stringify/parse
round trip without executable values, runtime schemas, symbols, cyclic
references, non-finite numbers, or host-specific objects.

#### Scenario: Project metadata for an admin form

- **WHEN** a caller derives form metadata from a valid field definition
- **THEN** the metadata exposes the field kind, normalized common options, and
  applicable type-specific options using JSON data only

#### Scenario: Reject a non-portable option value

- **WHEN** a builder receives an option graph containing a function, symbol,
  bigint, cyclic reference, non-finite number, or non-plain object
- **THEN** configuration normalization fails with a descriptive error before a
  field definition is returned

### Requirement: Field-specific option consistency

The content package SHALL support string length bounds for text and textarea,
numeric lower and upper bounds for number, and a non-empty set of unique string
choices for select. It SHALL reject malformed option types, a lower bound that
exceeds an upper bound, duplicate select choices, and a default value that does
not conform to the same field kind and declared constraints.

#### Scenario: Normalize valid constrained options

- **WHEN** a caller supplies valid common and type-specific options with a
  conforming default value
- **THEN** the builder returns a normalized definition and metadata containing
  those options

#### Scenario: Reject contradictory constraints

- **WHEN** a text or textarea field has a minimum length above its maximum
  length, or a number field has a minimum above its maximum
- **THEN** configuration normalization fails before the definition is returned

#### Scenario: Reject an invalid select default

- **WHEN** a select field's default is absent from its declared choices
- **THEN** configuration normalization fails before the definition is returned

### Requirement: Default-value compatibility

The content package SHALL validate every supplied default value against the
field's current descriptor contract during normalization. A rich-text default
SHALL be a safe shared Tiptap JSON document permitted by the rich-text document
contract, including H4, rules, plain code and the restricted optional link
attributes. The same shared document validator SHALL govern defaults and
submitted values at every composite depth. For descriptor normalization, a date, datetime, URL, and media
default SHALL be a string; text and textarea defaults SHALL observe their
length bounds; numbers SHALL be finite and observe numeric bounds; booleans and
selects SHALL match their declared values. Semantic validation of submitted
date, datetime, URL, and media values SHALL remain the responsibility of
runtime content validation.

#### Scenario: Reject a default with the wrong value kind

- **WHEN** a caller supplies a default whose runtime kind does not match its
  field descriptor
- **THEN** configuration normalization fails and identifies the invalid default

#### Scenario: Reject an unsafe rich-text default

- **WHEN** a caller supplies a rich-text default containing malformed document
  structure, a disallowed node, mark, or attribute, or an unsafe link URL
- **THEN** configuration normalization fails and identifies the invalid default

#### Scenario: Preserve a valid rich-text default as portable data

- **WHEN** a caller supplies a safe rich-text document default
- **THEN** the descriptor retains a detached JSON-serializable copy of that
  document

#### Scenario: Expanded nested default
- **WHEN** a rich-text field in a group or list declares a valid expanded document default
- **THEN** normalization retains a detached portable copy and subsequent validation uses the same document rules

#### Scenario: Unsafe expanded default
- **WHEN** a rich-text default supplies a code language, an unsupported target or rel token, or an unsafe link URL
- **THEN** normalization rejects the default

### Requirement: Field rename hint option
Every field builder SHALL accept an optional `renamedFrom` option naming the
former key of the field. The value SHALL be a valid field key: an ASCII letter
followed by ASCII letters or digits. The builder SHALL reject any other value
and SHALL keep a valid value on the returned definition as temporary
synchronization metadata. The option SHALL NOT change the field's kind,
inferred value type, validation, or default-value rules.

#### Scenario: Accept a valid rename hint
- **WHEN** configuration code defines `field.text({ renamedFrom: "headline" })`
- **THEN** the returned definition is a text field that carries the former key
  `headline` and validates values exactly like a text field without the hint

#### Scenario: Reject a malformed rename hint
- **WHEN** a builder receives a `renamedFrom` value that is not a string or is
  not a valid field key
- **THEN** field definition fails with a descriptive error before a definition
  is returned

### Requirement: Typed portable composite field descriptors
The content package SHALL expose `field.group({fields, ...common})` and
`field.list({item, minItems?, maxItems?, ...common})`. Groups SHALL describe
plain objects with the existing field-key grammar; lists SHALL describe dense
ordered arrays of one scalar or group descriptor. Nested inference SHALL
preserve child keys, required/default property inference, arrays and literal
select choices. Definitions and metadata SHALL be detached immutable portable
JSON with exhaustive visitor handling for both new discriminants. Scalar
descriptor encodings and behavior SHALL remain unchanged.

#### Scenario: Infer nested values
- **WHEN** a list of groups declares a required `kind` select with choices `image` and `video` and an optional `caption` text
- **THEN** its inferred item has `kind: "image" | "video"` and optional string `caption`, and invalid choices or property types fail type checking

#### Scenario: Metadata is detached
- **WHEN** caller-owned child maps, list items or defaults are mutated after definition
- **THEN** the normalized composite and JSON-round-tripped metadata retain their original values

### Requirement: Composite definitions have bounded finite structure
Every configuration, block and metadata boundary SHALL reject malformed or
cyclic descriptors before use. A branch SHALL contain at most six group/list
containers and at most two consecutive groups. Lists SHALL reset consecutive
groups but not depth and SHALL NOT have a list as their immediate item.
Scalar leaves and root field maps SHALL not count as containers. Rich-text
nodes SHALL not count. Reusing an acyclic descriptor SHALL be allowed.
List bounds SHALL be integers with effective defaults 0 and 100 and satisfy
`0 ≤ minItems ≤ maxItems ≤ 100`. Composite defaults SHALL pass recursive draft
validation of present values, safety and maxima; missing required descendants
and publication minima SHALL be permitted. Invalid defaults, children, unknown
options and non-portable values SHALL fail with descriptive descriptor paths.
Named child descriptors SHALL accept sibling-key `renamedFrom` hints for model-field synchronization. A list item descriptor itself SHALL NOT carry `renamedFrom`, because items have no field key. Block definitions SHALL reject rename hints anywhere in data or settings; block changes use versioned migrations. Model normalization SHALL extract child hints recursively before producing public or runtime field metadata.

#### Scenario: Depth boundary
- **WHEN** alternating list/group branches have six and seven containers respectively
- **THEN** six is accepted and seven is rejected before startup

#### Scenario: Consecutive group boundary
- **WHEN** branches contain group/group, group/group/group, and group/group/list/group/group
- **THEN** the first and third are accepted and the second is rejected

#### Scenario: Direct list nesting
- **WHEN** a list declares another list as its item, including through forged JSON metadata
- **THEN** normalization fails at the item descriptor

#### Scenario: Invalid schemas and defaults
- **WHEN** descriptors contain a cycle, a malformed child, an accessor, a non-finite default, an unsafe nested URL, null list items, bounds 2/1, a fractional bound or maxItems 101
- **THEN** normalization rejects each case before application startup

#### Scenario: Partial default
- **WHEN** a group default is `{}` and the group has a required child without a default
- **THEN** definition succeeds as a draft starting value and publication still requires the child

#### Scenario: Named child rename
- **WHEN** a model list of groups defines `title: field.text({ renamedFrom: "headline" })` in its item fields
- **THEN** the definition is accepted and the hint affects synchronization only, without changing inferred values

#### Scenario: Unnamed item or block hint
- **WHEN** a list item descriptor itself carries `renamedFrom`, or block data contains a named descendant with a rename hint
- **THEN** definition normalization rejects it with the descriptor path

### Requirement: Group-valued lists support portable item labels
A list descriptor SHALL accept optional `itemLabel`, a field key naming an
immediate text, textarea, select or URL child of its group item. Builders and
all recursive metadata boundaries SHALL reject non-string keys, missing keys,
nested paths, unsupported child kinds and itemLabel on a scalar-valued list or
another descriptor kind. Valid metadata SHALL be detached portable JSON and
SHALL NOT change inferred content values, runtime content validation, defaults,
list bounds or stored item shape. No callback or template execution is allowed.

#### Scenario: Valid label metadata
- **WHEN** a list of groups with a title text child declares itemLabel title
- **THEN** its normalized and JSON-round-tripped metadata retain itemLabel and its inferred values remain arrays of the same group objects

#### Scenario: Invalid label targets
- **WHEN** itemLabel names a nested path, absent child, media/group/rich-text child, or is supplied on a scalar list
- **THEN** definition and forged metadata validation reject it with the descriptor path before use

#### Scenario: Content remains independent of presentation
- **WHEN** itemLabel changes between two permitted children
- **THEN** previously valid content remains equally valid with unchanged defaults and no extra stored keys

### Requirement: Portable field placeholders are display metadata
Text, textarea, URL, number, select and rich-text descriptors SHALL accept optional `placeholder` strings at every supported model, block data and block settings depth, including scalar list items. Normalization and metadata projection SHALL preserve the string exactly, including an empty string, as detached portable JSON. Other descriptor kinds SHALL reject `placeholder`; supported kinds SHALL reject non-string values at every builder and forged-metadata boundary with a descriptive descriptor path. Placeholders SHALL NOT change inferred content value types, defaults, validation or stored values. Omission SHALL add no property.

#### Scenario: Nested portable placeholder
- **WHEN** a list of groups has a text child with placeholder "Short heading"
- **THEN** the builder and JSON-round-tripped metadata retain the string and infer the same content value type as without it

#### Scenario: Invalid placeholders fail before use
- **WHEN** a supported kind carries a number or object placeholder, or a boolean, date, datetime, media, group or list carries any placeholder
- **THEN** both builder normalization and forged metadata validation reject it with the descriptor path

#### Scenario: Empty and absent placeholders
- **WHEN** supported descriptors respectively supply an empty placeholder and omit the option
- **THEN** normalization retains the empty string in the first and no placeholder property in the second, without inserting content or defaults

### Requirement: Field text counts match existing length validation
Ordinary text and textarea length bounds and counters SHALL measure raw UTF-16 code units without trimming or Unicode normalization. SEO title and description SHALL retain their existing trimmed Unicode code-point measurement. Shared count semantics SHALL preserve these distinct contracts without changing accepted values.

#### Scenario: Whitespace and supplementary characters
- **WHEN** an ordinary text field contains one space, one supplementary emoji and one space
- **THEN** its count is four and its length validation uses four, while the same SEO text counts one

#### Scenario: Combining marks remain unchanged
- **WHEN** a text value contains a letter followed by a combining mark
- **THEN** ordinary and SEO measurement each count two without silently normalizing the value
