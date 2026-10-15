## ADDED Requirements

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
that identifies the export's structure. The format version SHALL be `1` for
the structure defined by this contract. Adding an optional key or a key that
older consumers may ignore SHALL NOT change it. Removing a key, changing a
key's type, or changing the meaning of a value consumers rely on SHALL require
a new format version. The shared contract SHALL expose the highest format
version it defines as a constant. The strict build-export variant SHALL accept
only that current format version. The tolerant variant SHALL accept any
positive integer, so a consumer can recognize and report a newer format.

#### Scenario: The current API sends an export
- **WHEN** a build client reads the export from either runtime
- **THEN** the response carries `formatVersion: 1`, and strict validation
  succeeds

#### Scenario: An export lacks the format version
- **WHEN** an export payload has no `formatVersion`, or carries `0` or `1.5`
- **THEN** both the strict and the tolerant build-export variants reject it

#### Scenario: An export declares a newer format
- **WHEN** an otherwise valid export payload carries `formatVersion: 2` while
  the contract's current format version is 1
- **THEN** the strict variant rejects it and the tolerant variant accepts it
  with `formatVersion: 2`

## MODIFIED Requirements

### Requirement: Public content responses return published entries
Public page, collection-slug and path reads SHALL return `{entry, media}`, the
public collection read SHALL return `{items, media, nextCursor?}`, and the
build export SHALL return `{formatVersion, entries, globals, media, seo,
version}`. Each public entry SHALL be exactly `{id, modelKey, path, slug?,
title, fields, blocks, publishedAt, seo?}`, taken only from the entry's
current published snapshot:

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
only routed entries, and `globals` SHALL contain every published global as a
public global ordered by model key. Contract validation SHALL treat a missing
`globals` key as an empty list; the API SHALL always send it.

Public responses SHALL NOT contain `draft`, `published`, `model`, revision,
editor or other editorial keys. The strict contract variant SHALL reject
unknown keys. The tolerant variant SHALL remove them, so a tolerant parse
never yields an editorial key either. Both runtimes SHALL return the same
shape. Each public entry route SHALL document its 200 response schema in the
generated OpenAPI document.

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
- **THEN** `entries` contains the page only, `globals` contains the global, and
  `media` resolves the media of both

#### Scenario: An export without globals is validated
- **WHEN** a client validates an export payload that has no `globals` key
- **THEN** validation succeeds and yields an empty `globals` list

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
