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

### Requirement: Repository contract fixtures cover media tags
The shared repository contract suite SHALL include identical cases, for every
SQL runtime, for media tags. They SHALL assert tag storage on create, full
replacement and clearing through metadata updates with `updatedAt` advancing,
tags in list, catalog and detail reads in ascending order, AND filtering with
search, type, every sort and cursor continuation, catalog counts, prefix
filtering and pagination, and removal of tags with deleted media metadata. They
SHALL assert that a tags-only update on media used by a current publication
leaves the published-content version and build work unchanged, that a stale
`updatedAt` fails with `MEDIA_UPDATE_CONFLICT` without changing tags, that an
injected checkpoint failure leaves tags unchanged, and that public media reads
and the build export carry no tags.

#### Scenario: Node and D1 conform for media tags
- **WHEN** the media tag cases run against migrated file-backed SQLite, in-memory SQLite and local D1
- **THEN** every case passes without a runtime-specific variant or skipped assertion

### Requirement: Repository contract fixtures cover import lookups
The shared repository contract suite SHALL include identical cases, for every
SQL runtime, for content-hash and slug lookups. They SHALL assert that a
created item stores its hash, that metadata and tag updates keep it, that a
hash filter returns only `active` matching items and combines with search,
type, tags, every sort and cursor continuation, that items without a hash never
match, and that public media reads and the build export carry no hash. They
SHALL assert that a slug filter matches the current draft slug exactly and not
the published slug, applies to totals, combines with search, status, field
filters and sorts, and continues by cursor. The security contract suite SHALL
assert import-credential issuance, expiry, revocation, kind separation from
build credentials, rate-limited `last_used_at` and revocation by account
security events.

#### Scenario: Node and D1 conform for import lookups
- **WHEN** the lookup and import-credential cases run against migrated file-backed SQLite, in-memory SQLite and local D1
- **THEN** every case passes without a runtime-specific variant or skipped assertion

#### Scenario: Hash lookup stays within the D1 budget
- **WHEN** the D1 budget suite lists media by hash in an installation with 500 media items
- **THEN** the read uses the hash index and stays within the existing media-list query budget

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

### Requirement: Repository contract fixtures pin runtime write-path deltas
The shared repository contract SHALL pin the observable result of every
write path whose Node and D1 implementations differ in mechanism. The entry
returned by a committed publication, by its idempotent replay and by a
committed unpublication SHALL equal the entry returned by a subsequent `load`
of the same entry, including published fields, blocks, block data, slug,
title, revision, timestamps, actor and the SEO group. A publication whose
expected revision is stale SHALL be refused with `CONTENT_REVISION_CONFLICT`
before its internal-link targets are validated, and SHALL change no snapshot,
route, published-state version, outbox event or idempotency record. A
site-build claim SHALL return at most 10 leases and a dispatcher event claim at
most 20 leases per call, whatever larger valid limit is requested, in
available-time then identifier order, and the unreturned events SHALL stay
claimable by a later call.

#### Scenario: Publication result equals a later load
- **WHEN** an entry with SEO values is published, once without and once with
  a conditional projection, on SQLite and on D1
- **THEN** each returned entry equals the entry returned by `load` immediately
  afterwards, and the published snapshot carries the draft's SEO values

#### Scenario: Idempotent replay equals a later load
- **WHEN** a publication with an idempotency key is replayed from a second
  repository over the same database
- **THEN** the replayed entry equals the entry returned by `load`

#### Scenario: Unpublication result equals a later load
- **WHEN** a published entry is unpublished
- **THEN** the returned entry has no publication and equals the entry returned
  by `load`

#### Scenario: Stale publication is a revision conflict before link validation
- **WHEN** a publication names a stale expected revision for a draft whose
  internal links target an unpublished entry
- **THEN** the repository refuses with `CONTENT_REVISION_CONFLICT`, not a link
  failure, and the published-state version, routes, snapshots, outbox and
  idempotency records are unchanged

#### Scenario: Claims honor the per-call cap
- **WHEN** eleven site-build events with expired leases, or twenty-one
  dispatcher events, are available and a claim requests a limit of 50
- **THEN** the claim returns exactly ten site-build leases, or twenty dispatcher
  leases, for the earliest events, and a second claim returns the remaining
  event

### Requirement: Repository contract fixtures cover route-less collections
The shared repository contract fixtures SHALL include a route-less collection
and SHALL run the same scenarios against the Node and Cloudflare repositories:
publishing, unpublishing and deleting route-less entries without a published
route, the published-state version and build request of each publication, the
public records read and its order, the build export records phase across page
boundaries and the byte budget, record media scoping, `non-routable` link
target state and link-picker exclusion, and synchronization refusing to add or
remove a route of a published collection.

#### Scenario: Both runtimes export the same records
- **WHEN** the shared fixtures publish routed entries and route-less entries
  and read the build export with a small page limit on Node and on Cloudflare
- **THEN** both runtimes return identical pages, cursors and assembled exports

### Requirement: Idempotency records expire and are purged

A publication or unpublication idempotency record SHALL replay only while its
expiry time is later than the command's clock time.

- An expired record SHALL be treated as absent. The retry SHALL go through the
  normal guards as a new request.
- On commit, the mutation SHALL replace the expired record with the new
  request's record in the same atomic mutation.
- If the mutation fails or is refused, the expired record SHALL remain
  unchanged.
