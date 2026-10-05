# rest-contracts Specification

## Purpose

Defines the versioned, runtime-validated REST data contracts and transport
conventions shared by Lace API implementations, clients, and documentation.

## Requirements

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
and optional default data. The representations SHALL use JSON primitives and
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

#### Scenario: A malformed mutation is rejected before dispatch
- **WHEN** a client submits a create, draft-save, publish, or delete payload
  that is missing a required value, contains an unknown key, or supplies a
  value with the wrong JSON type
- **THEN** contract validation rejects it before an application mutation runs

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
`CONTENT_MODEL_CARDINALITY_CONFLICT`, `CONTENT_PUBLISHED_IMMUTABLE`,
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

### Requirement: Security administration contracts reveal secrets only once
The shared REST contracts SHALL validate setup-admin, user list/create/update,
and build-token lifecycle requests and responses. A token-creation response
SHALL contain the plaintext credential exactly once; all later representations
SHALL exclude it and contain only safe token metadata. Rate-limit responses
SHALL use the shared error envelope with code `RATE_LIMITED` and a positive
integer `Retry-After` header.

#### Scenario: Token metadata is listed
- **WHEN** a client validates a build-token list or revocation response
- **THEN** the representation contains its identifier, name, prefix,
capabilities, lifecycle timestamps, and never the plaintext credential or its
stored verifier

### Requirement: Media transport preserves verified metadata and safe binary headers
The shared REST contract SHALL expose bounded media list and metadata responses
without storage keys, and define a multipart upload field named `file` with a
non-empty filename. Every media DTO SHALL name its uploader as `createdBy` with
an `id` and a non-empty `displayName`, and SHALL carry `usageCount`, a
non-negative integer counting the distinct entries that use the item. Media
created by upload SHALL carry positive integer `width` and `height` display
dimensions. The transport SHALL treat the verified binary format, not a
caller-supplied `Content-Type` or filename, as authoritative. Binary responses
SHALL use the verified MIME type and a safely encoded display filename; no
filename-derived value may create, split, or override an HTTP response header.

#### Scenario: A claimed MIME type disagrees with bytes
- **WHEN** a multipart upload declares an allowed MIME type but its `file`
  bytes are another, unsafe, or malformed format
- **THEN** the API returns the stable validation envelope and creates neither
  an object nor a metadata record

#### Scenario: A hostile display filename is delivered
- **WHEN** valid media has a filename containing controls or header-like text
- **THEN** its binary response contains only safe media headers and no injected
  response header or unvalidated content type

#### Scenario: An uploaded item is described without raw user IDs alone
- **WHEN** an editor uploads a valid image
- **THEN** the created media DTO contains `createdBy` with the editor's ID and
  display name, `usageCount` 0, and the image's display width and height

### Requirement: Publication responses expose independent dispatch outcomes
The shared publish response contract SHALL validate and expose the resulting
content entry, whether the request published or replayed an idempotent prior
publication, and a portable build-dispatch outcome. The outcome SHALL
distinguish accepted (optionally with a build identity), rejected, unavailable,
and not-dispatched dispatches without reporting build completion. A validated
client SHALL be able to present publication success independently from build
dispatch state without importing application or persistence types.

#### Scenario: Publication is accepted while dispatch is unavailable
- **WHEN** publication commits successfully and its build trigger is unavailable
- **THEN** the publish response validates the published entry and an
  `unavailable` dispatch outcome, without representing publication as failed

#### Scenario: An idempotent replay is returned
- **WHEN** a publish request repeats a prior successful idempotent publication
- **THEN** the publish response validates the original entry with `replayed`
  publication state and a `not-dispatched` outcome

