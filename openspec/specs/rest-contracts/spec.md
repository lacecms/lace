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

### Requirement: Security administration contracts reveal secrets only once
The shared REST contracts SHALL validate setup-admin, user list/update,
invitation, password-reset and build-token lifecycle requests and responses.
They SHALL NOT define a request that creates a user with an administrator-chosen
password. A token-creation response SHALL contain the plaintext credential
exactly once; all later representations SHALL exclude it and contain only safe
token metadata. An invitation or administrator password-reset response SHALL
contain its link only when the delivery outcome is not `sent`, and invitation
listings SHALL never contain tokens or links. Rate-limit responses SHALL use the
shared error envelope with code `RATE_LIMITED` and a positive integer
`Retry-After` header.

#### Scenario: Token metadata is listed
- **WHEN** a client validates a build-token list or revocation response
- **THEN** the representation contains its identifier, name, prefix,
capabilities, lifecycle timestamps, and never the plaintext credential or its
stored verifier

#### Scenario: Sent invitation carries no link
- **WHEN** an invitation response reports delivery `sent` and includes a link
- **THEN** contract validation rejects the payload

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
otherwise. Shared contract validation SHALL reject `listFields` on a page or
global model and a `listFields` array that is empty, repeats a name, or names a
field absent from the model's field map.

#### Scenario: The admin reads list columns from configuration
- **WHEN** an authenticated client lists content models for a configuration
  whose `posts` collection declares `listFields` `["category", "author"]`
- **THEN** the `posts` DTO contains that array and a model without list fields
  has no `listFields` property

#### Scenario: A malformed model DTO is rejected
- **WHEN** a model DTO declares `listFields` on a page or a global, or names an
  undeclared field
- **THEN** shared contract validation rejects the payload

### Requirement: Admin media-list queries are validated and query-bound
The admin media-list route SHALL accept optional `q`, `type`, `sort`, `limit`,
and `after` query parameters. `q` SHALL be trimmed; an empty result SHALL mean
no search, and a term longer than 200 characters SHALL be rejected. A search
SHALL match media whose display filename contains the term, case-insensitively
for ASCII letters, as a literal substring. `type` SHALL be one of `image/avif`,
`image/gif`, `image/jpeg`, `image/png`, or `image/webp` and SHALL restrict items to that
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

#### Scenario: Filter the library to GIF
- **WHEN** an editor requests `type=image/gif`
- **THEN** the response contains only GIF items

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

### Requirement: Admin build DTOs expose tracking progress and reasons
Admin build history and detail DTOs SHALL accept optional `providerStage` as one of `queued`, `initialize`, `clone_repo`, `build`, or `deploy` and optional `providerCheckedAt` as an ISO timestamp, in shared runtime validation and generated OpenAPI. The closed `error` vocabulary SHALL include `provider_build_failed`, `provider_deploy_failed`, `provider_cancelled`, `provider_skipped`, `tracking_forbidden`, `tracking_not_found`, `tracking_rejected`, `tracking_timeout`, and `tracking_unconfigured`, none of which may carry `errorPath`. An unrecognized stored stage SHALL be omitted. Node and Worker SHALL return identical DTOs, and no DTO SHALL contain provider response data or credentials.

#### Scenario: Tracked build detail
- **WHEN** an authenticated reader requests a tracked build at the build stage
- **THEN** the DTO carries status `running`, its provider ID, `providerStage: "build"`, and `providerCheckedAt`

#### Scenario: Invalid stage
- **WHEN** a build DTO carries `providerStage: "upload"`
- **THEN** shared contract validation rejects it

### Requirement: Admin session and email contracts are closed and validated
The shared contracts SHALL define a closed permission picklist containing
exactly `content:read`, `content:write`, `content:publish`, `media:write`,
`users:manage`, and `settings:manage`. They SHALL also define an admin
session-summary DTO with a strict `user` object (`id`, `email`, optional
`displayName`, and `role`) and a `permissions` array of unique picklist values.
The admin settings-status DTO SHALL gain a required `email` object with
`provider` from `none`, `log`, `smtp`, `resend`, `cloudflare` and a `from`
sender address present exactly when the provider is not `none`. The email-test
result DTO SHALL be either `{ status: "sent" }` or
`{ status: "failed", reason }` with a reason from `not_configured`,
`invalid_message`, `rejected`, `rate_limited`, `unavailable`. These DTOs SHALL
reject unknown fields and SHALL contain no credentials, hosts, ports, keys, or
provider error text. The generated OpenAPI document SHALL include them.