- Reusing an expired key with different input SHALL NOT fail as an
  idempotency conflict.

Maintenance SHALL delete expired idempotency records:

- in bounded batches of at most a fixed per-call limit;
- through the same statement on Node SQLite and D1;
- on each runtime's existing maintenance schedule; on the Worker, in its
  own scheduled phase, only on the runs whose other maintenance leaves the
  invocation within 50 D1 queries;
- without deleting an unexpired record.

The shared repository contract SHALL pin this behavior on every SQL runtime.

#### Scenario: Unexpired key replays

- **WHEN** a publication is retried with the same actor, key and input before
  the record expires
- **THEN** the original result is replayed, and no snapshot, version
  increment or build request is added

#### Scenario: Expired key is processed as a new request

- **WHEN** a publication is retried with the same actor and key after the
  record expired, with a current expected revision
- **THEN** the repository commits a new publication and increments the
  published-state version once. It stores one record for that scope and key,
  carrying the new result and a new expiry

#### Scenario: Expired key with stale input changes nothing

- **WHEN** an unpublication is retried after its record expired and its
  expected published snapshot no longer names the current publication
- **THEN** it fails with `CONTENT_REVISION_CONFLICT`, and the expired record
  and all content state remain unchanged

#### Scenario: Purge is bounded and keeps live records

- **WHEN** maintenance runs with more expired records than its per-call limit,
  plus unexpired records
- **THEN** it deletes exactly the limit of expired records and no unexpired
  record. A later run deletes the remaining expired records

### Requirement: Publication removes superseded snapshots identically on every runtime

A committed publication SHALL leave the entry with exactly two snapshots:

- its current draft;
- the new published snapshot.

Every other snapshot of the entry SHALL be deleted in the same atomic
mutation, along with its blocks and media and link references. Node SQLite
and D1 SHALL express this rule with one shared statement. A replayed or
refused publication SHALL delete no snapshot.

#### Scenario: Republication keeps only current snapshots

- **WHEN** a published entry is edited and published again on Node SQLite or
  local D1
- **THEN** the entry owns exactly its draft and the new published snapshot,
  and no block, media-reference or link-reference row of the previous
  publication remains

#### Scenario: Refused publication deletes nothing

- **WHEN** a publication is refused for a stale revision or a route conflict
- **THEN** every snapshot of the entry, with its blocks and references,
  remains unchanged

### Requirement: Entry write plans report typed guard outcomes and committed work
Node SQLite and D1 SHALL use the same ordered write plan for entry creation
(including guarded duplication), complete-draft save, deletion, publication
and unpublication. Expected admission failures SHALL be classified from
typed guard outcomes before any persistent mutation takes effect and SHALL
retain the established repository error codes and diagnostics. A false
guard SHALL leave content, link and media projections, public state,
idempotency records and outbox work unchanged. Unexpected statement and commit
failures SHALL roll back the unit and retain the stable invalid-state error.

The execution result SHALL distinguish a committed mutation from a guard
miss and identify newly inserted or coalesced outbox work from committed
statement results. Draft-only mutations, a replay, a guard miss and a rollback
SHALL report no committed outbox work. Worker dispatch registration SHALL use
this result and retain the existing coalescing of wake-ups per request.
Internal failure reasons SHALL NOT expose SQLite or D1 error messages.

#### Scenario: A typed singleton collision leaves the first entry intact
- **WHEN** two creation commands target the same page or global singleton
- **THEN** only one commits, and the other returns
  `CONTENT_MODEL_CARDINALITY_CONFLICT` without a new entry, snapshot or projections

#### Scenario: A stale command has no effects
- **WHEN** a complete-draft save, a guarded duplicate or a deletion names
  an outdated draft revision with other preconditions satisfied, or a
  deletion or unpublication names an older snapshot while a newer one is
  published
- **THEN** it returns `CONTENT_REVISION_CONFLICT` and leaves the winning
  mutation's draft, publication, projections, version and outbox work intact

#### Scenario: Media unavailability rejects the whole draft
- **WHEN** a complete-draft save would reference a missing or inactive media
  item, including an item in the final reference chunk
- **THEN** it returns `CONTENT_INVALID_STATE` for the unavailable media and
  retains the previous draft revision, values, blocks and reference projections

#### Scenario: A concurrent draft change takes precedence over invalid targets
- **WHEN** the draft revision changes after publication has read the candidate
  and a delivered link target is also invalid at admission
- **THEN** the attempted publication returns `CONTENT_REVISION_CONFLICT`
  and creates no snapshot, route, version, idempotency record or outbox work

#### Scenario: Inserting or coalescing a build reports committed work
- **WHEN** a publication, unpublication or published-entry deletion commits
  and inserts a build event or coalesces into a pending build event
- **THEN** its execution reports committed outbox work after commit and the
  event carries the version committed by the same mutation

#### Scenario: A failed commit reports no work
- **WHEN** the mutation fails after preparing or writing outbox work and
  the atomic unit rolls back
- **THEN** no outbox work is reported, no Worker dispatch pass is registered
  for that mutation, and a retry can commit the mutation once

#### Scenario: Authorization still applies to public mutations
- **WHEN** an actor with draft-write permission but without publication
  permission attempts to publish, unpublish or delete a published entry
- **THEN** the application rejects the command before persistence, and the
  entry, public state and outbox remain unchanged

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