### Requirement: Admin entry summaries expose derived state and editor names
The admin entry-list response for `GET /api/v1/admin/models/:modelKey/entries`
SHALL contain `items`, an optional opaque `nextCursor`, and `totals`. Each item
SHALL contain the entry `id`, `modelKey`, draft `title`, `draftRevision`, entry
`updatedAt`, the draft `slug` when present, a derived `status`, `updatedBy`
with the draft's last editor `id` and non-empty `displayName`, and
`listValues`. `status` SHALL be `draft` when the entry has no published
snapshot, `published` when the published snapshot's revision equals the draft
revision, and `changed` when a published snapshot exists and the draft revision
differs. Items with `published` or `changed` status SHALL include
`publishedSnapshotId` and `publishedAt`, the ISO-8601 UTC time of the current
publication; `draft` items SHALL include neither. `listValues` SHALL be a JSON
object that holds only the model's configured `listFields` keys present in the
draft, each with a string, number, or boolean value. `totals` SHALL contain
non-negative integer `all`, `draft`, `published`, and `changed` counts for the
model under the request's search term, independent of its status filter and
cursor. The shared contract SHALL reject an item whose status disagrees with
its publication fields or whose list value is not a JSON scalar.

#### Scenario: A list shows state without a second request
- **WHEN** a model has an unpublished entry, a published unchanged entry, and a
  published entry whose draft was saved again
- **THEN** their summaries report `draft`, `published`, and `changed`, only the
  latter two include `publishedAt`, and `totals` counts one of each with `all`
  equal to three

#### Scenario: A list shows configured field values
- **WHEN** a collection declares `listFields` `["category", "author"]` and a
  draft sets only `category`
- **THEN** that entry's `listValues` contains `category` with its draft value
  and no `author` key or other field

#### Scenario: An inconsistent summary is rejected
- **WHEN** a summary reports `draft` together with `publishedAt`, or `changed`
  without `publishedSnapshotId`
- **THEN** shared contract validation rejects the payload

### Requirement: Admin entry-list queries are validated and query-bound
The admin entry-list route SHALL accept optional `q`, `status`, `sort`,
`limit`, and `after` query parameters. `q` SHALL be trimmed; an empty result
SHALL mean no search, and a term longer than 200 characters SHALL be rejected.
A search SHALL match entries whose draft title or draft slug contains the term,
case-insensitively for ASCII letters. `status` SHALL be one of `draft`,
`published`, or `changed` and SHALL restrict items to that status. `sort` SHALL
be one of `updatedAt`, `-updatedAt`, `title`, `-title`, `publishedAt`, or
`-publishedAt`. A leading `-` means descending, and the default SHALL be
`-updatedAt`. Title ordering SHALL be case-insensitive for ASCII letters.
Publication-time ordering SHALL treat never-published entries as earliest.
Every order SHALL break ties by entry ID in the same direction. An unsupported
status or sort, an over-long term, or an invalid limit SHALL return the stable
`VALIDATION_FAILED` envelope with a JSON Pointer naming the parameter. A
continuation cursor SHALL be accepted only with the same model, search term,
status, and sort that produced it; otherwise the request SHALL fail validation
without returning a page. The generated OpenAPI document SHALL describe these
parameters and the list response schema.

#### Scenario: Search, filter, and sort a collection list
- **WHEN** an editor requests `q=Launch&status=changed&sort=title`
- **THEN** the response contains only changed entries whose draft title or slug
  contains `launch` in any ASCII case, ordered by title ascending, and `totals`
  counts every status among entries that match `launch`

#### Scenario: Reject an unsupported list query
- **WHEN** a client requests `status=archived`, `sort=author`, or a 201-character
  `q`
- **THEN** the API returns `422` `VALIDATION_FAILED` with the pointer `/status`,
  `/sort`, or `/q` and no list content

#### Scenario: Reject a cursor from a different query
- **WHEN** a client reuses a cursor from a `sort=title` page with
  `sort=-updatedAt` or with a different `q`
- **THEN** the API rejects the request with a validation failure instead of
  returning an inconsistent page

### Requirement: Admin entry details name the last editor
Admin entry responses from load, create, complete-draft save, and publication
SHALL include a top-level `updatedBy` containing the draft's last editor `id`
and non-empty `displayName`, so an admin client never needs the users API to
render the editor. `displayName` SHALL be the editor's stored user name. For a
`system:` audit actor, it SHALL be `System`. For an actor without a user record,
it SHALL be `Unknown user`. Public page, collection, path, and build-export
entry DTOs SHALL keep their existing shape and SHALL NOT contain a display name
or the top-level `updatedBy`.

