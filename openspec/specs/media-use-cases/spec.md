# media-use-cases Specification

## Purpose

Defines portable, security-conscious media upload validation and metadata
lifecycle behavior while keeping binary objects outside the content database.

## Requirements

### Requirement: Image upload accepts only verified bounded raster formats
The system SHALL accept uploads no larger than 10 MiB only when their binary
content is exactly one well-formed JPEG, PNG, WebP, or AVIF image. It SHALL
derive the MIME type from the validated binary format rather than a filename or
caller-supplied header; reject SVG, empty or truncated inputs, malformed image
containers, polyglot/trailing executable content, and every other MIME type.
It SHALL sanitize a display filename to a non-empty safe text value and generate
an opaque, unique storage key that does not disclose that filename. The system
SHALL reject an image wider or taller than 12,000 pixels or containing more
than 100,000,000 total pixels. Every accepted upload SHALL record a positive
integer width and height, measured after the image's embedded orientation is
applied, so the recorded dimensions are the dimensions at which the image is
displayed.

#### Scenario: A valid verified image is accepted
- **WHEN** an authenticated writer uploads a complete 10 MiB-or-smaller JPEG,
  PNG, WebP, or AVIF whose decoded dimensions are within the configured limits
- **THEN** the upload is accepted with the binary-derived MIME type, sanitized
  display filename, opaque storage key, and recorded image dimensions

#### Scenario: A rotated photo records display dimensions
- **WHEN** a writer uploads a JPEG whose stored pixels are 400 wide and 200
  high and whose EXIF orientation rotates it by 90 degrees
- **THEN** the created media records width 200 and height 400

#### Scenario: Filename or MIME spoofing cannot bypass validation
- **WHEN** an upload claims an allowed MIME type or extension but its bytes are
  SVG, another format, malformed, empty, truncated, or polyglot content
- **THEN** the upload is rejected before object storage or metadata persistence

#### Scenario: An oversized image is rejected
- **WHEN** an otherwise valid image exceeds the byte limit, either per-side
  dimension limit, or total pixel limit
- **THEN** the upload is rejected without storing an object or metadata row

### Requirement: Object and metadata creation preserve a recoverable boundary
The system SHALL write a verified binary object before creating its media
metadata. A successful metadata record SHALL contain only its identity, opaque
storage key, sanitized display filename, binary-derived MIME type, byte size,
optional image dimensions, active status, actor, and timestamps; it SHALL NOT
contain binary bytes. If metadata creation fails after an object write, the
system SHALL make a best-effort attempt to delete that object, return a failure,
and record an operational error that identifies the opaque storage key without
including the binary payload or caller secrets.

#### Scenario: Object write precedes active metadata
- **WHEN** a verified upload completes successfully
- **THEN** the object exists before its active metadata becomes observable and
  the stored metadata contains no binary payload

#### Scenario: Metadata persistence fails after an object write
- **WHEN** storage accepts a verified object but metadata creation fails
- **THEN** no active media record is returned, the system attempts cleanup of
  the opaque storage key, and an operational error is recorded for diagnosis

### Requirement: Authorized media lifecycle operations are storage-neutral
The system SHALL provide transport-neutral create, list, get, delete-request,
and retry-delete media use cases. Create, delete-request, and retry-delete
SHALL require `media:write`; list and get SHALL require `content:read`.
List SHALL accept an optional filename search term, an optional MIME-type
filter, and a sort. The search term SHALL be trimmed, an empty term SHALL mean
no search, and a term longer than 200 characters SHALL be rejected before any
read. A search SHALL match filenames containing the term, case-insensitively
for ASCII letters. The type filter SHALL be one of the allowed image MIME
types. The sort SHALL be `createdAt`, `filename`, or `size`, ascending or
descending, defaulting to newest first. Each list, get, create, and deletion
result SHALL name its uploader with an ID and a display name, using `System`
for `system:` actors and `Unknown user` for an ID without a user record, and
SHALL carry the item's `usageCount`. Get SHALL also return the item's usage.
Delete-request and retry-delete SHALL operate on metadata lifecycle state and
MUST NOT synchronously delete the binary object; asynchronous deletion dispatch
remains responsible for removal. A delete-request or retry-delete for an item
that content still references SHALL fail with the stable `MEDIA_IN_USE` error;
any other ineligible item SHALL fail with `CONTENT_INVALID_STATE`. Results SHALL
be detached portable metadata and SHALL never expose an internal storage key to
transport consumers.

#### Scenario: A viewer can inspect but cannot mutate media
- **WHEN** a viewer lists or gets media and then requests an upload or deletion
- **THEN** the read returns portable metadata while each mutation fails with the
  stable authorization error before storage or persistence changes

#### Scenario: A deletion request is recoverable
- **WHEN** a writer requests deletion of an unreferenced active item or retries
  an item whose prior deletion has failed
- **THEN** the use case records the requested deletion lifecycle transition and
  returns its updated metadata without deleting the binary synchronously

#### Scenario: A referenced item is refused as in use
- **WHEN** a writer requests deletion or retries deletion of an item that an
  entry's draft or published snapshot references
