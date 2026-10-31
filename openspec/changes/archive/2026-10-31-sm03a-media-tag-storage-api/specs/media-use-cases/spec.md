## MODIFIED Requirements

### Requirement: Writers update media metadata with optimistic concurrency
The system SHALL provide a transport-neutral media metadata update use case
that requires `media:write` before any read. Its input SHALL name the media
item, the expected `updatedAt` of the version the writer edited, and any of
`alt`, `caption`, `focalPoint` and `tags`, where an omitted value stays
unchanged and `null` clears `alt`, `caption` or `focalPoint`. `tags` SHALL be
an array that replaces the item's complete tag set; an empty array removes
every tag. At least one value SHALL be supplied. Tags SHALL follow the media
tag normalization and limits.

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

Tags SHALL be stored in the same atomic mutation as the other values. A change
of tags alone SHALL never change the published-content version or build work.
When `alt`, `caption` or `focalPoint` change and a current published snapshot
of any entry references the item, the same atomic mutation SHALL increment the published-content version and enqueue or
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

#### Scenario: Tags change without a build
- **WHEN** an editor replaces the tags of an item that a published entry uses with `["Birch", "Ibiza "]` and the current `updatedAt`
- **THEN** the item stores the tags `birch` and `ibiza`, its `updatedAt` advances, and the result reports `not-dispatched` with the published-content version unchanged

#### Scenario: Combined update follows the descriptive rule
- **WHEN** an editor changes the caption and the tags of an item that a published entry uses in one update
- **THEN** both are stored in one mutation, and the published-content version increments once with one pending `media_metadata` build

#### Scenario: Tags are cleared
- **WHEN** an editor submits `tags: []` for an item with three tags
- **THEN** the item has no tags afterwards and its other values are unchanged

#### Scenario: An unchanged submission writes nothing
- **WHEN** an editor submits the alt text the item already stores, or a tag
  set equal to the stored set after normalization, with the current
  `updatedAt`, for an item that a published entry uses
- **THEN** nothing is written, `updatedAt` is unchanged, and the result
  reports `not-dispatched`

## ADDED Requirements

### Requirement: Media items carry normalized organizational tags
Every media item SHALL carry a set of zero to 20 tags for admin organization.
A tag SHALL reject control characters before trimming, trim surrounding spaces,
and convert ASCII A–Z to a–z. The result SHALL match `[a-z0-9-]{1,40}`:
only lowercase Latin ASCII letters, digits and the ordinary hyphen U+002D.
Internal spaces, non-ASCII characters, emoji, commas and other punctuation SHALL
be rejected. NFKC, transliteration and space-to-hyphen replacement SHALL NOT be
applied. Tags that are
equal after normalization SHALL count once. An input whose normalized distinct
tags exceed 20, or that contains an invalid tag, SHALL be rejected with
`CONTENT_INVALID_STATE` before any read, naming the offending position.
Uploading a new item SHALL accept an optional tag list with the same rules and
SHALL store it atomically with the new metadata; an invalid list SHALL be
rejected before any object is stored. Every media result of the list, get,
create, delete-request, retry-delete and metadata update use cases SHALL
include the item's tags sorted in ascending code-point order, as an empty list
when it has none. Tags SHALL never appear in public content, the build export,
published snapshots or MCP results, and SHALL not count as media usage.
Removing a media item's metadata after object deletion SHALL remove its tags
in the same atomic step.

#### Scenario: Normalization unifies variants
- **WHEN** an editor uploads an image with the tags `Readymag`, ` readymag ` and `Black-Friday`
- **THEN** the created item carries exactly `black-friday` and `readymag`

#### Scenario: Invalid tags are refused before storage
- **WHEN** an upload or update supplies 21 distinct tags, an empty tag, a tag of 41 code points, or a tag containing a comma or a line break
- **THEN** it fails with `CONTENT_INVALID_STATE` naming the position, and no object, metadata or tag is stored or changed

#### Scenario: Tags use only the selected ASCII alphabet
- **WHEN** an editor supplies `Выставка`, `ＲＥＡＤＹＭＡＧ`, `project summer`, an emoji, or a tag with a control character even at its edge
- **THEN** the request fails before any read or storage with the offending tag position

#### Scenario: ASCII normalization preserves hyphens and digits
- **WHEN** an editor supplies ` Project-2026 `
- **THEN** the normalized tag is `project-2026`

#### Scenario: Deleted media leave no tags
- **WHEN** deletion dispatch removes the metadata of a tagged item
- **THEN** none of its tags remain and catalog counts no longer include it

### Requirement: Media lists filter by tags and expose a tag catalog
The media list use case SHALL accept up to five tags, normalized like stored
tags; an item SHALL match only when it carries every requested tag, combined
with the existing search, type and sort. An unknown tag SHALL produce an empty
page, not an error. More than five tags or an invalid tag SHALL be rejected
before any read. A continuation SHALL be valid only with the same normalized
tag set, search, type and sort.

The system SHALL provide a tag catalog use case requiring `content:read` that
returns tags in ascending code-point order with the number of media items
carrying each, counting items in every lifecycle status until their metadata is
removed. It SHALL accept an optional prefix normalized like a tag and matched as
a literal prefix, a limit from 1 to 100 defaulting to 50, and a cursor valid only
with the same prefix. Tags without items SHALL not be listed. Viewers SHALL be
able to list, filter and read tags; only `media:write` SHALL change them.

#### Scenario: Filter by two tags
- **WHEN** a viewer lists media with the tags `birch` and `ibiza`, where three items carry both and two carry only `birch`
- **THEN** the page contains exactly the three items, in the requested sort order

#### Scenario: Catalog for autocomplete
- **WHEN** an editor reads the catalog with the prefix `Re`
- **THEN** it returns tags starting with `re` such as `readymag` with their counts, in ascending order, and no tag that only contains `re` elsewhere

#### Scenario: Too many filter tags
- **WHEN** a client lists media with six tags
- **THEN** the request is rejected before any media read