#### Scenario: A viewer loads an entry edited by another user
- **WHEN** a viewer loads an entry whose draft was last saved by an editor
  whose stored user name is `editor@example.test`
- **THEN** the entry response includes `updatedBy` with that editor's ID and
  `displayName` `editor@example.test`

#### Scenario: A synchronized page names the system actor
- **WHEN** an administrator loads a page singleton created by configuration
  synchronization and never saved by a user
- **THEN** its `updatedBy.displayName` is `System`

#### Scenario: Public content keeps personal names out
- **WHEN** a build or public client reads published entries
- **THEN** the payload satisfies the unchanged public entry contract and
  contains no editor display name

### Requirement: Content-model DTOs carry list fields
The admin content-model DTO SHALL include a collection's `listFields` in
declared order when the configuration declares them and SHALL omit the property
otherwise. Shared contract validation SHALL reject `listFields` on a page model
and a `listFields` array that is empty, repeats a name, or names a field
absent from the model's field map.

#### Scenario: The admin reads list columns from configuration
- **WHEN** an authenticated client lists content models for a configuration
  whose `posts` collection declares `listFields` `["category", "author"]`
- **THEN** the `posts` DTO contains that array and a model without list fields
  has no `listFields` property

#### Scenario: A malformed model DTO is rejected
- **WHEN** a model DTO declares `listFields` on a page or names an undeclared
  field
- **THEN** shared contract validation rejects the payload

### Requirement: Admin media-list queries are validated and query-bound
The admin media-list route SHALL accept optional `q`, `type`, `sort`, `limit`,
and `after` query parameters. `q` SHALL be trimmed; an empty result SHALL mean
no search, and a term longer than 200 characters SHALL be rejected. A search
SHALL match media whose display filename contains the term, case-insensitively
for ASCII letters, as a literal substring. `type` SHALL be one of `image/avif`,
`image/jpeg`, `image/png`, or `image/webp` and SHALL restrict items to that
MIME type. `sort` SHALL be one of `createdAt`, `-createdAt`, `filename`,
`-filename`, `size`, or `-size`. A leading `-` means descending, and the
default SHALL be `-createdAt`. Filename ordering SHALL be case-insensitive for
ASCII letters. Every order SHALL break ties by media ID in the same direction.
An unsupported type or sort, an over-long term, or an invalid limit SHALL return
the stable `VALIDATION_FAILED` envelope with a JSON Pointer naming the
parameter. A continuation cursor SHALL be accepted only with the same search
term, type, and sort that produced it; otherwise the request SHALL fail
validation without returning a page. The generated OpenAPI document SHALL
describe these parameters.

#### Scenario: Search, filter, and sort the library
- **WHEN** an editor requests `q=Cover&type=image/png&sort=-size`
- **THEN** the response contains only PNG items whose filename contains
  `cover` in any ASCII case, ordered from largest to smallest

#### Scenario: The default order is newest first
- **WHEN** a client lists media without `sort`
- **THEN** items are ordered by creation time descending and then media ID
  descending

#### Scenario: Reject an unsupported media-list query
- **WHEN** a client requests `type=image/svg+xml`, `sort=width`, or a
  201-character `q`
- **THEN** the API returns `422` `VALIDATION_FAILED` with the pointer `/type`,
  `/sort`, or `/q` and no list content

#### Scenario: Reject a media cursor from a different query
- **WHEN** a client reuses a cursor from a `sort=filename` page with
  `sort=-createdAt`, a different `type`, or a different `q`
- **THEN** the API rejects the request with a validation failure instead of
  returning an inconsistent page

### Requirement: Admin media details expose usage
The admin API SHALL provide `GET /api/v1/admin/media/:mediaId` for callers with
`content:read`. It SHALL return the media DTO plus `usage`, an array of at most
50 entries. Each usage entry SHALL contain `entryId`, `modelKey`, `title`,
optional `slug`, `status` (`draft`, `published`, or `changed`), and a non-empty
`locations` array. Each location SHALL be either `{ source: "field", field,
states }` or `{ source: "block", blockKey, blockType, field, states }`, where
`states` is a non-empty, duplicate-free subset of `draft` and `published`. An
unknown media ID SHALL return `404` `NOT_FOUND`. The response SHALL contain no
storage key, bucket name, object URL, or credential. Items in `deleting` and
`delete_failed` status SHALL also be readable.

