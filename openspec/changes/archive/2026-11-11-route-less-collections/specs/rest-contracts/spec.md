## ADDED Requirements

### Requirement: Route-less collections have explicit admin and public contracts
The admin content-model DTO SHALL accept `kind: "collection"` without `route`,
and contract validation SHALL reject a route-less collection DTO carrying
`path` or `seo`. Admin entry DTOs of a route-less collection SHALL carry
`model: {kind: "collection", key}` and no slug. `GET
/api/v1/public/records/:modelKey` SHALL be an anonymous public read with the
optional `after` and `limit` parameters of the public collection read,
returning `{items, media, nextCursor?}`. Each item SHALL be a public record,
exactly `{id, modelKey, title, fields, blocks, publishedAt}` from the entry's
current published snapshot, with the block shape and ordering of public
entries and no path, slug, SEO, draft or editorial key. Items SHALL be ordered
by publication time descending, then entry ID descending, and `media` SHALL be
the public media dictionary of the page's records. The route SHALL return
`404 NOT_FOUND` when the key is malformed, names no configured model, or names
a page, a global or a collection that declares a route. The public collection
list and collection-slug reads SHALL return `404 NOT_FOUND` for a route-less
collection, and no path read SHALL return a route-less entry. A build-export
record SHALL be a public record with its `internalLinks` manifest. Adding
`records` SHALL keep the build export at `formatVersion: 2`. The route SHALL
document its 200 response schema in the generated OpenAPI document, and both
runtimes SHALL return the same shape.

#### Scenario: Published records are read
- **WHEN** an anonymous client reads `/api/v1/public/records/testimonials`
  after two testimonials were published, the second one later
- **THEN** the response lists the second testimonial first, each with title,
  fields, ordered blocks and publication time, no path or slug, and the
  resolved media

#### Scenario: Records of a routed model
- **WHEN** a client reads `/api/v1/public/records/posts` where `posts` declares
  a route, or `/api/v1/public/collections/testimonials`
- **THEN** both responses are `404 NOT_FOUND`

#### Scenario: A route-less model DTO
- **WHEN** an authenticated client lists content models including
  `testimonials`
- **THEN** its DTO has `kind: "collection"`, its list metadata, and no `path`,
  `route` or `seo`

## MODIFIED Requirements

### Requirement: Public content responses return published entries
Public page, collection-slug and path reads SHALL return `{entry, media}`, and
the public collection read SHALL return `{items, media, nextCursor?}`. The
build export SHALL return pages whose assembled content is
`{formatVersion, entries, records, globals, media, seo, version}`. Each public entry
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
only routed entries, its `records` SHALL contain every published entry of a
route-less collection as a public record, and its first page's `globals` SHALL
contain every published global as a public global ordered by model key. The
API SHALL always send `globals` on the first page, and the first-page and
assembled export schemas SHALL require it. The API SHALL always send `records`
on every page; the strict page and assembled export variants SHALL require it,
and the tolerant variants SHALL treat a missing `records` as an empty list.

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
- **THEN** both the strict and the tolerant first-page variants and the
  assembled export schema reject it, because an export always carries both

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

#### Scenario: The export carries records
- **WHEN** a build client reads the export of a site with a published page,
  two published entries of the route-less `testimonials` collection and one
  unpublished `testimonials` draft
- **THEN** `entries` contains the page only, `records` contains the two
  published testimonials and no draft, and `media` resolves the media of all
  three

#### Scenario: A tolerant consumer reads an export without records
- **WHEN** a consumer validates a format 2 export page without `records` with
  the tolerant variant
- **THEN** validation succeeds with an empty `records` list, while the strict
  variant rejects the page

### Requirement: The build export is delivered in bounded keyset pages
`GET /api/v1/public/build-export` SHALL return one page of the export per
request. It SHALL accept two optional query parameters:

- `after`: an opaque cursor;
- `limit`: an integer from 1 to 100, default 100.

It SHALL reject any other query parameter, an invalid cursor or an invalid
limit with the shared validation error.

A request without `after` SHALL return the **first page**:
`{formatVersion, version, entries, records, globals, seo, media, nextCursor?}`.
A request with `after` SHALL return a **continuation page**:
`{formatVersion, version, entries, records, media, nextCursor?}`. A continuation page
SHALL carry neither `globals` nor `seo`.

Paging rules:

- `entries` SHALL be the routed public entries ordered by path, continuing
  strictly after the cursor's last path.
- `records` SHALL be the published entries of route-less collections ordered
  by model key and then entry ID. A page SHALL deliver records only after the
  last routed entry has been delivered, on that page or an earlier one, and
  SHALL continue strictly after the cursor's last record.
- The first page SHALL carry every published global and the export SEO
  section.
- `media` SHALL resolve exactly the media delivered by the entries, records
  and globals of that page.
- A page SHALL hold at most `limit` entries and records together. It SHALL
  end before an entry or record would raise the page's stored JSON above the
  server's fixed byte budget. A page SHALL nevertheless hold at least one
  entry or record whenever any remain after the cursor.
- `nextCursor` SHALL be present exactly when further entries or records
  remain.
- The cursor SHALL bind the published-state version of the page sequence and
  the last delivered path, or the model key and entry ID of the last
  delivered record. Clients SHALL NOT need to decode it.
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
export `{formatVersion, version, entries, records, globals, media, seo}` SHALL remain a
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

#### Scenario: Records continue after the routed entries
- **WHEN** a site has 150 routed entries and 80 records and the client reads
  with the default limit, following `nextCursor`
- **THEN** the first page holds 100 entries, the second holds the remaining 50
  entries followed by 50 records, the third holds 30 records, and records
  appear in model key and entry ID order without repetition

#### Scenario: A site with only records
- **WHEN** a site has no routed entries and three records
- **THEN** the first page holds empty `entries`, the three records, the
  globals and the SEO section, and has no `nextCursor`

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
publication status and current published path when present; globals and
entries of route-less collections SHALL be excluded, also when `modelKey`
names a route-less collection. Resolver states SHALL be `published`, `unpublished`, `missing` and
`non-routable`, without fabricating a missing title; globals and entries of
route-less collections SHALL resolve as `non-routable`.
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

#### Scenario: Route-less entries are not picker targets
- **WHEN** an editor lists link targets without a model filter, or with
  `modelKey=testimonials` naming a route-less collection
- **THEN** no entry of a route-less collection is returned, and resolving the
  ID of a testimonial returns `non-routable` with its model key
