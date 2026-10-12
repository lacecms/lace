# content-repository-contracts Specification

## Purpose

Defines reusable persistence contracts that prove lifecycle invariants across database runtimes.

## Requirements

### Requirement: Repository contract fixtures preserve lifecycle invariants
The system SHALL provide a reusable, factory-driven repository contract suite
with deterministic fixtures for cardinality, revision guards, route conflict
and rollback, immutable publications, idempotency, projections, cascades,
outbox coalescing, dispatcher leases, site-build transitions, configuration
synchronization, media catalog and usage, and cursor ordering. A runtime
adapter SHALL participate only by supplying a factory for a freshly migrated
database, its repository, a second independent repository over the same
database, and parameterized SQL seeding/inspection; the cases themselves SHALL
be identical for every runtime.

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

### Requirement: Repository contract fixtures verify atomicity and indexes
The system SHALL inject mutation failures and inspect query plans for route, block, media-reference, entry-list, and outbox lookups.

#### Scenario: Failed checkpoint rolls back
- **WHEN** a configured mutation checkpoint throws
- **THEN** no partial aggregate or public projection remains

#### Scenario: Critical lookups use indexes
- **WHEN** representative queries are explained
- **THEN** each plan names its required index

#### Scenario: Injected D1 failure happens inside the batch
- **WHEN** a D1 mutation checkpoint is configured to fail
- **THEN** the failure is raised by a statement executing within the mutation's
  batch after earlier statements ran, and none of their effects remain

### Requirement: Repository contract fixtures cover entry lifecycle commands
The shared repository contract suite SHALL include identical cases, for every
SQL runtime, for unpublication, draft revert, and guarded duplicate creation.
The cases SHALL assert the complete state after success: routes, by-path
lookup, build export, published-state version, pending build work, snapshots,
blocks, media references, draft revision, and derived status. They SHALL assert
that every guard failure leaves that state unchanged, including a stale
published snapshot identity, a stale draft revision, a publication removed or
replaced between read and write, and a changed duplicate source. They SHALL
cover an idempotent unpublication retry from an independent repository over the
same database and injected failures at the unpublication checkpoints.

#### Scenario: Unpublication conforms on every runtime
- **WHEN** the unpublication cases run against Node SQLite and local D1
- **THEN** both remove the route and published snapshot, keep the draft,
  increment the version once, coalesce one build request, and refuse a second
  unpublication with `CONTENT_NOT_PUBLISHED`

#### Scenario: An unpublication retry replays on every runtime
- **WHEN** a second repository over the same database repeats a successful
  unpublication with the same actor, key, and input
- **THEN** it returns the replayed result and the version and build work are
  unchanged

#### Scenario: Injected unpublication failure rolls back
- **WHEN** a configured unpublication checkpoint throws
- **THEN** the route, published pointer, published snapshot, version, and build
  work are unchanged

#### Scenario: Revert and duplicate races conform
- **WHEN** a revert uses a stale revision or a publication replaced after it was
  read, or a duplicate creation guards on a stale source revision
- **THEN** each fails with `CONTENT_REVISION_CONFLICT` and leaves every table
  unchanged on every runtime

### Requirement: Repository contract fixtures cover media metadata updates
The shared repository contract suite SHALL include identical cases, for every
SQL runtime, for media metadata updates. The cases SHALL assert the stored
values and `updatedAt` after an update, clearing values, and the round trip of
every value through list, catalog, detail and public media reads. They SHALL
assert that an item used by a current publication increments the
published-content version once and leaves one pending build with the reason
`media_metadata`, and that an item used only by a draft, or by nothing, leaves
both unchanged. They SHALL assert that a stale `updatedAt`, including a write
committed by an independent repository over the same database, fails with
`MEDIA_UPDATE_CONFLICT`, that a `deleting` item fails with
`CONTENT_INVALID_STATE`, and that each failure and an injected checkpoint
failure leave the item, the version and build work unchanged. They SHALL
assert that the database refuses an out-of-range or half-set focal point and
over-long text.

#### Scenario: Node and D1 conform for metadata updates
- **WHEN** the metadata update cases run against migrated file-backed SQLite,
  in-memory SQLite and local D1
- **THEN** every case passes without a runtime-specific variant or skipped
  assertion

### Requirement: Public repository reads include referenced media
The public content read port SHALL return, with each public entry and path,
the active media items referenced by that entry's current published snapshot,
read from the content reference projection, for page, path and collection reads
and for the build export. The Node and D1 repositories and the in-memory
repository fake SHALL satisfy the same repository contract fixtures: media
referenced only by a draft SHALL be absent, media of every returned entry SHALL
be present with its descriptive metadata and dimensions, and no public read SHALL
expose the entry's independently mutable draft snapshot. Reading media SHALL use
bounded, chunked statements and SHALL NOT read media per entry.

#### Scenario: A published entry references media
- **WHEN** the repository contract publishes an entry referencing two media
  items, then saves a draft referencing a third
- **THEN** public reads and the build export return the entry with exactly the
  two published media items on both runtimes and in the fake

#### Scenario: The fake hides the draft
- **WHEN** an entry is published and its draft changes
- **THEN** the in-memory fake's public reads expose only published values, like
  the Node and D1 repositories

### Requirement: Repository contract fixtures cover global models
The shared repository contract SHALL configure a global model and SHALL verify
on Node SQLite and D1 that: synchronization creates its singleton draft with
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
read SHALL serve media referenced only by a published global. The in-memory
repository fake SHALL satisfy the same global rules, and its public media read
SHALL accept media referenced by any current published snapshot.

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
- **THEN** the public media read returns it on both runtimes and in the fake

### Requirement: Repository contract fixtures cover the SEO group
The shared repository contract suite SHALL include an SEO-enabled model and
SHALL prove the following on the in-memory fake, Node SQLite and D1:

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
settings and SHALL prove the following on the in-memory fake, Node SQLite and
D1:

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
the in-memory fake, Node SQLite and D1 for save/load, publish, revert, duplicate,
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
