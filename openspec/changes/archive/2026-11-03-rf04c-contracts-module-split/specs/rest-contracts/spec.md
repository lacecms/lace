## MODIFIED Requirements

### Requirement: Shared versioned content DTOs
The system SHALL provide one shared runtime contract for the `/api/v1` content
surface. It SHALL validate request and response representations for content
models, including each model's serializable discriminated field-descriptor map
and allowed registered block-definition metadata; admin entry lists, entry
details, complete-draft saves, publications, and deletions; public page,
collection, path, media, and build-export reads; media metadata; site-build
state; cursor pagination; and the error envelope. Field and block metadata
SHALL represent only the supported portable field types and their portable
options, including defaults and constraints where present, and SHALL reject
unknown descriptor keys, executable values, or non-JSON values. Each model's
block-definition metadata SHALL correspond only to its declared allowed block
types and include the stable type, schema version, display metadata, field map,
and optional default data. When present, it SHALL contain exactly one
definition for each allowed block type and no other definition, matched by the
definition's stable type and independent of the order of either list; a model
that lists an allowed block type more than once SHALL NOT carry
block-definition metadata. The representations SHALL use JSON primitives and
objects only, SHALL expose content values through explicit DTOs rather than
persistence rows, and SHALL remain usable by both Node and Cloudflare API
implementations.

#### Scenario: A content response crosses a runtime boundary
- **WHEN** an API implementation returns an entry, public content, media
  metadata, build export, or site-build DTO that satisfies the shared contract
- **THEN** a client can validate the JSON payload without importing a database
  schema or a runtime-specific API package

#### Scenario: Model field metadata crosses a runtime boundary
- **WHEN** an API implementation returns a configured content model with text,
  textarea, rich-text, number, boolean, date, datetime, select, URL, or media
  field metadata
- **THEN** a browser client can validate the descriptor type and its portable
  options without importing server configuration code or executable validators

#### Scenario: Allowed block metadata crosses a runtime boundary
- **WHEN** an API implementation returns a configured content model that allows
  one or more registered blocks
- **THEN** a browser client can validate metadata for exactly those block types
  and render their portable fields without importing a server-side registry

#### Scenario: Block definitions in a different order are accepted
- **WHEN** a content model allows `hero` and `quote` blocks and its
  block-definition metadata lists the `quote` definition before the `hero`
  definition
- **THEN** contract validation accepts the model and keeps both definitions in
  the order received

#### Scenario: Block definitions that do not cover the allowed types are rejected
- **WHEN** a content model's block-definition metadata omits an allowed block
  type, adds a type the model does not allow, or describes one type twice
- **THEN** contract validation rejects the model with the block-definition
  mismatch issue

#### Scenario: Duplicate allowed block types cannot carry definitions
- **WHEN** a content model lists the same allowed block type twice and carries
  block-definition metadata
- **THEN** contract validation rejects the model with the block-definition
  mismatch issue

#### Scenario: A malformed mutation is rejected before dispatch
- **WHEN** a client submits a create, draft-save, publish, or delete payload
  that is missing a required value, contains an unknown key, or supplies a
  value with the wrong JSON type
- **THEN** contract validation rejects it before an application mutation runs
