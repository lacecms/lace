## MODIFIED Requirements

### Requirement: Public content responses return published entries
Public page, collection-slug and path reads SHALL return `{entry, media}`, the
public collection read SHALL return `{items, media, nextCursor?}`, and the
build export SHALL return `{entries, globals, media, version}`. Each public
entry SHALL be exactly `{id, modelKey, path, slug?, title, fields, blocks,
publishedAt}`, taken only from the entry's current published snapshot: `slug`
SHALL be absent when the snapshot has none, `publishedAt` SHALL be the
ISO-8601 UTC creation time of the published snapshot, and `blocks` SHALL hold
the visible blocks only, ordered by position, each as the public block DTO
`{key, type, schemaVersion, position, anchor?, className?, settings, data}`.
A public block SHALL carry `anchor` and `className` only when set and SHALL
never carry `hidden`. Contract validation SHALL treat a missing `settings` key
as `{}`; the API SHALL always send it. The export's `entries` SHALL contain
only routed entries and `globals` SHALL contain every published global as a
public global ordered by model key. Contract validation SHALL treat a missing
`globals` key as an empty list so that exports produced before globals existed
stay valid; the API SHALL always send it. Public responses SHALL NOT contain
`draft`, `published`, `model`, revision, editor or other editorial keys, and
contract validation SHALL reject unknown keys. Both runtimes SHALL return the
same shape. Each public entry route SHALL document its 200 response schema in
the generated OpenAPI document.

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
- **THEN** contract validation rejects it

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
  carries `hidden` is rejected

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

## ADDED Requirements

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
