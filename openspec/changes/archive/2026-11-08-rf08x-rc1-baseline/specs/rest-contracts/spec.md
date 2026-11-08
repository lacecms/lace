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
send `globals` on the first page, and the first-page and assembled export
schemas SHALL require it.

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

### Requirement: Published URL reference manifests describe only delivered locations
Published entry/global DTOs SHALL optionally carry `internalLinks`, an array of
`{sourceKey, area, pointer, targetId}` where area is `fields` or `data`.
New servers SHALL emit the array, including `[]`, on every returned
entry/global. Manifest locations SHALL exactly match canonical reference values
in delivered model/global URL fields and block data, excluding hidden blocks,
block settings and every other field kind. Values in `fields`, `data` and
`settings` SHALL remain authored values; reference tokens occur only at declared
ordinary URL locations in fields/data. No editorial metadata or target drafts SHALL
enter public responses. Strict and tolerant DTO variants SHALL validate the
known property, and a delivered export entry/global without it SHALL be
rejected.
Single public reads SHALL return only local manifests and SHALL NOT fetch target
entries recursively. SDK/site consumers SHALL resolve explicitly before href
output; a string's transport type alone SHALL NOT assert that it is an href.

#### Scenario: Public visibility boundaries
- **WHEN** a published global has a visible nested URL reference and a hidden block reference
- **THEN** its public manifest includes only the visible location and contains no draft title or hidden block data

#### Scenario: Public read is independent of target fan-out
- **WHEN** a page references 200 distinct entries
- **THEN** reading that page returns its local manifest without 200 target requests

## REMOVED Requirements

### Requirement: Model DTOs and the build export describe SEO configuration
**Reason**: Exports from before format 2, `globals` and `seo` are no longer accepted (owner decision 11).
**Migration**: Replaced by "Model DTOs and the build export carry SEO configuration", which keeps the current behavior.

### Requirement: The build export declares its format version
**Reason**: Exports from before format 2, `globals` and `seo` are no longer accepted (owner decision 11).
**Migration**: Replaced by "The build export carries a required format version", which keeps the current behavior.

## ADDED Requirements

### Requirement: Model DTOs and the build export carry SEO configuration
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

The API SHALL always send `seo` on the first export page, and the first-page
and assembled export schemas SHALL require it.

#### Scenario: Export with SEO configuration
- **WHEN** `posts` declares `seo: { description: "excerpt" }`, `home` declares
  `seo: true` and `settings` declares `seoDefaults: { siteName: "siteName" }`
- **THEN** the export `seo` is
  `{models: {home: {description: null, image: null}, posts: {description: "excerpt", image: null}}, defaults: {modelKey: "settings", siteName: "siteName", titleTemplate: null, description: null, image: null}}`

#### Scenario: Export without the key
- **WHEN** an assembled export or first page without `seo` is parsed
- **THEN** both the strict and the tolerant variants reject it

### Requirement: The build export carries a required format version
The build export SHALL carry a required `formatVersion`, a positive integer
that identifies the export's structure. The format version SHALL be `2` for
the structure defined by this contract. Adding an optional key or a key that
older consumers may ignore SHALL NOT change it. Removing a key, changing a
key's type, or changing the meaning of a value consumers rely on SHALL require
a new format version. The shared contract SHALL expose the highest format
version it defines as a constant. The strict build-export variant SHALL accept
only that current format version. The tolerant variant SHALL accept the
current format version and any higher integer, so a consumer can recognize and
report a newer format, and SHALL reject a lower one.

Format 2 SHALL require `internalLinks` arrays on delivered entries/globals in
both variants. Generic public JSON fields retain their transport
representation; reference strings require link-aware consumers.

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

#### Scenario: A format 1 export is rejected
- **WHEN** a payload carries `formatVersion: 1`, with or without
  `internalLinks` manifests
- **THEN** both the strict and the tolerant build-export variants reject it
