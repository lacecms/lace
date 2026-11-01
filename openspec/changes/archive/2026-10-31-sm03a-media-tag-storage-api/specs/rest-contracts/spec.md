## MODIFIED Requirements

### Requirement: Admin media-list queries are validated and query-bound
The admin media-list route SHALL accept optional `q`, `type`, `sort`, `limit`,
`after` and repeated `tag` query parameters. Up to five `tag` values SHALL be
accepted; each SHALL be normalized like a media tag, and an item SHALL match
only when it carries every requested tag. `q` SHALL be trimmed; an empty result SHALL mean
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
parameter. A more-than-five tag list or an invalid tag SHALL fail with the
pointer `/tag` or `/tag/<index>`. A continuation cursor SHALL be accepted only
with the same search term, type, sort and normalized tag set that produced it; otherwise the request SHALL fail
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

#### Scenario: Filter the library by tags
- **WHEN** an editor requests `tag=Birch&tag=ibiza&sort=filename`
- **THEN** the response contains only items tagged both `birch` and `ibiza`, ordered by filename, and a cursor from it is refused with `tag=birch` alone

#### Scenario: Filter the library to GIF
- **WHEN** an editor requests `type=image/gif`
- **THEN** the response contains only GIF items

### Requirement: Admin media DTOs carry descriptive metadata
Every admin media DTO (list items, detail, upload, deletion, retry-deletion and
metadata update results) SHALL include the item's `alt` string, `caption`
string and `focalPoint` object `{x, y}` when each is set, and SHALL omit each
value that is not set. The values SHALL never be `null` in a response. Every admin media DTO SHALL
also include a required `tags` array of normalized tags in ascending order,
empty when the item has none. The
DTO's `updatedAt` SHALL keep millisecond precision, because it identifies the
version a writer edits.

#### Scenario: A described item is listed
- **WHEN** a viewer lists media that include an item with alt text and a focal
  point of `{x: 0.25, y: 0.75}` and no caption
- **THEN** that item's DTO contains `alt`, `focalPoint` with those coordinates,
    and no `caption` key, and its `tags` array lists its tags in ascending order
  or is empty

### Requirement: Admin media metadata update contract is explicit
The shared contract SHALL define the media metadata update request as a strict
JSON object with the optional keys `alt` (string or `null`, at most 1,000 code
points after trimming), `caption` (string or `null`, at most 2,000 code points
after trimming), `focalPoint` (`null` or a strict object with the finite
numbers `x` and `y`, each from 0 to 1 inclusive) and `tags` (an array of at
most 20 distinct normalized tags, each string at most 200 code points before
normalization, following the ASCII `[a-z0-9-]{1,40}` rules, replacing the complete set). The request SHALL contain at
least one key. Unknown keys, wrong types, out-of-range coordinates, over-long
text, control characters in `alt`, control characters other than line breaks
in `caption`, unpaired surrogates, invalid tags, more than 20 distinct tags and an empty object SHALL fail with `422`
`VALIDATION_FAILED` and JSON Pointer issue paths such as `/alt`,
`/focalPoint/x` or `/tags/3`.

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

#### Scenario: A tags-only update
- **WHEN** an editor sends `{"tags": ["Birch", "ibiza"]}` with the current tag in `If-Match`
- **THEN** the API returns `200` with `tags` `["birch", "ibiza"]`, build `{status: "not-dispatched"}` and a new `ETag`

#### Scenario: An empty update is rejected
- **WHEN** an editor sends `{}` with a valid `If-Match` tag
- **THEN** the request fails with `422` `VALIDATION_FAILED`

## ADDED Requirements

### Requirement: Admin media upload accepts optional tags
`POST /api/v1/admin/media` SHALL accept, in addition to the single `file` part,
zero to 20 text parts named `tags`, each holding one tag of at most 200 code
points before normalization. Any other part name, a file part named `tags`, an
invalid tag or more than 20 distinct normalized tags SHALL fail with `422`
`VALIDATION_FAILED` and a pointer `/tags/<index>` before any object is stored.
The created media DTO SHALL contain the normalized tags. Existing upload
limits, verification and responses SHALL be unchanged when no `tags` part is
sent. The generated OpenAPI document SHALL describe the multipart fields.

#### Scenario: Upload with tags
- **WHEN** an editor uploads a PNG with `tags` parts `Project-A` and `project-a`
- **THEN** the API returns `201` with `tags` `["project-a"]`

#### Scenario: Upload with an invalid tag stores nothing
- **WHEN** an editor uploads a valid image with a `tags` part containing a comma
- **THEN** the API returns `422` with pointer `/tags/0` and no media item or object exists afterwards

### Requirement: Admin media tag catalog is a bounded read
`GET /api/v1/admin/media/tags` SHALL require an authenticated session with
`content:read` and SHALL accept optional `q` (a tag prefix, normalized like a
tag, at most 40 code points after normalization), `limit` (1–100, default 50)
and `after`. It SHALL return `{items: [{tag, count}], nextCursor?}` in ascending
tag order, where `count` is a positive integer. A cursor SHALL be accepted only
with the same normalized `q`. Invalid parameters SHALL fail with `422`
`VALIDATION_FAILED` and a pointer naming the parameter. Node and Cloudflare SHALL
expose the same contract, and the generated OpenAPI document SHALL describe it.
The route SHALL be unavailable to MCP and build tokens.

#### Scenario: List tags with counts
- **WHEN** a viewer requests the catalog on a library with `birch` on four items and `ibiza` on two
- **THEN** the response lists `{tag: "birch", count: 4}` then `{tag: "ibiza", count: 2}`

#### Scenario: Unauthorized or token caller
- **WHEN** an unauthenticated caller, or a caller presenting only a build or MCP token, requests the catalog
- **THEN** the API refuses it with the existing authentication failure and returns no tags
