# Content Validation Specification

## Purpose

Defines portable, deterministic validation and JSON-data primitives that let
Lace accept the same safe content in Node and Cloudflare before it is persisted,
published, or projected to later application layers.

## Requirements

### Requirement: Runtime field schemas and exhaustive descriptor handling

The content package SHALL derive a runtime schema and corresponding inferred
value type for every supported `FieldDefinition`. The derived schema SHALL
enforce the descriptor's field kind and declared constraints, including text
length, numeric bounds, select membership, valid calendar dates, UTC ISO 8601
datetimes, non-empty media identifiers, and the approved URL form. The package
SHALL expose an exhaustive descriptor visitor so a new field discriminant cannot
be consumed without handling every field kind at compile time.

#### Scenario: Validate a constrained field value

- **WHEN** a consumer compiles a text, number, or select descriptor with valid
  constraints and validates a conforming submitted value
- **THEN** validation succeeds with the descriptor's inferred value type

#### Scenario: Reject an invalid present field value

- **WHEN** a consumer validates a present value that has the wrong type or
  violates its descriptor's length, numeric, choice, date, datetime, media-ID,
  or URL contract
- **THEN** validation fails with a stable issue whose path identifies the field

#### Scenario: Add a field kind without updating a consumer

- **WHEN** a future field discriminant is added and a descriptor visitor omits
  that discriminant
- **THEN** the TypeScript build fails until the visitor handles it

### Requirement: Explicit draft and publish model-field validation

The content package SHALL validate a record against a model's field descriptors
in explicit `draft` and `publish` modes. Both modes SHALL reject unknown field
keys and invalid present values. A descriptor default SHALL be applied when its
field is absent. After defaults are applied, draft mode SHALL permit any
remaining required descriptor field to be absent, while publish mode SHALL
reject it. Validation failure issues SHALL use deterministic field paths so API
and form consumers can associate them with the submitted value.

#### Scenario: Save an incomplete draft

- **WHEN** a draft omits a required field that has no default while all supplied
  field values are valid and no unknown keys are present
- **THEN** draft validation succeeds and preserves that field as absent

#### Scenario: Publish requires every required field

- **WHEN** the same record is validated for publish
- **THEN** validation rejects the missing required field at its field path

#### Scenario: Apply a descriptor default

- **WHEN** a draft or publish record omits a field with a valid descriptor
  default
- **THEN** validation returns the default value for that field

#### Scenario: Reject an unmodelled field

- **WHEN** a draft or publish record contains a key absent from the model field
  descriptors
- **THEN** validation rejects the key with a stable path-aware issue

### Requirement: Safe rich-text documents and URL values

The content package SHALL expose a safe shared rich-text document type and SHALL
accept only Tiptap JSON documents whose nodes are `doc`, `paragraph`, `text`,
`heading` at levels 1 through 4, `bulletList`, `orderedList`, `listItem`,
`blockquote`, `hardBreak`, `horizontalRule`, and `codeBlock`; and whose marks are `bold`, `italic`, `strike`,
`code`, and `link`. `heading` SHALL permit only its numeric `level` attribute.
`link` SHALL require its string `href` attribute and permit only optional
`target: "_blank"` and `rel: "nofollow"` in addition. Omission SHALL mean the
current browsing context and no nofollow respectively; null, empty strings,
other targets, arbitrary rel tokens and extra attributes SHALL be rejected.
`horizontalRule` SHALL contain only its type. `codeBlock` SHALL permit only its
type and optional content array containing text nodes without marks or
attributes; empty code blocks SHALL be valid. Code text SHALL preserve spaces,
tabs and line breaks. Code blocks and rules SHALL be permitted at the document
root and in list items and blockquotes, alongside their previously permitted
children; all other existing nesting rules SHALL remain unchanged. Every rich-text link SHALL be an `https:`, `http:`, `mailto:`, or `tel:` URL,
a root-relative path beginning with one `/` but not `//`, or a fragment beginning
with `#`. Ordinary URL fields SHALL additionally accept canonical entry-reference
strings under the internal-url-links contract. The ordinary safe-href predicate
SHALL NOT be broadened to accept these tokens; field-target validation SHALL be
separate so tokens cannot reach rich-text hrefs. Provider-restricted URL fields
SHALL require a permitted provider HTTPS URL and SHALL reject entry references.
The validator SHALL reject all other nodes, marks, attributes, raw HTML,
scriptable schemes, event-handler attributes, style attributes, and malformed
document structure.

#### Scenario: Accept an approved formatted document

- **WHEN** a rich-text field contains a structurally valid document using an
  approved node/mark set and an allowed link URL
- **THEN** rich-text validation succeeds and returns the safe shared document
  type

#### Scenario: Reject executable rich-text content