- **THEN** the request fails with `MEDIA_IN_USE`, the item keeps its status,
  and no deletion work is queued

#### Scenario: An invalid list query is rejected before reading
- **WHEN** a caller lists media with a 201-character search term, an
  unsupported type, or an unsupported sort
- **THEN** the use case rejects the request and performs no media read

#### Scenario: The uploader is named without the users API
- **WHEN** a viewer lists media uploaded by an editor whose user record has the
  name `Ada`
- **THEN** each item names its uploader with that editor's ID and display name
  `Ada`

### Requirement: Authorized binary reads preserve media lifecycle boundaries
The system SHALL resolve a media binary only after the caller has selected an
active metadata record through an authorized admin read or a published-media
read. The binary-read result SHALL retain the verified media MIME type and
bounded byte stream while never exposing the storage key, bucket identity, or
storage credentials. A missing stored object for otherwise eligible metadata
SHALL be an operational failure, not an empty successful media result.

#### Scenario: An eligible media item is read
- **WHEN** an authorized caller requests the binary for active media selected by
  the applicable metadata boundary
- **THEN** the system returns its verified MIME type and object stream without
  revealing its internal object location

#### Scenario: Metadata and object storage disagree
- **WHEN** eligible active media has no corresponding object in storage
- **THEN** the binary read fails as an operational error and does not return an
  empty object as though it were the uploaded media

### Requirement: Media object deletion is asynchronously recoverable
The system SHALL process a requested media deletion only through durable
asynchronous dispatch. It SHALL idempotently delete the private object before
removing the corresponding `deleting` metadata record, and SHALL never remove
metadata before that object deletion succeeds or is confirmed absent. After the
configured final failed attempt, it SHALL retain the media as `delete_failed`
with a sanitized diagnosable failure; an authorized retry SHALL return it to
the requested-deletion lifecycle only if it remains unreferenced.

#### Scenario: Object deletion completes successfully
- **WHEN** a dispatcher processes an eligible deleting media item and object
  storage reports deletion success or absence
- **THEN** the private object is no longer reachable and its deleting metadata
  record and completed deletion event are removed atomically from future work

#### Scenario: Storage remains unavailable
- **WHEN** an eligible deleting media item reaches the configured final failed
  dispatch attempt because object storage remains unavailable
- **THEN** its metadata remains available to an authorized administrator as
  `delete_failed`, contains no raw storage error, and can be retried without
  synchronously deleting its object

#### Scenario: A newly committed reference blocks finalization
- **WHEN** a media-deletion event is claimed and a valid content save commits a
  new reference before deletion metadata is finalized
- **THEN** the finalization does not remove the referenced metadata and the
  event remains recoverable or visible as a safe failure

### Requirement: Media usage is derived from the content reference projection
The system SHALL derive a media item's usage only from the relational
media-reference projection that the deletion guard also checks. An entry SHALL
count as using an item when its current draft snapshot or its current published
snapshot references the item in an entry field or in a block field. Every media
read result SHALL carry `usageCount`, the number of distinct entries using the
item. A single-item read SHALL also return up to 50 using entries, ordered by
entry update time descending and then entry ID descending. Each entry SHALL
report its ID, model key, draft title, draft slug when present, and derived
entry status (`draft`, `published`, or `changed`). Each entry SHALL list every
location that references the item: an entry field, or a block's field together
with the block's key and type. Each location SHALL say whether the draft, the
published snapshot, or both reference it. `usageCount` SHALL remain the full
count when the returned list is truncated. A media item SHALL be refused
deletion exactly when its `usageCount` is greater than zero.

#### Scenario: Draft and published usage are distinguished
- **WHEN** an entry's published snapshot uses an image in a hero block and its
  newer draft has replaced that image with another
- **THEN** the first image reports that entry with the block location marked
  published only, and the second image reports it marked draft only

#### Scenario: One entry with several references counts once
- **WHEN** one entry references the same image in an entry field and in two
  block fields
- **THEN** the image's `usageCount` is 1 and its usage lists that entry once
  with three locations

#### Scenario: Usage guidance agrees with the deletion guard
- **WHEN** a writer requests deletion of an item whose `usageCount` is 1
- **THEN** the request is refused as in use, and after the entry stops
  referencing the item in both its draft and published snapshots, `usageCount`
  is 0 and the deletion request is accepted

#### Scenario: A heavily used item is truncated
- **WHEN** 60 entries use one image
- **THEN** its single-item read returns 50 entries and `usageCount` 60

### Requirement: Media items carry optional descriptive metadata
Every media item SHALL carry three optional descriptive values in addition to
its technical metadata: `alt`, a plain-text alternative text of at most 1,000
characters; `caption`, a plain-text caption of at most 2,000 characters; and
`focalPoint`, a pair `{x, y}` of finite numbers each from 0 to 1 inclusive,
where `{0, 0}` is the top-left corner of the displayed image. A value that is
not set SHALL be absent. Lengths SHALL be counted in Unicode code points.
Uploading a new item SHALL leave all three values absent. Every media result
of the list, get, create, delete-request, retry-delete and metadata update use
cases SHALL include the values that are set. Descriptive metadata SHALL be
stored once per media item and shared by every usage of that item.

