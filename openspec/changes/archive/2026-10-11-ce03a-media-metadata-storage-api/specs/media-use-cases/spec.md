## ADDED Requirements

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
