## ADDED Requirements

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

## MODIFIED Requirements

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