#### Scenario: A new upload has no descriptive metadata
- **WHEN** an editor uploads a valid image
- **THEN** the created media result has no `alt`, `caption` or `focalPoint`

#### Scenario: Results describe stored metadata
- **WHEN** a viewer lists or gets an item whose alt text and focal point are
  set and whose caption is not
- **THEN** the result contains the stored `alt` and `focalPoint` and no
  `caption`

### Requirement: Writers update media metadata with optimistic concurrency
The system SHALL provide a transport-neutral media metadata update use case
that requires `media:write` before any read. Its input SHALL name the media
item, the expected `updatedAt` of the version the writer edited, and any of
`alt`, `caption` and `focalPoint`, where an omitted value stays unchanged and
`null` clears the value. At least one value SHALL be supplied.

Text values SHALL be validated as plain text. Leading and trailing whitespace
SHALL be removed and a value that is empty after trimming SHALL clear the
stored value. The alt text SHALL contain no control characters, including
line breaks. The caption SHALL normalize `CRLF` and `CR` line breaks to `LF`
and SHALL contain no other control characters. Neither value SHALL contain
unpaired surrogate code points. Markup in a value SHALL be stored verbatim as
text and never interpreted. The focal point SHALL be `null` or an object with
exactly the finite numbers `x` and `y`, each from 0 to 1 inclusive. An invalid
input SHALL be rejected with `CONTENT_INVALID_STATE` before any read.

An unknown media item SHALL produce a not-found result. Only an `active` item
SHALL be editable; an item that is `deleting` or `delete_failed` SHALL be
refused with `CONTENT_INVALID_STATE`. When the expected `updatedAt` differs
from the stored one, the update SHALL fail with `MEDIA_UPDATE_CONFLICT` and
change nothing. When the normalized values equal the stored values, the use
case SHALL write nothing and return the current item with the build outcome
`not-dispatched`. Otherwise it SHALL store the new values and set `updatedAt`
to the later of the current time and the expected `updatedAt` plus one
millisecond, so that every committed change produces a new `updatedAt`.

When a current published snapshot of any entry references the item, the same
atomic mutation SHALL increment the published-content version and enqueue or
coalesce a site build with the reason `media_metadata`, the editing actor as
requester and no publication snapshot; the result SHALL report the build
outcome `queued` with the target version. When only drafts reference the item,
or nothing does, the mutation SHALL change neither the published-content
version nor build work, and the result SHALL report `not-dispatched`.
Published snapshots SHALL never be modified by a metadata update.

#### Scenario: A viewer cannot edit metadata
- **WHEN** a viewer updates the alt text of an active item
- **THEN** the update fails with `AUTHORIZATION_DENIED` and nothing is read
  or written

#### Scenario: An editor sets alt text on an unused item
- **WHEN** an editor sets the alt text `  Red bicycle  ` on an active item that
  no entry uses, with the item's current `updatedAt`
- **THEN** the item stores `Red bicycle`, its `updatedAt` advances, and the
  result reports `not-dispatched` with the published-content version unchanged

#### Scenario: Metadata of published media goes live on the next build
- **WHEN** an editor changes the caption of an item that a published entry
  uses
- **THEN** in one atomic mutation the caption is stored, the
  published-content version increments once, and one pending build with the
  reason `media_metadata` carries the new target version, and the result
  reports `queued` with that version

#### Scenario: Draft-only usage requests no build
- **WHEN** an editor changes the focal point of an item that only an
  unpublished draft uses
- **THEN** the focal point is stored and neither the published-content
  version nor build work changes

#### Scenario: A stale edit is refused
- **WHEN** two writers read the same item and both submit alt text with the
  `updatedAt` they read
- **THEN** the first update commits and the second fails with
  `MEDIA_UPDATE_CONFLICT`, leaving the first writer's values in place

#### Scenario: Clearing a value
- **WHEN** an editor submits `caption: null` and `alt: "   "` for an item that
  has both values
- **THEN** both values are absent afterwards and the focal point is unchanged

#### Scenario: Invalid values are rejected before reading
- **WHEN** an editor submits a focal point `{x: 1.2, y: 0.5}`, an alt text of
  1,001 code points, an alt text containing a line break, or a caption
  containing a tab
- **THEN** the update fails with `CONTENT_INVALID_STATE` and no media read or
  write occurs

#### Scenario: Media being deleted cannot be edited
- **WHEN** an editor updates an item whose status is `deleting` or
  `delete_failed`
- **THEN** the update fails with `CONTENT_INVALID_STATE` and nothing changes

#### Scenario: An unchanged submission writes nothing
- **WHEN** an editor submits the alt text the item already stores, with the
  current `updatedAt`, for an item that a published entry uses
- **THEN** nothing is written, `updatedAt` is unchanged, and the result
  reports `not-dispatched`