#### Scenario: Session summary carries an unknown permission
- **WHEN** a session-summary payload lists a permission outside the closed
  picklist
- **THEN** contract validation rejects the payload

#### Scenario: Status reports no provider
- **WHEN** the settings-status payload reports email provider `none` with a
  `from` address
- **THEN** contract validation rejects the payload

#### Scenario: Email test fails
- **WHEN** a test send fails because the provider quota is exceeded
- **THEN** the validated result is `{ status: "failed", reason: "rate_limited" }`

### Requirement: Account lifecycle DTOs are closed and validated
The shared contracts SHALL define strict DTOs for:

- invitation create (`email`, `role`) and resend requests;
- invitation records (`id`, `email`, `role`, `invitedBy` display name,
  `createdAt`, `expiresAt`, `state` from `pending`, `expired`);
- the invitation issue result (the record, the delivery outcome, and an
  optional `link`);
- public invitation inspect (`token`) and accept (`token`, `password`, optional
  `displayName`) requests, and their results;
- password-reset request (`email`) and confirm (`token`, `password`) requests;
- the administrator reset result (delivery outcome and optional `link`);
- the account profile update (`displayName`) and password change
  (`currentPassword`, `newPassword`, `signOutOtherSessions`) requests;
- session records (`id`, `createdAt`, `lastActiveAt`, `browser`, `os`,
  `current`) and the revocation result (`revoked` count).

Tokens SHALL be 43-character base64url strings, passwords 12 to 1024
characters, and display names 1 to 120 characters. Session records SHALL never
contain a token or IP address. The generated OpenAPI document SHALL include
these DTOs.

#### Scenario: Session record carries a token
- **WHEN** a session payload includes a `token` field
- **THEN** contract validation rejects it

#### Scenario: Short password
- **WHEN** an accept or reset-confirm request carries an 11-character password
- **THEN** validation fails with a field-level issue

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

### Requirement: Public content responses return published entries
Public page, collection-slug and path reads SHALL return `{entry, media}`, and
the public collection read SHALL return `{items, media, nextCursor?}`. The
build export SHALL return pages whose assembled content is
`{formatVersion, entries, globals, media, seo, version}`. Each public entry
SHALL be exactly `{id, modelKey, path, slug?, title, fields, blocks,
publishedAt, seo?}`, taken only from the entry's current published snapshot:

- `slug` SHALL be absent when the snapshot has none;
- `publishedAt` SHALL be the ISO-8601 UTC creation time of the published
  snapshot;
- `blocks` SHALL hold the visible blocks only, ordered by position, each as
  the public block DTO `{key, type, schemaVersion, position, anchor?,
  className?, settings, data}`.

A public block SHALL carry `anchor` and `className` only when set and SHALL
never carry `hidden`; both contract variants SHALL reject a public block that
carries a `hidden` key, because ignoring it would deliver hidden content. Contract validation SHALL treat a missing `settings` key
as `{}`; the API SHALL always send it. The export's `entries` SHALL contain
only routed entries, and its first page's `globals` SHALL contain every
published global as a public global ordered by model key. The API SHALL always
send `globals` on the first page.

Public responses SHALL NOT contain `draft`, `published`, `model`, revision,
editor or other editorial keys. The strict contract variant SHALL reject
unknown keys. The tolerant variant SHALL remove them, so a tolerant parse
never yields an editorial key either. Both runtimes SHALL return the same
shape. Each public entry route and the build-export route SHALL document their
200 response schemas in the generated OpenAPI document.

#### Scenario: A published page is read
- **WHEN** a client reads a published page whose draft was changed after
  publication
- **THEN** the response is `{entry, media}` whose entry carries the published
  title, fields, ordered blocks, path and `publishedAt`, and no draft value or
  `draft` key appears

#### Scenario: A collection page is read
- **WHEN** a client reads one page of a published collection that has more
  entries
- **THEN** the response lists public entries under `items` with an opaque
  `nextCursor` and one `media` dictionary for the whole page

#### Scenario: A legacy-shaped payload is validated
- **WHEN** a client validates a payload that wraps an entry as
  `{entry: {draft, published, id, model}, path}`
- **THEN** both the strict and the tolerant variant reject it, because the
  required public entry keys are missing

#### Scenario: The export carries globals
- **WHEN** a build client reads the export of a site with a published page and
  a published global
- **THEN** the first page's `entries` contains the page only, its `globals`
  contains the global, and its `media` resolves the media of both

#### Scenario: An export without globals is validated
- **WHEN** a client validates a first-page payload that has no `globals` or
  no `seo` key
