## ADDED Requirements

### Requirement: Content repositories resolve audit actors through Lace profiles

Content entry lists, explicit editor descriptions and media list and detail
reads SHALL resolve the current display name by the stored actor ID through
the Lace-owned content actor projection. Snapshot hydration and publication
results SHALL resolve the actor's current role through the same projection.
Content repositories SHALL preserve the stored actor IDs and the existing
fallbacks. Missing or blank names SHALL resolve to `System` for a `system:`
ID or `Unknown user` otherwise. A missing role SHALL resolve to `viewer`.
Both SQLite modes and local D1 SHALL exercise the same cases. Actor resolution
SHALL preserve existing read and mutation budgets and the visibility and
authorization boundaries of each operation.

#### Scenario: A name or role changes after content was saved
- **WHEN** a security account changes its display name or role after uploading
  media or creating a draft or publication
- **THEN** the next authorized editor and media reads show the new display name
  and the next hydrated snapshot carries the current role, with the stored
  actor IDs, content revisions, public-state version and build queue intact

#### Scenario: Attribution survives account deletion or system writes
- **WHEN** reads encounter an actor with a deleted account, a blank display
  name or a system actor with no profile
- **THEN** the reads return the original actor IDs with the corresponding
  fallback values and the entries and media remain available

#### Scenario: A page contains many different actors
- **WHEN** a maximum-size collection or media page includes different actors
  on its rows, or the build export hydrates a full page with globals
- **THEN** the reads retain their existing statement and bind bounds
  independent of actor count and require no per-actor queries

### Requirement: Public repository reads preserve published snapshots and media
The public content read port SHALL return, with each public entry and path,
the active media items referenced by that entry's current published snapshot,
read from the content reference projection, for page, path and collection reads
and for the build export. Both SQLite modes and local D1 SHALL satisfy the
same repository contract fixtures: media
referenced only by a draft SHALL be absent, media of every returned entry SHALL
be present with its descriptive metadata and dimensions, and no public read SHALL
expose the entry's independently mutable draft snapshot. Reading media SHALL use
bounded, chunked statements and SHALL NOT read media per entry.

#### Scenario: A published entry references media
- **WHEN** the repository contract publishes an entry referencing two media
  items, then saves a draft referencing a third
- **THEN** public reads and the build export return the entry with exactly the
  two published media items on every contract target

#### Scenario: The public snapshot remains detached from later draft edits
- **WHEN** an entry is published and its draft changes
- **THEN** every contract target exposes only the published values

## MODIFIED Requirements

### Requirement: Repository contract fixtures preserve lifecycle invariants
The system SHALL provide a reusable, factory-driven repository contract suite
with deterministic fixtures for cardinality, revision guards, route conflict
and rollback, immutable publications, idempotency, projections, cascades,
outbox coalescing, dispatcher leases, site-build transitions, configuration
synchronization, media catalog and usage, and cursor ordering. A runtime
adapter SHALL participate only by supplying a factory for a freshly migrated
database, its repository, a second independent repository over the same
database, and parameterized SQL seeding/inspection; the cases themselves SHALL
be identical for every runtime. Every full content repository implementation
used by persistence-backed tests SHALL run the shared suite. The in-memory
SQLite variant SHALL exercise the same repository implementation and
migration chain used by the REST, MCP and application persistence fixtures.

#### Scenario: SQLite modes conform
- **WHEN** contracts run against migrated file-backed and in-memory SQLite
- **THEN** both modes satisfy all lifecycle assertions

#### Scenario: Local D1 conforms
- **WHEN** the same contract cases run against a migrated local D1 database
- **THEN** every case passes without a D1-specific case variant or skipped
  assertion

#### Scenario: Independent writers conflict deterministically
- **WHEN** two repositories over the same database save complete drafts at the
  same expected revision, or publish with the same idempotency key
- **THEN** the suite observes exactly one committed save and one stable revision
  conflict, or one committed publication and one replay, in every runtime

### Requirement: Repository contract fixtures cover global models
The shared repository contract SHALL configure a global model and SHALL verify
on both SQLite modes and local D1 that: synchronization creates its singleton draft with
the page-singleton rules; a second entry for it is refused with
`CONTENT_MODEL_CARDINALITY_CONFLICT`; publishing it creates a published
snapshot and no published route, advances the published-state version and
coalesces one build; republishing replaces the snapshot; unpublishing removes
the snapshot and leaves the draft; reverting copies the publication into the
draft without a version change; and an injected failure at any publication or
unpublication checkpoint leaves the global, version and build state unchanged.
A public global read by model key SHALL return the published global with the
active media its published snapshot references, and nothing for an unpublished
global, an unknown key or a page or collection key. Public path reads,
collection lists and the export `entries` SHALL never contain a global, the
export SHALL list published globals ordered by model key, and the public media
read SHALL apply the same delivery rules to every model kind and serve media
referenced only by a published global.

#### Scenario: A global is published and read
- **WHEN** the contract synchronizes the `settings` global, saves a draft that
  references one media item and publishes it
