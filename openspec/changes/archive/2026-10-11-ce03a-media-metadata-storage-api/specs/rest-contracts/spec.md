## ADDED Requirements

### Requirement: Admin media DTOs carry descriptive metadata
Every admin media DTO (list items, detail, upload, deletion, retry-deletion and
metadata update results) SHALL include the item's `alt` string, `caption`
string and `focalPoint` object `{x, y}` when each is set, and SHALL omit each
value that is not set. The values SHALL never be `null` in a response. The
DTO's `updatedAt` SHALL keep millisecond precision, because it identifies the
version a writer edits.

#### Scenario: A described item is listed
- **WHEN** a viewer lists media that include an item with alt text and a focal
  point of `{x: 0.25, y: 0.75}` and no caption
- **THEN** that item's DTO contains `alt`, `focalPoint` with those coordinates,
  and no `caption` key

### Requirement: Admin media metadata update contract is explicit
The shared contract SHALL define the media metadata update request as a strict
JSON object with the optional keys `alt` (string or `null`, at most 1,000 code
points after trimming), `caption` (string or `null`, at most 2,000 code points
after trimming) and `focalPoint` (`null` or a strict object with the finite
numbers `x` and `y`, each from 0 to 1 inclusive). The request SHALL contain at
least one key. Unknown keys, wrong types, out-of-range coordinates, over-long
text, control characters in `alt`, control characters other than line breaks
in `caption`, unpaired surrogates, and an empty object SHALL fail with `422` `VALIDATION_FAILED` and JSON Pointer issue paths
such as `/alt` or `/focalPoint/x`.

The update SHALL require an `If-Match` header with exactly one strong entity
tag whose value is the item's `updatedAt` in Unix milliseconds, for example
`"1791647444998"`. A missing header, a weak tag, `*`, a list of tags or a
malformed tag SHALL fail with `422` `VALIDATION_FAILED` before the operation
reaches application code. The media detail response and the update response
SHALL carry the item's current tag in the `ETag` header.

The update result SHALL be `{media, build}`, where `media` is the updated
admin media DTO and `build` is the existing build dispatch outcome: `{status:
"queued", targetVersion}` when the update requested a site build, or `{status:
"not-dispatched"}` otherwise.

#### Scenario: A metadata update succeeds
- **WHEN** an editor sends `{"alt": "Red bicycle", "focalPoint": {"x": 0.5,
  "y": 0.3}}` with the item's current tag in `If-Match`
- **THEN** the API returns `200` with the updated media DTO, a build outcome,
  and an `ETag` header that differs from the submitted tag

#### Scenario: The precondition is missing or weak
- **WHEN** an editor sends a valid update without `If-Match`, or with
  `W/"1791647444998"`
- **THEN** the request fails with `422` `VALIDATION_FAILED` and nothing is
  updated

#### Scenario: An invalid body is rejected with pointers
- **WHEN** an editor sends `{"focalPoint": {"x": -0.1, "y": 0.5}, "title":
  "x"}`
- **THEN** the request fails with `422` `VALIDATION_FAILED` and issues at
  `/focalPoint/x` and `/title`

#### Scenario: An empty update is rejected
- **WHEN** an editor sends `{}` with a valid `If-Match` tag
- **THEN** the request fails with `422` `VALIDATION_FAILED`

## MODIFIED Requirements

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
`CONTENT_REVISION_CONFLICT`, `CONTENT_ROUTE_CONFLICT`, `MEDIA_IN_USE`, and
`MEDIA_UPDATE_CONFLICT` to `409`, preserving the same code as its machine-readable error code. The
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

#### Scenario: A stale media metadata edit is a conflict
- **WHEN** a writer updates media metadata with an `If-Match` tag that no
  longer identifies the stored version
- **THEN** the API returns status `409` with code `MEDIA_UPDATE_CONFLICT` and a
  sanitized message, and the item is unchanged