- **THEN** both the strict and the tolerant first-page variants reject it,
  because a first page always carries both

#### Scenario: Public blocks carry the envelope without hidden blocks
- **WHEN** a client reads a published page whose snapshot holds a visible
  block with anchor `pricing` and settings `{align: "center"}` and a hidden
  block
- **THEN** `blocks` holds only the visible block with `anchor`, `settings` and
  no `hidden` key, and the export and global reads apply the same rule

#### Scenario: A public block without settings is validated
- **WHEN** a client validates a public block that has no `settings` key
- **THEN** validation succeeds and yields `settings: {}`, and a block that
  carries `hidden` is rejected by both the strict and the tolerant variant

### Requirement: Public content responses resolve referenced media
Every public content response SHALL carry a `media` object keyed by media ID
containing exactly one item for every media ID referenced by the returned
entries' published snapshots through their fields, their SEO group or their
visible blocks, according to the content reference projection, and no other
item. Media referenced only by hidden blocks SHALL NOT appear. Each item SHALL
be `{id, url, mimeType, width, height, alt, caption, focalPoint}` where `id`
equals its key, `url` is the public media URL built from the API's public base
URL, `width` and `height` are positive integers or `null`, `alt` and `caption`
are the media item's descriptive text or `null`, and `focalPoint` is
`{x, y}` with each value from 0 to 1 or `null`. Dictionary keys SHALL be
serialized in ascending code-unit order. Field and block values SHALL keep
storing media IDs. Responses SHALL never expose storage keys, filenames,
uploader identity or media lifecycle status. Contract validation SHALL reject a
dictionary item whose `id` differs from its key. The public media read SHALL
serve a media item only when a current published snapshot references it in
the same way.

#### Scenario: An entry references described media
- **WHEN** a published entry's image block references media with alt text,
  dimensions and a focal point
- **THEN** the response's `media` dictionary contains that ID with its public
  URL, MIME type, width, height, alt text, caption and focal point

#### Scenario: Media metadata is absent
- **WHEN** referenced media has no alt text, caption or focal point
- **THEN** its dictionary item carries `null` for each absent value

#### Scenario: Media used only by drafts
- **WHEN** an item is referenced only by an unpublished draft
- **THEN** no public response includes it in a `media` dictionary

#### Scenario: Media used only by hidden blocks
- **WHEN** an item is referenced only by a hidden block of a published
  snapshot
- **THEN** no public response includes it in a `media` dictionary and the
  public media read answers `404`

#### Scenario: Metadata of published media changes
- **WHEN** a writer edits the alt text of media referenced by a current
  publication and a build client revalidates the export with the former ETag
- **THEN** the API returns 200 with a new ETag and the export's `media`
  dictionary carries the new alt text

### Requirement: Global models have explicit admin and public contracts
The admin content-model DTO SHALL accept `kind: "global"` without `path` or
`route`, and contract validation SHALL reject a global model DTO carrying
either. Admin entry DTOs of a global SHALL carry `model: {kind: "global",
key}`. `GET /api/v1/public/globals/:modelKey` SHALL be an anonymous public read
returning `{global, media}`, where `global` is exactly `{id, modelKey, fields,
blocks, publishedAt}` from the global's current published snapshot, with the
block shape and ordering of public entries and no path, slug, title, draft or
editorial key, and `media` is the public media dictionary of that snapshot. The
route SHALL return `404 NOT_FOUND` when the key is malformed, names no
configured model, names a page or collection, or names a global without a
publication. Admin delete and duplicate requests for a global entry SHALL
return `409 CONTENT_PAGE_SINGLETON`. The route SHALL document its 200 response
schema in the generated OpenAPI document.

#### Scenario: A published global is read
- **WHEN** an anonymous client reads `/api/v1/public/globals/settings` after
  the `settings` global was published with a media field
- **THEN** the response is `{global, media}` with the published fields and
  ordered blocks, the publication time and the resolved media item, and no
  path, slug or title

#### Scenario: An unpublished or non-global key
- **WHEN** a client reads the globals route for an unpublished global, an
  unknown key, or the key of a published page
- **THEN** the response is `404 NOT_FOUND`

#### Scenario: A global model DTO
- **WHEN** an authenticated client lists content models including the
  `settings` global
- **THEN** its DTO has `kind: "global"` and no `path`, `route` or `listFields`

#### Scenario: Deleting a global over HTTP
- **WHEN** an administrator sends `DELETE /api/v1/admin/entries/:id` for a
  global entry
- **THEN** the response is `409 CONTENT_PAGE_SINGLETON` and the entry remains