- **THEN** the public global read returns its fields, blocks, publication time
  and that media item, no published route exists for the entry, and the
  published-state version advanced by one

#### Scenario: Globals stay out of routed reads
- **WHEN** a page, a collection entry and a global are published
- **THEN** path reads and collection lists never return the global, the export
  lists the page and collection entry under `entries` and the global under
  `globals`, and the export media covers all three

#### Scenario: A global is unpublished
- **WHEN** the published global is unpublished with its current snapshot ID
- **THEN** the public global read returns nothing, the export has no globals,
  the draft is unchanged and the published-state version advanced

#### Scenario: Media used only by a global is public
- **WHEN** a media item is referenced only by a published global
- **THEN** the public media read returns it on every contract target

### Requirement: Repository contract fixtures cover the SEO group
The shared repository contract suite SHALL include an SEO-enabled model and
SHALL prove the following on both SQLite modes and local D1:

- create, save, publish, revert and duplicate persist and copy the SEO group
  exactly;
- save replaces the draft's `$seo` media reference;
- publication copies it to the published snapshot;
- revert and duplicate copy it to the new draft;
- an SEO image blocks media deletion with `MEDIA_IN_USE`;
- an SEO image counts in `usageCount` and appears in media usage with source
  `seo` and field `image`;
- an image referenced only by a published SEO group is served by the public
  media read and appears in the media dictionary of public reads and the
  build export;
- an image referenced only by a draft SEO group is not served and does not
  appear there;
- a hinted synchronization that disables SEO clears every group and `$seo`
  reference of the model atomically, and leaves other models untouched;
- block migrations and field renames or removals during synchronization leave
  SEO groups and `$seo` references unchanged.

#### Scenario: SEO survives the publication lifecycle
- **WHEN** a draft with an SEO group and image is saved, published, edited,
  and reverted on each runtime
- **THEN** each read returns the expected group and reference rows

#### Scenario: SEO image protects media
- **WHEN** media is referenced only by a draft SEO image and its deletion is
  requested
- **THEN** deletion fails with `MEDIA_IN_USE` and the media detail lists one
  `seo`/`image` location in the draft

#### Scenario: SEO image in public media
- **WHEN** an entry whose published SEO group names `media-2`, used nowhere
  else, is read publicly and exported
- **THEN** `media-2` is in each media dictionary and the public media read
  serves it

#### Scenario: Hinted prune is atomic
- **WHEN** a hinted SEO removal fails at an injected checkpoint
- **THEN** every snapshot keeps its SEO group and references, and a retry
  prunes them all

### Requirement: Repository contract fixtures cover the block envelope
The shared repository contract suite SHALL include a block type that declares
settings and SHALL prove the following on both SQLite modes and local D1:

- create, save, publish, revert and duplicate persist and copy each block's
  anchor, class name, hidden flag and settings exactly;
- a block migration during synchronization rewrites settings and keeps the
  anchor, class name and hidden flag;
- a hidden block's media references are stored, block media deletion with
  `MEDIA_IN_USE` and appear in media usage;
- public page, collection, slug, path and global reads and the build export
  leave hidden blocks out of `blocks`;
- media referenced only by hidden blocks of a published snapshot are left out
  of the media dictionaries and are not served by the public media read, while
  media also referenced by a visible block, a field or the SEO group stay in
  them;
- the stored anchor uniqueness holds per snapshot, so a draft and its
  published copy may share anchors.

#### Scenario: The envelope survives the publication lifecycle
- **WHEN** a draft with an anchored, class-named, hidden block with settings is
  saved, published, edited and reverted on each runtime
- **THEN** each read returns the expected envelope values

#### Scenario: Hidden blocks are not delivered
- **WHEN** a published entry holds a visible block and a hidden image block
  whose media is used nowhere else, and it is read publicly and exported
- **THEN** each response lists only the visible block, the hidden block's media
  is in no media dictionary, and the public media read does not serve it

#### Scenario: Hidden-block media is protected
- **WHEN** deletion is requested for media referenced only by a hidden block
  of a published snapshot
- **THEN** deletion fails with `MEDIA_IN_USE`

### Requirement: Composite lifecycle and media behavior have cross-runtime parity
Shared contracts SHALL prove composite model fields and block data behavior on
both SQLite modes and local D1 for save/load, publish, revert, duplicate,
and versioned block migration. Reorder/removal SHALL atomically replace media
locations. Usage counts, deletion guards, metadata-triggered builds, published
media dictionaries and hidden-block filtering SHALL agree with scalar rules.
Reference paths SHALL not require a new database table or reinterpret legacy
rows. Failures and stale guards SHALL leave the affected atomic unit unchanged.
D1 SHALL retain single guarded batches, ≤100 binds per statement and the existing
≤50-query maximum complete-draft save budget; no query SHALL be issued per item.