- **WHEN** a document contains a raw HTML node, an unknown node or mark, a
  style/event attribute, an unsupported heading/link attribute, or a
  `javascript:` link
- **THEN** validation fails at the offending document path

#### Scenario: Reject an unsafe URL field

- **WHEN** a URL field contains a protocol-relative, malformed, or unapproved
  protocol URL
- **THEN** validation fails with a path-aware issue

#### Scenario: Expanded shared document
- **WHEN** a document contains H4, horizontal rules and empty or multiline plain code blocks at the root, inside a list item or inside a blockquote
- **THEN** validation accepts it with its text and whitespace unchanged

#### Scenario: Independent link choices
- **WHEN** an approved link supplies neither optional attribute, only target `_blank`, only rel `nofollow`, or both
- **THEN** validation accepts all four choices and preserves the supplied attributes

#### Scenario: Unsupported expanded attributes
- **WHEN** a document contains H5, a code language attribute, marked code-block text, a rule with children, target `_self`, null attributes or rel `noopener`, `noreferrer` or arbitrary token combinations
- **THEN** validation rejects it at the offending document path

#### Scenario: Nested rich-text leaves use the same rules
- **WHEN** an expanded document is used in a field inside a group or list, or in block data
- **THEN** the same validation accepts it in draft and publication modes without counting rich-text nodes toward CE7 list budgets or changing required-field semantics

#### Scenario: Existing documents stay valid
- **WHEN** a previously valid H1–H3 or href-only document is validated
- **THEN** it succeeds without rewriting headings, attributes or content

### Requirement: Canonical JSON and portable SHA-256 hashing

The content package SHALL serialize every portable JSON value to canonical JSON
by recursively sorting object keys while preserving array order. It SHALL hash
the UTF-8 bytes of that canonical serialization using a Web Crypto-compatible
SHA-256 operation and expose a deterministic hexadecimal digest. Equivalent JSON
values that differ only in object insertion order SHALL produce identical
canonical strings and digests in Node and Worker-like runtimes.

#### Scenario: Canonicalize reordered object keys

- **WHEN** two JSON values differ only by object-key insertion order at one or
  more nesting levels
- **THEN** canonical serialization and SHA-256 digest outputs are identical

#### Scenario: Preserve array order

- **WHEN** two otherwise equal JSON values contain the same array elements in a
  different order
- **THEN** their canonical serialization and digest outputs differ

#### Scenario: Match Node and Worker-like hashing fixtures

- **WHEN** canonical JSON fixtures run in Node and a Worker-like Web Crypto
  environment
- **THEN** both environments produce the committed canonical strings and
  digests

### Requirement: Shared entry payload limits

The content package SHALL export shared constants and validators that enforce a
title of at most 200 characters, a slug of at most 100 characters, no more than
200 top-level blocks, and no more than 1,000,000 UTF-8 bytes in model fields or
in one block's JSON data. Complete aggregate validation SHALL require each
block to identify its stable key, type, schema version, and JSON data, and SHALL
delegate type/version, uniqueness, allowed-block, and block-field semantics to
the supplied block registry and model. Draft validation SHALL require a title;
publish validation SHALL additionally require a slug for a collection entry and
all required model and block fields. Size, count, and semantic failures SHALL
identify the affected system field, fields payload, or block path.

#### Scenario: Validate a bounded draft payload

- **WHEN** a draft supplies a title within the limit, valid model field data,
  and at most 200 registered, allowed blocks whose individual data values are
  within the JSON-byte limit
- **THEN** aggregate validation succeeds without requiring a collection slug or
  otherwise-required draft field values

#### Scenario: Reject an oversized or overlong payload

- **WHEN** a title, slug, fields JSON value, block JSON value, or top-level
  block list exceeds its shared limit
- **THEN** validation fails with a stable path-aware issue for that value

#### Scenario: Require a collection slug at publication

- **WHEN** a collection entry with a valid title is validated for publish
  without a slug
- **THEN** validation rejects the missing slug at the slug path

### Requirement: Entry payloads accept the global kind without a slug
Entry payload and aggregate validation SHALL accept the model kinds `page`,
`collection` and `global` and reject any other kind. A global entry payload
SHALL NOT carry a slug in draft or publish mode; a supplied slug SHALL fail
with a stable issue at the slug path. Publish validation of a global SHALL
otherwise follow page rules: the title and every required model and block field
are enforced, and no slug is required.

#### Scenario: Validate a global draft
- **WHEN** a global entry with a title, valid fields and allowed blocks and no
  slug is validated in draft or publish mode
- **THEN** validation succeeds when the publish-mode required fields are present

#### Scenario: Reject a global slug
- **WHEN** a global entry payload supplies a slug
- **THEN** validation fails with an issue at the slug path

#### Scenario: Reject an unknown kind
- **WHEN** a payload names a kind other than page, collection or global
- **THEN** validation fails with the invalid-kind issue