### Requirement: SEO values have explicit admin and public contracts
Admin snapshot DTOs, both draft and published, SHALL carry
`seo: {title, description, image, canonical, noindex}` for entries of models
with SEO enabled. Unset values are `null` and `noindex` is a boolean. Entries
of other models SHALL omit the key. Create and save requests SHALL accept an
optional, nullable `seo` strict object whose keys are each optional:

- `title`, `description` and `canonical`: nullable strings;
- `image`: a nullable identifier;
- `noindex`: a boolean.

The request schema SHALL apply the shared SEO rules, so an invalid value fails
with `422 VALIDATION_FAILED` and an issue under `/seo`, and an unknown key is
rejected. Public entry DTOs (page, collection item, by-path, collection lists
and build-export `entries`) SHALL carry the same `seo` object for models with
SEO enabled and omit it otherwise. Public globals SHALL never carry `seo`.

#### Scenario: Read and save SEO in the admin
- **WHEN** an admin reads an entry of an SEO-enabled model whose draft has
  `{title: "Hello"}`
- **THEN** the draft DTO has `seo: {title: "Hello", description: null, image: null, canonical: null, noindex: false}`
- **WHEN** the client saves `seo: {canonical: "https://example.com/a"}`
- **THEN** the response draft has that canonical and every other SEO value is
  `null` or `false`

#### Scenario: Reject an invalid SEO request
- **WHEN** a save submits `seo: {canonical: "/a"}` or `seo: {title: 5}` or
  `seo: {keywords: "x"}`
- **THEN** the response is `422 VALIDATION_FAILED` with an issue under `/seo`

#### Scenario: Public entries carry SEO only for enabled models
- **WHEN** the export holds a published entry of an SEO-enabled model with no
  stored group and an entry of a model without SEO
- **THEN** the first carries `seo` with all values `null` and `noindex: false`,
  and the second has no `seo` key

### Requirement: Model DTOs and the build export describe SEO configuration
Content-model DTOs of pages and collections with SEO enabled SHALL carry
`seo: {description, image}`, where each value is a mapped field key or
`null`. The defaults global's DTO SHALL carry
`seoDefaults: {siteName, titleTemplate, description, image}`, with `null` for
unmapped optional values. The build export SHALL carry
`seo: {models, defaults}`:

- `models` maps the key of every SEO-enabled model to its `{description, image}`
  mapping;
- `defaults` is `{modelKey, siteName, titleTemplate, description, image}` for
  the defaults global, or `null` when no global declares `seoDefaults`.

The export schema SHALL treat a missing `seo` as `{models: {}, defaults: null}`,
so older exports stay valid, and the API SHALL always send it.

#### Scenario: Export with SEO configuration
- **WHEN** `posts` declares `seo: { description: "excerpt" }`, `home` declares
  `seo: true` and `settings` declares `seoDefaults: { siteName: "siteName" }`
- **THEN** the export `seo` is
  `{models: {home: {description: null, image: null}, posts: {description: "excerpt", image: null}}, defaults: {modelKey: "settings", siteName: "siteName", titleTemplate: null, description: null, image: null}}`

#### Scenario: Older export without the key
- **WHEN** an export without `seo` is parsed
- **THEN** it parses with `seo` equal to `{models: {}, defaults: null}`

### Requirement: Media usage DTOs name SEO image locations
The admin media usage location SHALL accept a third variant
`{source: "seo", field: "image", states}` alongside the field and block
variants, and admin media details SHALL report an SEO image usage with it.

#### Scenario: Usage of an SEO image
- **WHEN** media is used only as the published SEO image of one entry
- **THEN** its details list that entry with location
  `{source: "seo", field: "image", states: ["published"]}`

### Requirement: Admin block DTOs carry the block envelope
Admin draft and published snapshot DTOs SHALL return each block as
`{key, type, schemaVersion, position, anchor?, className?, hidden, settings,
data}`, carrying `anchor` and `className` only when set. Create and save
requests SHALL accept the same block shape with `anchor`, `className`,
`hidden` and `settings` optional; contract validation SHALL check the types,
the anchor format and the class-token format with the shared content rules,
and SHALL reject unknown block keys. Validation failures of the envelope SHALL
be reported as `422 VALIDATION_FAILED` issues at the block's envelope path.
Block-definition metadata in content model DTOs SHALL accept an optional
`settings` field map that satisfies the block settings rules and SHALL reject
a `settings` key on a definition that would not produce it. The generated
OpenAPI document SHALL describe the envelope.

