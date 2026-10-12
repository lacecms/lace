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
`heading` at levels 1 through 3, `bulletList`, `orderedList`, `listItem`,
`blockquote`, and `hardBreak`; and whose marks are `bold`, `italic`, `strike`,
`code`, and `link`. `heading` SHALL permit only its numeric `level` attribute.
`link` SHALL permit only its string `href` attribute. Every link and URL-field
value SHALL be an `https:`, `http:`, `mailto:`, or `tel:` URL, a root-relative
path beginning with one `/` but not `//`, or a fragment beginning with `#`.
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