#### Scenario: Lifecycle copies
- **WHEN** a collection containing nested fields and blocks is saved, published, edited, reverted and duplicated on each implementation
- **THEN** values/order/references match, publication stays immutable to draft edits, and the duplicate's new block keys own its references

#### Scenario: Hidden and published media behavior
- **WHEN** media is used only in a hidden published block's nested field
- **THEN** usage and deletion protection remain, public output omits it, and its metadata edit retains the existing published-reference build behavior

#### Scenario: Media released only after the final stored reference
- **WHEN** an item is removed from a draft list while its publication still references it, then the last publication reference is removed
- **THEN** deletion is initially refused and becomes permitted only after no current snapshot location remains

#### Scenario: Chunk failure rolls back
- **WHEN** a nested reference becomes unavailable in the last insert chunk or a failure is injected between JSON and reference writes
- **THEN** the old snapshot JSON, references, revision, publication and build state remain intact

#### Scenario: D1 maximum content budget
- **WHEN** a valid snapshot with 200 blocks, 200 nested media references and 500 list elements is saved
- **THEN** it commits atomically within the existing query and bind budgets and reloads with the exact nested data

### Requirement: Repository contract fixtures cover the paged build export
Shared repository contract fixtures SHALL run against both SQLite modes and
local D1 and SHALL verify the following.

**Paging:**

- pages follow path order without gaps or repetition;
- the entry limit and the byte budget end pages, and an entry larger than the
  budget is delivered alone;
- globals and their media appear only on the first page, including a first
  page with no routed entries;
- each page's media are exactly those its entries or globals deliver, so media
  referenced only by hidden blocks or drafts stay excluded;
- draft-only content never appears.

**Guards:**

- a cursor issued before a publication, unpublication, entry deletion,
  published media-metadata edit or synchronization that advanced the
  published state fails with `BUILD_EXPORT_VERSION_CHANGED`;
- a cursor of another list, or a malformed cursor, fails as a validation
  failure.

**Equivalence:** concatenating every page of an unchanged state SHALL equal
the content of the former complete export for the same fixture, apart from
media being split across pages.

#### Scenario: Pages reproduce the complete export
- **WHEN** the shared fixture with entries, globals, hidden blocks, composites
  and SEO images is exported with limit 2 on each runtime
- **THEN** the concatenated entries, the first-page globals and the union of
  page media equal the expected complete export on every runtime

#### Scenario: A publication invalidates an export cursor
- **WHEN** a fixture reads the first page, publishes another entry and
  requests the next page with the first page's cursor
- **THEN** each runtime fails with `BUILD_EXPORT_VERSION_CHANGED` and the
  expected and actual versions

#### Scenario: An oversized entry is isolated
- **WHEN** an entry's stored fields and visible block data exceed the page
  byte budget
- **THEN** each runtime delivers that entry alone on its page and continues
  with the following entries on the next page

### Requirement: Repository contract fixtures cover conditional publication
The shared repository contract suite SHALL prove, with identical cases on the
file-backed SQLite, in-memory SQLite and local D1, that a publication supplied with a
published projection writes exactly the projected fields, block data and
media and internal-link references while copying the draft's title, slug,
SEO, block envelopes, settings, keys and positions, and leaves the draft
snapshot, its references and its revision unchanged. Fixtures SHALL include
model-level rules, a list of group items with different controller values,
nested groups and block data, including a hidden block. The atomic link guard
SHALL refuse a projected delivered link whose target lost its route, and
SHALL ignore links absent from the projection. A failure injected at any
publication checkpoint SHALL leave no partial published snapshot or
reference. A publication without a projection SHALL keep the existing copy
behavior. D1 SHALL keep one guarded batch within the existing bind and query
budgets, with no query per item.

#### Scenario: Projected publication on each runtime
- **WHEN** an entry whose draft list holds an `image` item with a stale `videoUrl` and a block with a stale hidden media value is published with its projection
- **THEN** every implementation stores the same published fields and block data, publishes no reference for the stale values, and keeps them in the draft and its references

#### Scenario: Atomic guard on projected links
- **WHEN** a visible projected link's target is unpublished between projection and publication commit
- **THEN** every implementation refuses with `internal_link_unavailable` and the previous publication, route, public-state version and build queue remain

#### Scenario: Hidden link does not block
- **WHEN** the draft's only link to an unpublished target is hidden and the projection omits it
- **THEN** publication commits on every implementation and the published snapshot has no link reference for it

#### Scenario: Failure rolls back projected publication
- **WHEN** a failure is injected after the projected snapshot is written and before references or routes are written
- **THEN** no new published snapshot, reference, route change, version increase or build request remains

#### Scenario: Replay with a projection
- **WHEN** a projected publication is retried with the same idempotency key
- **THEN** the original result is returned and no second snapshot is written

## REMOVED Requirements

### Requirement: Public repository reads include referenced media

**Reason:** The shared suite now checks the production repositories in both SQLite modes and local D1.
**Migration:** The published media and draft isolation assertions are retained in “Public repository reads preserve published snapshots and media.”