#### Scenario: An old client saves without envelope values
- **WHEN** a client saves blocks with only `key`, `type`, `schemaVersion`,
  `position` and `data`
- **THEN** the save succeeds and the response blocks carry `hidden: false`
  and the declared setting defaults

#### Scenario: A malformed envelope is rejected
- **WHEN** a save submits a block with `hidden: "yes"`, an anchor `Top`, or an
  unknown block key `visible`
- **THEN** the request fails with `422` and an issue at that block's path, and
  no draft is written

#### Scenario: Block metadata carries settings
- **WHEN** the admin reads a model that allows a block declaring settings
- **THEN** the model's block-definition metadata includes `settings` with each
  setting's type, choices and default

### Requirement: Composite metadata and values cross existing REST boundaries
Model and block metadata schemas SHALL accept recursively validated group/list
descriptors and reject malformed, over-depth or cyclic definitions. OpenAPI
SHALL describe the recursive descriptor alternatives and bounds. Existing admin
request/response and public entry, global and export shapes SHALL carry groups
as objects and lists as arrays without item envelopes or new IDs; media values
SHALL stay IDs. Composite validation errors SHALL use exact JSON Pointer paths
under fields or block data. Media usage locations SHALL retain their existing
shape with nested pointer strings in `field` and unchanged scalar strings.
Public media dictionaries and eligibility SHALL include nested published model
and visible-block references and exclude draft-only and hidden-only references.
Existing response sanitization, header and concurrency contracts SHALL remain.

#### Scenario: Metadata round trip
- **WHEN** the API exposes a model containing nested groups/lists
- **THEN** its response passes the shared metadata contract and the recursive descriptor shape is documented in OpenAPI

#### Scenario: Precise error response
- **WHEN** an authorized save supplies invalid media data at images item index 2 in block index 0
- **THEN** the 422 validation envelope includes `/blocks/0/data/images/2/image`

#### Scenario: Nested usage location
- **WHEN** media is used in a group child of a draft list item
- **THEN** admin media detail reports its nested `field` pointer with the existing draft/published state representation

#### Scenario: Published nested media dictionary
- **WHEN** nested media is used by a published field or visible block and other media only by hidden blocks or drafts
- **THEN** public reads, globals and exports resolve only the publicly eligible IDs, without storage keys or uploader data

### Requirement: Placeholder metadata crosses validated recursive boundaries
Model and registered-block metadata, including block settings, SHALL transport supported optional placeholders at every allowed composite depth as JSON strings. Shared response validation and generated OpenAPI SHALL describe the supported kinds and reject malformed or misplaced placeholders. Public content values SHALL remain unchanged and SHALL NOT acquire descriptor metadata as stored content properties.

#### Scenario: Portable model and block guidance
- **WHEN** a model response or configuration metadata export contains nested model, block data and block settings fields with valid placeholders
- **THEN** clients validate the metadata without server code and retain all placeholder strings

#### Scenario: Forged unsupported placeholder
- **WHEN** a response carries a non-string placeholder or one on an unsupported descriptor kind at a nested depth
- **THEN** metadata validation rejects it before editable forms are rendered

### Requirement: Form layouts cross metadata boundaries as validated JSON
Shared model, group and block metadata schemas and converters SHALL retain optional `layout` and block `settingsLayout` with identical behavior on Node and Cloudflare. Schemas SHALL enforce the portable shape and references against each owner's field map, including nested list-item groups. Metadata without layouts SHALL retain its existing representation. Public/admin content mutation payloads and entry/build-export content values SHALL contain no layout or UI state. Existing content create/save revision, validation, authorization and route-conflict rules SHALL remain unchanged.

#### Scenario: Round-trip recursive metadata
- **WHEN** metadata includes model tabs, block sections, a settings layout and nested list-item group layouts
- **THEN** JSON serialization and shared schema parsing preserve their order and options without functions or infrastructure imports

#### Scenario: Refuse malformed metadata
- **WHEN** metadata supplies unknown fields, duplicate placement, an unsupported mode or invalid nested references
- **THEN** shared response validation rejects it at the correct owner

#### Scenario: Keep content transport unchanged
- **WHEN** a draft is created, saved or published using configured layouts
- **THEN** content DTOs retain existing paths and data shapes without layout keys or selected-tab state

### Requirement: Public read contracts have strict and tolerant variants
The shared contract SHALL define every public read representation in two
variants derived from one definition: public entry, public global, public
block, public media item, media dictionary, entry SEO value, export SEO
section, the page/slug/path, global and collection responses, the build export
and the error envelope.

