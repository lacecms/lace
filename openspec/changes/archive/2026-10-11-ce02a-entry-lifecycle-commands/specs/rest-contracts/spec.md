## MODIFIED Requirements

### Requirement: Mutable request preconditions are unambiguous
The complete-draft-save, publish, revert, and delete contracts SHALL use a
non-negative integer `expectedRevision` in the JSON body as the canonical
generated-client precondition. They SHALL also accept an equivalent `If-Match`
revision header for HTTP clients. If both are supplied, their revisions SHALL
match; a missing body value may be supplied by `If-Match`, and a disagreement
SHALL be rejected as a validation failure before the operation reaches
application code. The duplicate contract SHALL accept the same optional body
value and header with the same agreement rule, and SHALL allow both to be
absent. The unpublish contract SHALL require a non-empty
`expectedPublishedSnapshotId` in the JSON body and SHALL not interpret
`If-Match`, because entry tags identify draft revisions.

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

#### Scenario: Unpublish requires the expected publication
- **WHEN** an administrator sends an unpublish request without
  `expectedPublishedSnapshotId`
- **THEN** the request fails with `VALIDATION_FAILED` at
  `/expectedPublishedSnapshotId` and nothing is unpublished

#### Scenario: Duplicate without a precondition
- **WHEN** a writer duplicates a collection entry without `expectedRevision` or
  `If-Match`
- **THEN** the copy is created from the source draft revision that the server
  read

### Requirement: Errors use stable sanitized envelopes
The system SHALL represent every transport failure as `{ error: { code,
message, details? } }`. Validation failures SHALL use `VALIDATION_FAILED` with
field issues whose paths use JSON Pointer notation; the envelope SHALL not
expose stack traces, SQL text, or validator-internal objects. Content
validation failures raised while creating, saving, or publishing an entry
(model fields, system fields, and block keys, types, versions, and data) SHALL
use the same `422` `VALIDATION_FAILED` envelope, with one issue per failure
carrying its stable issue code, a sanitized message that does not repeat the
submitted value, and the JSON Pointer of the failing location. Each existing
domain/application error SHALL map to exactly one stable status and code pair:
`AUTHORIZATION_DENIED` to `403`, `CONTENT_INVALID_STATE` to `422`, and each of
`CONTENT_MODEL_CARDINALITY_CONFLICT`, `CONTENT_NOT_PUBLISHED`,
`CONTENT_PAGE_SINGLETON`, `CONTENT_PUBLISHED_IMMUTABLE`,
`CONTENT_REVISION_CONFLICT`, `CONTENT_ROUTE_CONFLICT`, and `MEDIA_IN_USE` to
`409`, preserving the same code as its machine-readable error code. The
transport contract SHALL also represent a missing API resource as `NOT_FOUND`
with `404`, an exhausted request limit as `RATE_LIMITED` with `429`, and an
oversized request body as `PAYLOAD_TOO_LARGE` with `413`.

#### Scenario: A revision conflict is reported safely
- **WHEN** an optimistic content mutation reaches an existing revision conflict
- **THEN** the API can return status `409` with code
  `CONTENT_REVISION_CONFLICT` and only documented conflict details

#### Scenario: Deleting referenced media is reported as in use
- **WHEN** a writer requests deletion or retries deletion of media that content
  still references
- **THEN** the API returns status `409` with code `MEDIA_IN_USE` and a
  sanitized message that names no entry or storage detail

#### Scenario: Request validation fails safely
- **WHEN** validation rejects a submitted field or header
- **THEN** the API can return status `422` with code `VALIDATION_FAILED` and
  stable JSON Pointer issue paths without a stack trace, SQL text, or
  implementation-specific validator output

#### Scenario: Invalid block data is rejected with its pointer
- **WHEN** a writer saves a complete draft whose first block's rich-text field
  contains a node outside the shared allowlist
- **THEN** the API returns status `422` with code `VALIDATION_FAILED` and an
  issue whose path is `/blocks/0/data/body`, and the draft revision is
  unchanged

#### Scenario: Publication validation is rejected with its pointer
- **WHEN** an admin publishes a draft that lacks a model field required for
  publication
- **THEN** the API returns status `422` with code `VALIDATION_FAILED` and an
  issue whose path is `/fields/<key>` with code `missing_required_field`, and
  nothing is published

#### Scenario: A resource does not exist
- **WHEN** a caller requests an unknown API route or content resource
- **THEN** the API returns status `404` with code `NOT_FOUND` and a sanitized
  error envelope

#### Scenario: A request crosses an operational limit
- **WHEN** a caller exceeds a configured request-rate or body-size limit
- **THEN** the API returns the corresponding stable `RATE_LIMITED` or
  `PAYLOAD_TOO_LARGE` error envelope without disclosing limiter internals

#### Scenario: Page lifecycle refusals are conflicts
- **WHEN** an administrator deletes or duplicates a page entry
- **THEN** the API returns status `409` with code `CONTENT_PAGE_SINGLETON` and
  the entry is unchanged

#### Scenario: Unpublishing an unpublished entry is a conflict
- **WHEN** an administrator unpublishes an entry without a current publication
- **THEN** the API returns status `409` with code `CONTENT_NOT_PUBLISHED`

## ADDED Requirements

### Requirement: Admin entry lifecycle endpoints are explicit
The admin API SHALL expose `POST /api/v1/admin/entries/:entryId/unpublish`,
`POST /api/v1/admin/entries/:entryId/revert`, and
`POST /api/v1/admin/entries/:entryId/duplicate` with strict Valibot request and
response contracts and OpenAPI descriptions. Unpublish SHALL accept an optional
`Idempotency-Key` with the publish key rules and SHALL respond `200` with the
admin entry after unpublication, an `unpublication` outcome of `unpublished` or
`replayed`, and a build-dispatch outcome that is `queued` with the target
version for a fresh unpublication and `not-dispatched` for a replay. Revert
SHALL respond `200` with the reverted admin entry. Duplicate SHALL respond
`201` with the new admin entry. Request bodies SHALL reject unknown keys.

#### Scenario: Unpublish response validates
- **WHEN** an administrator unpublishes a published entry
- **THEN** the response validates against the shared unpublish result contract
  with an entry that has no `published` snapshot, `unpublished`, and a queued
  build outcome

#### Scenario: Revert response validates
- **WHEN** an editor reverts a changed published entry with `If-Match`
- **THEN** the response is `200` with an admin entry whose draft revision equals
  its published revision

#### Scenario: Duplicate response validates
- **WHEN** an editor duplicates a collection entry
- **THEN** the response is `201` with a new admin entry that has no slug and no
  `published` snapshot

#### Scenario: Viewer is denied every lifecycle endpoint
- **WHEN** a viewer calls unpublish, revert, or duplicate
- **THEN** each returns `403` with `AUTHORIZATION_DENIED` and nothing changes
