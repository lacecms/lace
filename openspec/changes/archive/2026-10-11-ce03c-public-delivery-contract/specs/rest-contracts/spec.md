## ADDED Requirements

### Requirement: Public content responses return published entries
Public page, collection-slug and path reads SHALL return `{entry, media}`, the
public collection read SHALL return `{items, media, nextCursor?}`, and the
build export SHALL return `{entries, media, version}`. Each public entry SHALL
be exactly `{id, modelKey, path, slug?, title, fields, blocks, publishedAt}`,
taken only from the entry's current published snapshot: `slug` SHALL be absent
when the snapshot has none, `publishedAt` SHALL be the ISO-8601 UTC creation
time of the published snapshot, and `blocks` SHALL keep the block DTO shape
(`key`, `type`, `schemaVersion`, `position`, `data`) ordered by position. Public
responses SHALL NOT contain `draft`, `published`, `model`, revision, editor or
other editorial keys, and contract validation SHALL reject unknown keys. Both
runtimes SHALL return the same shape. Each public entry route SHALL document
its 200 response schema in the generated OpenAPI document.

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

### Requirement: Public content responses resolve referenced media
Every public content response SHALL carry a `media` object keyed by media ID
containing exactly one item for every media ID referenced by the returned
entries' published snapshots, according to the content reference projection,
and no other item. Each item SHALL be
`{id, url, mimeType, width, height, alt, caption, focalPoint}` where `id`
equals its key, `url` is the public media URL built from the API's public base
URL, `width` and `height` are positive integers or `null`, `alt` and `caption`
are the media item's descriptive text or `null`, and `focalPoint` is
`{x, y}` with each value from 0 to 1 or `null`. Dictionary keys SHALL be
serialized in ascending code-unit order. Field and block values SHALL keep
storing media IDs. Responses SHALL never expose storage keys, filenames,
uploader identity or media lifecycle status. Contract validation SHALL reject a
dictionary item whose `id` differs from its key.

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

#### Scenario: Metadata of published media changes
- **WHEN** a writer edits the alt text of media referenced by a current
  publication and a build client revalidates the export with the former ETag
- **THEN** the API returns 200 with a new ETag and the export's `media`
  dictionary carries the new alt text