#### Scenario: A used image lists its entries
- **WHEN** a viewer reads an image that a published post uses in its `cover`
  field
- **THEN** the response contains the image metadata, `usageCount` 1, and one
  usage entry with the post's ID, model key, title, slug, status, and a field
  location `cover` in `draft` and `published`

#### Scenario: An unknown media item is not found
- **WHEN** a client reads a media ID that does not exist
- **THEN** the API returns `404` with code `NOT_FOUND`

### Requirement: Publication response reports durable queueing
The shared publication response contract SHALL distinguish a newly queued build
request from an idempotent replay, and SHALL report the queued published-state
target version. It SHALL not report provider acceptance before the dispatcher
invokes the trigger.

#### Scenario: Publication commits before dispatch
- **WHEN** publication commits while the trigger is offline
- **THEN** the response reports publication success and a queued build target
  instead of claiming provider acceptance

### Requirement: Build request and retry HTTP contracts are explicit
The shared REST contracts SHALL define strict, versioned administrator build request and failed-build retry inputs and durable queue receipt outputs. Responses SHALL expose the queued target version and coalescing status, and errors SHALL use the shared envelope. Inputs SHALL reject command, path, environment, and arbitrary argument fields.

#### Scenario: Valid manual request
- **WHEN** an administrator submits an empty build request to the versioned admin endpoint
- **THEN** the validated response identifies the durable queue receipt and target version

#### Scenario: Arbitrary build override supplied
- **WHEN** a request includes a command, path, environment, or arbitrary argument field
- **THEN** contract validation rejects the request before enqueueing work

### Requirement: Admin build failure DTOs expose closed reasons and safe entry paths
Admin build history and detail SHALL retain optional `error` as a closed failure reason under the site-build diagnostic vocabulary and SHALL add optional `errorPath` carrying only a source-relative entry under the builder diagnostic path contract. `errorPath` SHALL be absent unless `error` is a source reason. Shared runtime validation and generated OpenAPI SHALL describe the same constraints. Existing build IDs, lifecycle, reason, target version, requester and timestamps SHALL retain their shapes. No failure diagnostic SHALL include raw provider responses, commands, credentials, output, configured roots or absolute paths. Node and Worker SHALL use identical DTOs. Anonymous reads SHALL remain denied; admin, editor and viewer SHALL retain read access without configuration authority.

#### Scenario: Source failure in list and detail
- **WHEN** an authenticated reader requests history and detail for a failed or retrying source build
- **THEN** both return the persisted specific `error` and safe optional `errorPath` with the same build ID

#### Scenario: Existing reason-only record
- **WHEN** a stored build has a recognized error without a path
- **THEN** its DTO remains valid with `error` and no `errorPath`

#### Scenario: Invalid diagnostic payload
- **WHEN** a build DTO contains an unknown error, unsafe path, orphaned path, or a path attached to `install_failed`
- **THEN** shared contract validation rejects it

#### Scenario: Anonymous request
- **WHEN** an anonymous client requests build history or detail
- **THEN** the API returns the existing authentication error without diagnostic data

### Requirement: Admin build DTOs expose the seven-status lifecycle
Admin build history and detail DTOs SHALL validate `status` as exactly one of `pending`, `running`, `accepted`, `succeeded`, `failed`, `cancelled`, or `unknown`, in shared runtime validation and in generated OpenAPI. All other build fields, the 33C `error`/`errorPath` rules, and authorization SHALL be unchanged. Node and Worker SHALL return identical DTOs for identical persisted builds.

#### Scenario: New statuses are readable
- **WHEN** an authenticated reader requests history containing `accepted`, `cancelled`, and `unknown` builds
- **THEN** each DTO validates and carries its status, provider ID when present, and completion time

#### Scenario: Unsupported status
- **WHEN** a build DTO carries a status outside the seven values
- **THEN** shared contract validation rejects it
