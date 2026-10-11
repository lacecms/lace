## MODIFIED Requirements

### Requirement: Content-model DTOs carry list fields
The admin content-model DTO SHALL include a collection's `listFields` in
declared order when the configuration declares them and SHALL omit the property
otherwise. Shared contract validation SHALL reject `listFields` on a page or
global model and a `listFields` array that is empty, repeats a name, or names a
field absent from the model's field map.

#### Scenario: The admin reads list columns from configuration
- **WHEN** an authenticated client lists content models for a configuration
  whose `posts` collection declares `listFields` `["category", "author"]`
- **THEN** the `posts` DTO contains that array and a model without list fields
  has no `listFields` property

#### Scenario: A malformed model DTO is rejected
- **WHEN** a model DTO declares `listFields` on a page or a global, or names an
  undeclared field
- **THEN** shared contract validation rejects the payload

### Requirement: Public content responses return published entries
Public page, collection-slug and path reads SHALL return `{entry, media}`, the
public collection read SHALL return `{items, media, nextCursor?}`, and the
build export SHALL return `{entries, globals, media, version}`. Each public
entry SHALL be exactly `{id, modelKey, path, slug?, title, fields, blocks,
publishedAt}`, taken only from the entry's current published snapshot: `slug`
SHALL be absent when the snapshot has none, `publishedAt` SHALL be the
ISO-8601 UTC creation time of the published snapshot, and `blocks` SHALL keep
the block DTO shape (`key`, `type`, `schemaVersion`, `position`, `data`)
ordered by position. The export's `entries` SHALL contain only routed entries
and `globals` SHALL contain every published global as a public global ordered
by model key. Contract validation SHALL treat a missing `globals` key as an
empty list so that exports produced before globals existed stay valid; the API
SHALL always send it. Public responses SHALL NOT contain `draft`, `published`,
`model`, revision, editor or other editorial keys, and contract validation
SHALL reject unknown keys. Both runtimes SHALL return the same shape. Each
public entry route SHALL document its 200 response schema in the generated
OpenAPI document.

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

## ADDED Requirements

### Requirement: Global models have explicit admin and public contracts
The admin content-model DTO SHALL accept `kind: "global"` without `path` or
`route`, and contract validation SHALL reject a global model DTO carrying
either. Admin entry DTOs of a global SHALL carry `model: {kind: "global",
key}`. `GET /api/v1/public/globals/:modelKey` SHALL be an anonymous public read
returning `{global, media}`, where `global` is exactly `{id, modelKey, fields,
blocks, publishedAt}` from the global's current published snapshot, with the
block shape and ordering of public entries and no path, slug, title, draft or
editorial key, and `media` is the public media dictionary of that snapshot. The
route SHALL return `404 NOT_FOUND` when the key is malformed, names no
configured model, names a page or collection, or names a global without a
publication. Admin delete and duplicate requests for a global entry SHALL
return `409 CONTENT_PAGE_SINGLETON`. The route SHALL document its 200 response
schema in the generated OpenAPI document.

#### Scenario: A published global is read
- **WHEN** an anonymous client reads `/api/v1/public/globals/settings` after
  the `settings` global was published with a media field
- **THEN** the response is `{global, media}` with the published fields and
  ordered blocks, the publication time and the resolved media item, and no
  path, slug or title

#### Scenario: An unpublished or non-global key
- **WHEN** a client reads the globals route for an unpublished global, an
  unknown key, or the key of a published page
- **THEN** the response is `404 NOT_FOUND`

#### Scenario: A global model DTO
- **WHEN** an authenticated client lists content models including the
  `settings` global
- **THEN** its DTO has `kind: "global"` and no `path`, `route` or `listFields`

#### Scenario: Deleting a global over HTTP
- **WHEN** an administrator sends `DELETE /api/v1/admin/entries/:id` for a
  global entry
- **THEN** the response is `409 CONTENT_PAGE_SINGLETON` and the entry remains