- The **strict** variant SHALL reject any object key the contract does not
  define, at every depth. The API SHALL validate every public response with it
  before sending, and it SHALL be the variant the generated OpenAPI document
  describes.
- The **tolerant** variant SHALL accept and remove object keys the contract
  does not define, at every depth, so its output contains exactly the defined
  keys.

Both variants SHALL enforce the same required keys, value types, defaults and
value constraints, including timestamp, identifier, media-dictionary keying and
title-length rules. Consumer-owned JSON values (entry `fields`, block `data`
and block `settings`) SHALL pass through unchanged in both variants.

A public block carrying a `hidden` key SHALL be rejected by both variants,
not stripped. In the tolerant error envelope, `error.code` SHALL accept any
non-empty string;
the strict variant SHALL accept only the defined codes. Request schemas and
admin DTO schemas SHALL remain strict and SHALL have no tolerant variant.

#### Scenario: A newer server adds a key
- **WHEN** a public entry payload carries an additional top-level key, an
  additional key inside a block and an additional key inside a media item
- **THEN** strict validation rejects the payload, and tolerant validation
  succeeds and yields the payload without the three additional keys

#### Scenario: A required key is missing
- **WHEN** a public entry payload lacks `publishedAt`, or a media item lacks
  `url`
- **THEN** both the strict and the tolerant variant reject it

#### Scenario: A defined key has the wrong type
- **WHEN** a public block carries `position: "1000"` or a media item carries
  `width: -1`
- **THEN** both variants reject it

#### Scenario: Consumer-owned JSON is preserved
- **WHEN** a public block's `data` holds keys unknown to the contract
- **THEN** both variants return `data` with those keys unchanged

#### Scenario: A hidden block reaches a consumer
- **WHEN** a public entry, global or export payload holds a block with
  `hidden: true` or `hidden: false`
- **THEN** both the strict and the tolerant variant reject the payload

#### Scenario: A newer server reports a new error code
- **WHEN** an error envelope carries `code: "FUTURE_CONDITION"`
- **THEN** the tolerant envelope accepts it with that code, and the strict
  envelope rejects it

### Requirement: The build export declares its format version
The build export SHALL carry a required `formatVersion`, a positive integer
that identifies the export's structure. The format version SHALL be `2` for
the structure defined by this contract. Adding an optional key or a key that
older consumers may ignore SHALL NOT change it. Removing a key, changing a
key's type, or changing the meaning of a value consumers rely on SHALL require
a new format version. The shared contract SHALL expose the highest format
version it defines as a constant. The strict build-export variant SHALL accept
only that current format version. The tolerant variant SHALL accept any
positive integer, so a consumer can recognize and report a newer format.

Format 2 SHALL require `internalLinks` arrays on delivered entries/globals;
format 1 compatibility SHALL remain available to tolerant consumer parsing for
old fixtures. This bump SHALL make old build SDKs fail before rendering an
unsupported field-target grammar. Generic public JSON fields retain their
transport representation; new reference strings require link-aware consumers.

#### Scenario: The current API sends an export
- **WHEN** a build client reads the export from either runtime
- **THEN** the response carries `formatVersion: 2`, and strict validation
  succeeds

#### Scenario: An export lacks the format version
- **WHEN** an export payload has no `formatVersion`, or carries `0` or `1.5`
- **THEN** both the strict and the tolerant build-export variants reject it

#### Scenario: An export declares a newer format
- **WHEN** an otherwise valid export payload carries `formatVersion: 3` while
  the contract's current format version is 2
- **THEN** the strict variant rejects it and the tolerant variant accepts it
  with `formatVersion: 3`

#### Scenario: Older builder cannot silently emit tokens
- **WHEN** a format-1-only SDK requests a new server's export
- **THEN** it rejects format 2 with its upgrade diagnostic before producing HTML

### Requirement: The build export is delivered in bounded keyset pages
`GET /api/v1/public/build-export` SHALL return one page of the export per
request. It SHALL accept two optional query parameters:

- `after`: an opaque cursor;
- `limit`: an integer from 1 to 100, default 100.

It SHALL reject any other query parameter, an invalid cursor or an invalid
limit with the shared validation error.

A request without `after` SHALL return the **first page**:
`{formatVersion, version, entries, globals, seo, media, nextCursor?}`.
A request with `after` SHALL return a **continuation page**:
`{formatVersion, version, entries, media, nextCursor?}`. A continuation page
SHALL carry neither `globals` nor `seo`.

Paging rules:

- `entries` SHALL be the routed public entries ordered by path, continuing
  strictly after the cursor's last path.