### Requirement: Composite values have recursive draft and publication semantics
Validation SHALL apply the selected mode recursively through groups and list
items, rejecting wrong present types, null, unknown keys, sparse arrays and
invalid scalar leaves in both modes. Absent fields SHALL use detached defaults
when declared. An absent optional container without a default SHALL stay
absent without visiting descendants. Present `{}` and `[]` SHALL override
container defaults. Present groups and group items SHALL receive child defaults.
Draft mode SHALL permit missing required descendants and lists below minItems;
publish mode SHALL reject those cases. A required list SHALL require presence,
not non-emptiness; `[]` SHALL be publishable unless minItems is positive.
Every list position SHALL contain a valid item irrespective of its descriptor's
required flag or default. Standalone field validation SHALL default to publish
semantics and support explicit draft validation. Existing scalar semantics
SHALL remain unchanged.

Issues SHALL retain deterministic typed key/index paths, with
`invalid_field_value`, `unknown_field`, `missing_required_field`,
`list_too_short` and `list_too_long` distinguishing failures.

#### Scenario: Optional absence does not require descendants
- **WHEN** an optional group with a required child and child defaults is absent with no group default
- **THEN** draft and publish validation leave the group absent without errors or synthesized data

#### Scenario: Present empty group
- **WHEN** that group is submitted as `{}`
- **THEN** child defaults are applied, draft permits other missing children, and publish rejects remaining required children at their leaf paths

#### Scenario: Required empty list
- **WHEN** a required list with no positive minimum is submitted as `[]`
- **THEN** both modes accept it, while omitting it fails only publication

#### Scenario: Publication minimum
- **WHEN** a list with minItems 2 holds one valid item
- **THEN** draft accepts it and publish fails with `list_too_short` at the list path

#### Scenario: Exact nested failure
- **WHEN** block index 0 has an images list whose item index 2 contains an invalid image value
- **THEN** the issue path is `["blocks", 0, "data", "images", 2, "image"]`

#### Scenario: Defaults do not repair present invalid items
- **WHEN** a list has an item default and contains null, undefined or a hole
- **THEN** both modes reject the item rather than replace it

### Requirement: Composite limits apply to normalized snapshots
Both modes SHALL enforce at most 100 elements per list, or the field's lower
maxItems, and at most 500 list elements across model fields and all block data
after defaults. Hidden blocks SHALL count and SHALL retain draft-mode required
and minimum validation during publication. Nested list lengths SHALL add
independently; rich-text arrays and the block array SHALL not count. Draft and
published snapshots SHALL have separate budgets. Exceeding the aggregate cap
SHALL fail with `too_many_list_items` at the first list crossing the cap in
fields-then-block order. Normalized fields and each normalized block data JSON
SHALL retain the existing byte cap. Limits SHALL not be bypassable by defaults
or direct server commands.

#### Scenario: Per-list boundary
- **WHEN** a list with the default maximum contains 100 or 101 valid items
- **THEN** 100 is accepted and 101 fails in draft and publish modes

#### Scenario: Aggregate boundary includes hidden blocks
- **WHEN** model fields and visible blocks consume 450 elements and hidden blocks consume 50 or 51
- **THEN** the first snapshot passes and the second fails with `too_many_list_items`

#### Scenario: Count nested lists
- **WHEN** 10 category items each contain a 20-element link list
- **THEN** they consume 210 elements

#### Scenario: Defaults cannot bypass limits
- **WHEN** omitted values receive defaults that make a list total 501 or push normalized block data above the existing byte limit
- **THEN** validation rejects the resulting snapshot before persistence

### Requirement: Internal URL values and budgets validate at every boundary
Runtime definitions, serialized metadata, nested model/global fields, block data and
render parsing SHALL accept/reject the same canonical URL-field tokens without
network calls. Aggregate draft and publish validation SHALL cap internal link
occurrences at 200 after defaults, including hidden blocks;
occurrence 201 SHALL produce `too_many_internal_links` at its exact
field path. Well-formed missing-target references SHALL remain syntactically
valid; target state SHALL be checked by application publication policy. Existing
byte/media/list budgets and ordinary URL defaults SHALL remain in force.
Block settings SHALL retain their select/boolean/number/text allowlist and
required defaults; settings SHALL NOT participate in internal-reference discovery.

#### Scenario: Separate href and field safety
- **WHEN** `entry:target` is submitted to an ordinary URL field, a rich-text href, a provider-restricted URL and an ordinary text field
- **THEN** the URL field accepts its syntax, rich text and provider URLs reject it, and text retains it without reference semantics

#### Scenario: Normalized budget cannot be bypassed
- **WHEN** defaults or hidden blocks raise a snapshot from 200 to 201 internal references
- **THEN** save/publication validation rejects the aggregate before any write
