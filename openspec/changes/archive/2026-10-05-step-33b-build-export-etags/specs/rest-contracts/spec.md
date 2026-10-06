## MODIFIED Requirements

### Requirement: JSON transport values retain stable representations
The system SHALL encode timestamps as ISO-8601 UTC strings, validate and
serialize them through shared transforms, and reject non-UTC or invalid date
strings. Cursors SHALL remain opaque non-empty transport strings; clients SHALL
not need to decode them. Shared contracts SHALL validate ETag and
idempotency-key header values used by their associated content operations. The
public build-export response SHALL use an ETag derived from the published-state
version; when a request supplies that current valid entity tag in
`If-None-Match`, it SHALL return `304 Not Modified` with the matching ETag and
no response body. A changed or absent valid entity tag SHALL produce the
validated build-export representation with its current ETag.

Build-export validators SHALL accept exactly one strong `"N"` or weak `W/"N"` tag whose decimal version is a non-negative safe integer, preserving the received spelling. Weak comparison SHALL compare the encoded version. Arbitrary opaque tags, lists, wildcards, signs, fractions, lowercase weak prefixes, whitespace inside the tag, and unsafe integers SHALL be rejected. The origin SHALL emit the strong form.

#### Scenario: A timestamp is serialized for JSON
- **WHEN** a portable content value contains a valid UTC timestamp
- **THEN** its response DTO exposes a canonical ISO-8601 UTC string and the
  corresponding request or response schema accepts that string

#### Scenario: An invalid transport primitive is supplied
- **WHEN** a request contains an invalid timestamp, empty cursor, malformed
  ETag, or empty or overlong idempotency key
- **THEN** shared contract validation reports a validation error without
  interpreting the value as an application command

#### Scenario: A conditional build export is current
- **WHEN** a client supplies the ETag for the current published-state version
  in `If-None-Match`
- **THEN** the API returns `304 Not Modified` with that ETag and an empty body

#### Scenario: A conditional build export is stale
- **WHEN** a client omits `If-None-Match` or supplies a valid ETag for an older
  published-state version
- **THEN** the API returns the validated build-export DTO and the current ETag

#### Scenario: Weak and strong versions agree
- **WHEN** a consumer supplies `W/"7"` for published-state version 7
- **THEN** validation succeeds and the API returns an empty `304` with origin ETag `"7"`

#### Scenario: Unsupported validators are rejected
- **WHEN** a consumer supplies `*`, `"hash"`, `"1", "2"`, or an unsafe numeric version
- **THEN** shared validation rejects the value

### Requirement: Mutable request preconditions are unambiguous
The complete-draft-save, publish, and delete contracts SHALL use a non-negative
integer `expectedRevision` in the JSON body as the canonical generated-client
precondition. They SHALL also accept an equivalent `If-Match` revision header
for HTTP clients. If both are supplied, their revisions SHALL match; a missing
body value may be supplied by `If-Match`, and a disagreement SHALL be rejected
as a validation failure before the operation reaches application code.

Mutation `If-Match` SHALL accept only strong revision tags; a weak tag SHALL fail validation even when its numeric revision agrees with the body.

#### Scenario: Header and body revisions agree
- **WHEN** a client sends the same expected revision in the request body and
  `If-Match` header
- **THEN** the shared precondition parser produces that revision for the
  mutation command

#### Scenario: Header and body revisions disagree
- **WHEN** a client sends different revisions in the body and `If-Match`
- **THEN** the request is rejected with a stable validation issue and no
  mutation is attempted

#### Scenario: A stale deletion is rejected atomically
- **WHEN** a client requests deletion with an expected revision that no longer
  identifies the current draft, or when the entry's publication state changes
  after that revision was read
- **THEN** deletion fails with `CONTENT_REVISION_CONFLICT` and leaves the entry,
  public route, published state, and build work unchanged

#### Scenario: A weak mutation precondition is rejected
- **WHEN** a writer supplies `W/"4"` in `If-Match` with expected revision 4
- **THEN** validation rejects the request before any mutation

