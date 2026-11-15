## MODIFIED Requirements

### Requirement: Node entry summaries derive state, totals, and editor names
The Node persistence adapter SHALL derive each admin entry summary's status by
comparing the current published snapshot's revision with the draft revision,
SHALL report the published snapshot's creation time as `publishedAt`, and SHALL
read `listValues` only from the requested list fields in the draft's stored
field values. It SHALL omit absent keys and non-scalar values. It SHALL resolve
the draft's current last editor display name from the Lace content actor
profile in the same read, falling back to `System` for `system:` actors and
`Unknown user` for missing users or blank names. It SHALL compute per-status totals for the model and search term
in one aggregate read, independent of the status filter and cursor. The search
SHALL bind the term as a query parameter and match it as a literal substring,
not as a pattern.

#### Scenario: Totals and status agree after publication and edit
- **WHEN** an entry is published and its draft is then saved again
- **THEN** its summary reports `changed` with the publication time, and the
  totals move it from `published` to `changed` without changing `all`

#### Scenario: Search terms are literal
- **WHEN** a search term contains `%`, `_`, or a quote character
- **THEN** only entries whose draft title or slug contains those characters
  literally match, and the term never changes the SQL statement

#### Scenario: A missing editor still has a name
- **WHEN** a draft's `updated_by` names an actor with no user record
- **THEN** the summary's `updatedBy.displayName` is `Unknown user` and the
  list read succeeds

### Requirement: Node media catalog reads filter, sort, and derive usage
The Node persistence adapter SHALL read media list pages with the requested
filename search, MIME-type filter, and sort in one bounded query. The search
SHALL bind the ASCII-folded term as a query parameter and match it as a literal
substring of the lowercased filename, never as a pattern. Pages SHALL be
ordered by creation time, case-insensitive filename, or byte size in the
requested direction and then by media ID in the same direction. A media cursor
SHALL be base64url-encoded versioned JSON whose kind binds the search term,
type, and sort. The adapter SHALL reject a malformed, unsupported, wrong-kind,
or wrong-typed media cursor before using any of its values as a query
parameter. The same read SHALL resolve each uploader's current display name
from the Lace content actor profile with the `System` and `Unknown user`
fallbacks, and SHALL
count each item's distinct using entries through the reference projection
joined to entry snapshots. A single-item usage read SHALL return the bounded
entry list with draft title, draft slug, derived entry status, and each
location's block type from the referencing snapshot's block. It SHALL use
set-based queries, not one query per entry or reference. When a deletion mark
or retry changes no row, the adapter SHALL report `MEDIA_IN_USE` if the item
still has the expected status and at least one reference, and
`CONTENT_INVALID_STATE` otherwise.

#### Scenario: Every media sort pages without gaps or duplicates
- **WHEN** a caller pages media one item at a time by creation time, filename,
  or size in either direction, including equal filenames, sizes, and creation
  times
- **THEN** the concatenated pages contain every matching item exactly once in
  the requested order

#### Scenario: Media search terms are literal
- **WHEN** a media search term contains `%`, `_`, or a quote character
- **THEN** only items whose filename contains those characters literally match,
  and the term never changes the SQL statement

#### Scenario: A media cursor for another query is rejected
- **WHEN** a caller supplies a media cursor issued for a different search term,
  type, sort, or cursor version, or a cursor whose sort value has the wrong type
- **THEN** the adapter rejects the request without reading a page

#### Scenario: Usage follows publication and draft edits
- **WHEN** an entry references an image, is published, and then saves a draft
  that removes the reference
- **THEN** the image's usage lists the entry with its location in `published`
  only and `usageCount` stays 1 until a later publication removes the reference

#### Scenario: A concurrent reference turns a refusal into in use
- **WHEN** a deletion mark finds that an active item gained a reference after
  it was last read
- **THEN** the adapter changes nothing, enqueues no deletion work, and reports
  `MEDIA_IN_USE`