- The first page SHALL carry every published global and the export SEO
  section.
- `media` SHALL resolve exactly the media delivered by the entries and globals
  of that page.
- A page SHALL hold at most `limit` entries. It SHALL end before an entry
  would raise the page's stored entry JSON above the server's fixed byte
  budget. A page SHALL nevertheless hold at least one entry whenever entries
  remain after the cursor.
- `nextCursor` SHALL be present exactly when further entries remain.
- The cursor SHALL bind the published-state version of the page sequence and
  the last delivered path. Clients SHALL NOT need to decode it.
- A continuation request whose cursor version differs from the current
  published-state version SHALL fail with HTTP 409 and
  `BUILD_EXPORT_VERSION_CHANGED`, with details
  `{expectedVersion, actualVersion}`.
- Every page of one sequence SHALL carry the same `formatVersion` and
  `version`.

Where other requirements describe the build export's entries, globals,
media or SEO section, that content SHALL be the union of the pages of one
sequence. The page schemas SHALL exist in strict and tolerant variants under
the same rules as the other public read representations. The API SHALL
validate every page with the strict variant before sending it. The assembled
export `{formatVersion, version, entries, globals, media, seo}` SHALL remain a
shared schema for consumers and tests.

#### Scenario: A small site fits one page
- **WHEN** a build client reads the export of a site with three published
  entries and one published global, without `after`
- **THEN** the first page holds the three entries ordered by path, the
  global, the SEO section and their media, and has no `nextCursor`

#### Scenario: A site spans several pages
- **WHEN** a site has 250 published entries and the client reads with the
  default limit, following `nextCursor`
- **THEN** it receives three pages with 100, 100 and 50 entries in ascending
  path order, without repetition, and only the last page has no `nextCursor`

#### Scenario: Large entries end a page early
- **WHEN** the next entries' stored JSON would exceed the page byte budget
  before `limit` entries are collected
- **THEN** the page ends after the last entry within the budget, and an entry
  that alone exceeds the budget is delivered alone on its own page

#### Scenario: Content is published between pages
- **WHEN** a client holds a cursor from a version-7 first page and a
  publication advances the published state to version 8
- **THEN** the continuation request fails with HTTP 409
  `BUILD_EXPORT_VERSION_CHANGED` and details
  `{expectedVersion: 7, actualVersion: 8}`

#### Scenario: Media are scoped to their page
- **WHEN** only an entry on the second page references a media item
- **THEN** the first page's `media` omits the item and the second page's
  `media` resolves it

#### Scenario: Invalid paging input is rejected
- **WHEN** a client sends `limit=0`, `limit=101`, an `after` cursor from a
  collection list, or an unknown query parameter
- **THEN** the API returns the shared validation error and reads no content

### Requirement: Admin media deletion accepts a draft detach option
`DELETE /api/v1/admin/media/:mediaId` SHALL accept an optional `detach` query
parameter whose only valid value is `drafts`. Any other value, or a repeated
parameter, SHALL fail with `422` `VALIDATION_FAILED` at the issue path
`/detach` before any read. With `detach=drafts` the route SHALL request
deletion with the draft detach option; without the parameter it SHALL request
an ordinary deletion. Both forms SHALL answer an accepted request with `202`
and the media DTO, and SHALL report refusals with the existing stable error
pairs (`MEDIA_IN_USE` and `CONTENT_REVISION_CONFLICT` as `409`,
`AUTHORIZATION_DENIED` as `403`, `CONTENT_INVALID_STATE` as `422`). The
OpenAPI document SHALL describe the parameter.

#### Scenario: A detaching deletion is accepted
- **WHEN** an editor sends `DELETE /api/v1/admin/media/:mediaId?detach=drafts`
  for an image used only by drafts
- **THEN** the API returns `202` with the media DTO in status `deleting` and
  `usageCount` 0

#### Scenario: An unsupported detach value is rejected
- **WHEN** a client sends `detach=all`
- **THEN** the API returns `422` `VALIDATION_FAILED` with the issue path
  `/detach` and no draft or media changes

### Requirement: Admin internal link queries and receipts are strict and bounded
The authenticated API SHALL expose:
- `GET /api/v1/admin/link-targets` with optional `modelKey`, `status`, `search`
  (at most 100 characters), `after` and `limit` (1–50, default 20);
- `POST /api/v1/admin/link-targets/resolve` with `{ids}` containing at most 200
  distinct valid IDs, returning statuses keyed by ID without per-ID requests;
- `GET /api/v1/admin/entries/:entryId/link-impact` with `action` (`delete` or
  `unpublish`), `after` and `limit` (1–50, default 20); its location-page mode
  SHALL instead accept `sourceEntryId`, `snapshotId` and `locationsAfter` with
  `action`/`limit`, rejecting a mixture of source-page and location-page cursors.
Search SHALL be a documented normalized title-prefix search, not a site-wide
substring scan. Picker targets SHALL expose ID, model key/kind, display title,
publication status and current published path when present; globals SHALL be
excluded. Resolver states SHALL be `published`, `unpublished`, `missing` and
`non-routable`, without fabricating a missing title.
`status` SHALL accept only `published` or `unpublished`; omission SHALL include
both. Source-page responses SHALL use `mode: sources`, at most the requested
groups and at most 10 initial locations per group with `nextLocationsCursor`.
Location-page responses SHALL use `mode: locations` with at most `limit`
locations and their continuation. Receipts/cursors SHALL be at most 4096
characters. Search comparison SHALL trim the prefix and be ASCII case-insensitive
with non-ASCII characters matched exactly; SQL wildcard characters SHALL be
literal input rather than expanding the search.
Impact SHALL expose source groups by current snapshot phase/visibility, exact
locations through bounded location cursors, `hasPublishedUsages`, an opaque
impact receipt and continuation cursors. Both entity and location pages SHALL
be bounded. Cursors/receipts SHALL bind target, action and dependency revision;
an outdated page SHALL return 409 `CONTENT_LINK_IMPACT_CHANGED` rather than mix
sets. All reads require `content:read`; unknown keys, bad limits, malformed IDs
or foreign cursors SHALL fail strict validation before content reads.

#### Scenario: A highly linked target
- **WHEN** a target has 1,000 source entities and one source has 200 locations
- **THEN** the API exposes all entities and locations through bounded pages without returning the complete graph in one response

#### Scenario: Batch resolver and viewer
- **WHEN** a viewer resolves 200 IDs in one valid request
- **THEN** it returns their permitted statuses in one response and grants no mutation permission

### Requirement: Delete and unpublish accept an explicit link impact acknowledgment
Existing delete and unpublish requests SHALL accept optional
`linkImpact: {receipt, acknowledgePublishedLinks: true}` in their strict command
body. Delete SHALL retain its existing precondition transport, accepting an
optional strict JSON body without requiring one for unreferenced entries.
Unpublish SHALL retain its expected published snapshot and idempotency rules.
The receipt SHALL bind action, target, actor, existing target guards and incoming
dependency revision; it SHALL grant no authorization. Missing acknowledgment
when required SHALL return 409 `CONTENT_LINKS_IN_USE`; a stale/cross-target/
cross-action receipt SHALL return 409 `CONTENT_LINK_IMPACT_CHANGED`. Validation
and authorization errors SHALL remain sanitized. OpenAPI SHALL describe the
queries, DTOs, new issue/error codes and recovery.

#### Scenario: Legacy unreferenced request
- **WHEN** a valid existing client deletes or unpublishes an entry without published-visible incoming links and sends no new option
- **THEN** the command retains its existing response and precondition behavior

#### Scenario: A receipt cannot authorize another command
- **WHEN** a receipt for target A/unpublish is submitted for target B/delete
- **THEN** the request fails without any mutation

### Requirement: Published URL reference manifests describe only delivered locations
Published entry/global DTOs SHALL optionally carry `internalLinks`, an array of
`{sourceKey, area, pointer, targetId}` where area is `fields` or `data`.
New servers SHALL emit the array, including `[]`, on every returned
entry/global. Manifest locations SHALL exactly match canonical reference values
in delivered model/global URL fields and block data, excluding hidden blocks,
block settings and every other field kind. Values in `fields`, `data` and
`settings` SHALL remain authored values; reference tokens occur only at declared
ordinary URL locations in fields/data. No editorial metadata or target drafts SHALL
enter public responses. Strict and tolerant DTO variants SHALL validate the new
known property; format 1 input without it SHALL normalize to an empty array.
Single public reads SHALL return only local manifests and SHALL NOT fetch target
entries recursively. SDK/site consumers SHALL resolve explicitly before href
output; a string's transport type alone SHALL NOT assert that it is an href.

#### Scenario: Public visibility boundaries
- **WHEN** a published global has a visible nested URL reference and a hidden block reference
- **THEN** its public manifest includes only the visible location and contains no draft title or hidden block data

#### Scenario: Public read is independent of target fan-out
- **WHEN** a page references 200 distinct entries
- **THEN** reading that page returns its local manifest without 200 target requests
