# content-use-cases Specification

## Purpose

Defines portable content-entry application behavior that authorizes callers,
validates complete aggregates, and coordinates lifecycle changes consistently
before Node or Cloudflare transport and persistence adapters are introduced.

## Requirements

### Requirement: Authorized content-entry lifecycle use cases
The system SHALL expose transport-neutral use cases for creating, listing,
loading, fully saving, publishing, unpublishing, reverting the draft of,
duplicating, and deleting content entries through the portable application
ports. Every state-changing use case SHALL authorize the actor before state is
read or changed: creation, save, revert, and duplication require
`content:write`; publication and unpublication require `content:publish`; and
deletion requires `content:publish` when the entry has a current published
snapshot and `content:write` otherwise. Listing and loading an entry or its
snapshots SHALL require `content:read`. Authorization failure SHALL use the
stable domain authorization error and SHALL not invoke a state-changing port.
Deleting or duplicating a page entry SHALL fail with `CONTENT_PAGE_SINGLETON`
after authorization and before any state-changing port is invoked.

#### Scenario: Editor can manage an unpublished draft but cannot publish it
- **WHEN** an editor creates or saves an unpublished entry and then requests
  publication
- **THEN** creation and save succeed through the respective content commands,
  while publication fails with the stable authorization error before publication
  state changes

#### Scenario: Viewer can inspect but cannot mutate content
- **WHEN** a viewer requests a list or entry load, then requests draft save,
  publication, unpublication, revert, duplication, or deletion
- **THEN** the reads return portable content values, while every mutation fails
  with the stable authorization error and no content command executes

#### Scenario: Deleting public output requires publish authority
- **WHEN** an editor requests deletion of an entry that has a published snapshot
- **THEN** deletion fails with the stable authorization error and the public
  snapshot and route remain available

#### Scenario: Editor cannot unpublish
- **WHEN** an editor requests unpublication of a published entry
- **THEN** it fails with the stable authorization error and the published
  snapshot, route, and published-state version remain unchanged

#### Scenario: Editor can revert and duplicate
- **WHEN** an editor reverts a published entry's changed draft and duplicates a
  collection entry
- **THEN** both succeed without `content:publish`, and neither changes public
  content

#### Scenario: Page deletion is refused
- **WHEN** an administrator requests deletion of a page entry, published or not
- **THEN** it fails with `CONTENT_PAGE_SINGLETON` and the entry, its snapshots,
  and its route remain unchanged

### Requirement: Complete aggregate validation precedes each lifecycle write
The system SHALL resolve the entry's normalized model and runtime block registry
before a create, complete-draft save, or publish command. Create and save SHALL
validate the complete draft aggregate in draft mode; publish SHALL revalidate the
current complete draft in publish mode before it resolves a route or invokes its
guarded publication command. Validation SHALL apply the model and block
semantics, allowed block types and current versions, field defaults, title/slug,
unique ordered block keys and positions, shared block/count/UTF-8-byte limits,
and all referenced media identifiers. A media reference is valid only when its
metadata exists and is active. For every accepted complete draft, the use case
SHALL rebuild the entire relational media-reference projection from the
normalized model fields and normalized block fields, with `$fields` or the
stable block key and a field path for each reference; it SHALL not retain stale
references or ask an adapter to discover references by parsing arbitrary JSON.
Any validation failure SHALL leave the stored entry, public route, and public
projection unchanged.

#### Scenario: Draft save rejects an invalid complete aggregate atomically
- **WHEN** a writer saves a draft with an unknown field, disallowed block,
  duplicate or unordered block key/position, missing or inactive media item, or
  an exceeded shared payload limit
- **THEN** the save fails before the atomic save command and the previously
  stored draft revision and content remain unchanged

#### Scenario: Publish applies stricter required-field validation
- **WHEN** a valid incomplete draft omits a publish-required model or block
  field, or a collection slug
- **THEN** draft save remains permitted but publication fails before route
  resolution and public content remains unchanged

#### Scenario: Valid draft values are normalized before persistence
- **WHEN** a writer saves a complete valid draft whose model or block fields
  omit descriptor defaults
- **THEN** the atomic save receives the normalized aggregate with those defaults
  applied and advances the draft revision exactly once

#### Scenario: Replacing a draft rebuilds media references
- **WHEN** a writer saves a valid complete draft that adds, removes, or replaces
  media fields in its model fields or blocks
- **THEN** the atomic save receives exactly the media-reference projection for
  the normalized submitted aggregate, without stale references from the prior
  draft

### Requirement: Publication is guarded, idempotent, and build-independent
The system SHALL publish only after strict validation and shall resolve the
candidate public route before invoking one guarded atomic publication operation.
The operation SHALL use the caller's expected draft revision, a new publication
snapshot identity, and the application clock time. A conflicting route,
singleton, or stale revision SHALL fail without a partial publication. A
non-empty idempotency key scoped to the same content entry and authenticated
actor SHALL return the original successful publication result when retried and
MUST NOT create another published snapshot, increment public content version,
or enqueue another build event. Reusing that scope/key with materially different
publication input SHALL fail without changing content. Successful publication
SHALL atomically enqueue or coalesce durable build work and report a queued
build outcome with the target version; a replay SHALL report that no new work
was queued. Trigger acceptance, failure, or unavailability after commit SHALL
not undo, obscure, or retry the successful publication.

#### Scenario: Route conflict leaves published content untouched
- **WHEN** a publish candidate resolves to a route owned by a different entry
- **THEN** publication fails with the stable route-conflict error and neither
  entry's public snapshot, route ownership, or public content version changes

#### Scenario: Retry returns a publication once
- **WHEN** a publisher retries an already successful publication with the same
  entry, actor, idempotency key, and input
- **THEN** it receives the original publication result, the existing published
  snapshot remains current, and no additional build event is enqueued

#### Scenario: Build dispatch failure does not roll back publication
- **WHEN** guarded publication succeeds and the subsequent build trigger rejects
  or throws for the resulting public version
- **THEN** the use case has already reported publication as successful with a
  queued build outcome, and public reads return the new immutable snapshot

### Requirement: Reads return detached portable content values
The system SHALL return only portable domain/configuration values from content
entry list and load use cases. Loads SHALL support the entry aggregate and its
individual draft or published snapshot; lists SHALL preserve the opaque cursor
contract. Returned values SHALL be detached from later caller mutation and from
future draft saves.

#### Scenario: Published read remains isolated after a subsequent draft edit
- **WHEN** an entry is published, its published snapshot is read, and a later
  complete draft save changes the title, fields, slug, or blocks
- **THEN** the previously returned and subsequently loaded published snapshots
  retain the original values while the draft has exactly one newer revision

### Requirement: Entry-list queries and editor names are authorized reads
The content-entry list use case SHALL require `content:read` before reading
state, SHALL resolve the model from the active configuration, and SHALL pass
the model's configured `listFields` (none for a page), the search term, the
status filter, and the sort, defaulting to `-updatedAt`, to the read port. It
SHALL reject an unknown model, an unsupported status or sort, and a trimmed
search term longer than 200 characters with the stable invalid-state domain
error before querying. It SHALL return a detached page including per-status
totals. A separate editor-description use case SHALL require `content:read`
and SHALL return an actor's `id` and display name through the read port. It
SHALL apply the same `System` and `Unknown user` fallbacks as list summaries.

#### Scenario: A viewer lists entries with a filter
- **WHEN** a viewer lists a collection with `status` `published` and a search
  term
- **THEN** the read port receives the model's list fields, the trimmed term,
  the status, and the default sort, and the viewer receives a detached page
  with totals

#### Scenario: Every role reads the same list data
- **WHEN** a viewer, an editor, and an administrator issue the same list query
  and describe the same editor
- **THEN** each receives identical items, totals, and display name, because
  each role holds `content:read`

#### Scenario: An invalid list query fails before a read
- **WHEN** a caller requests an unknown model, an unsupported sort, or an
  over-long search term
- **THEN** the use case fails with the invalid-state domain error and the read
  port is not queried

### Requirement: Unpublication is guarded, idempotent, and build-requesting
The unpublish use case SHALL accept an entry identity, the expected published
snapshot identity, and an optional idempotency key, and SHALL invoke one guarded
atomic unpublication command with the application clock time and actor. The
command SHALL remove the entry's published route, clear its published pointer,
delete the published snapshot with its blocks and media references, increment
the published-state version, and create or coalesce one durable build request
for that version. It SHALL not change the draft. It SHALL apply to page and
collection entries. An entry without a current publication SHALL fail with
`CONTENT_NOT_PUBLISHED`; an expected snapshot identity that no longer names the
current publication SHALL fail with `CONTENT_REVISION_CONFLICT`; both failures
SHALL leave all state unchanged. A non-empty idempotency key scoped to the
entry and authenticated actor SHALL return the original successful result on
an identical retry without another version increment or build request, and
reusing it with a different expected snapshot SHALL fail without changing
content. A successful unpublication SHALL report a queued build outcome with
the target version; a replay SHALL report that no new work was queued.

#### Scenario: Unpublishing a collection entry removes it from the site
- **WHEN** an administrator unpublishes a published collection entry with its
  current published snapshot identity
- **THEN** by-path lookup and the build export no longer contain the entry, the
  published-state version increments once, one build request is pending for
  that version, and the draft is unchanged

#### Scenario: Unpublishing a page removes its fixed path
- **WHEN** an administrator unpublishes a published page
- **THEN** the page's fixed path is no longer resolvable, and the page entry and
  its draft remain

#### Scenario: Unpublishing an unpublished entry fails
- **WHEN** an administrator unpublishes an entry that has never been published
  or has already been unpublished
- **THEN** it fails with `CONTENT_NOT_PUBLISHED` and the published-state version
  and build work are unchanged

#### Scenario: Republication races unpublication
- **WHEN** the entry is republished after the caller read its published
  snapshot identity and the caller then unpublishes with the old identity
- **THEN** unpublication fails with `CONTENT_REVISION_CONFLICT` and the new
  publication stays public

#### Scenario: Retry returns an unpublication once
- **WHEN** an administrator retries a successful unpublication with the same
  entry, idempotency key, and expected snapshot identity
- **THEN** it receives the original result with a replay outcome and no
  additional version increment or build request

### Requirement: Reverting a draft restores the published content
The revert use case SHALL accept an entry identity and the expected draft
revision, read the entry's current published snapshot identity, and invoke one
guarded atomic revert command with the application clock time and actor. The
command SHALL copy the published title, slug, fields, schema version, blocks,
and media references into the draft, advance the draft revision exactly once,
record the actor and time as the draft's last update, and set the published
snapshot's revision to the new draft revision. It SHALL not change public
content, the published-state version, or build work. An entry without a current
publication SHALL fail with `CONTENT_NOT_PUBLISHED`. A stale draft revision, or
a publication replaced or removed after it was read, SHALL fail with
`CONTENT_REVISION_CONFLICT` and leave the draft unchanged.

#### Scenario: Revert abandons saved draft changes
- **WHEN** an editor reverts a published entry whose saved draft changed the
  title, slug, a field, a block, and a media reference
- **THEN** the draft equals the published values, the draft revision advanced
  once, media usage of the draft matches the publication, the entry status is
  `published`, and the published-state version is unchanged

#### Scenario: Revert at a stale revision fails
- **WHEN** a draft save commits after the caller read revision 4 and the caller
  reverts with expected revision 4
- **THEN** revert fails with `CONTENT_REVISION_CONFLICT` and the saved draft
  remains

#### Scenario: Revert of a never-published entry fails
- **WHEN** a caller reverts an entry that has no published snapshot
- **THEN** it fails with `CONTENT_NOT_PUBLISHED` and the draft is unchanged

### Requirement: Duplication creates an unpublished copy of a collection entry
The duplicate use case SHALL accept a source entry identity and an optional
expected draft revision. It SHALL refuse a page source with
`CONTENT_PAGE_SINGLETON` and an expected revision that differs from the source
draft with `CONTENT_REVISION_CONFLICT`. It SHALL build a new entry of the same
model whose draft copies the source draft's fields and blocks, with these
changes: the title is the source title followed by ` (copy)`, with the source
title shortened at a whole character so the result fits the maximum title
length; the slug is absent; every block receives a new stable key and keeps its
type, schema version, position, and data; and the media-reference projection is
rebuilt from the copied values. The copy SHALL be validated in draft mode and
created at revision 1 by the actor, guarded on the source draft still having
the revision that was read; a concurrent source change SHALL fail with
`CONTENT_REVISION_CONFLICT` without creating an entry. The copy SHALL never be
published by duplication, and the source SHALL be unchanged.

#### Scenario: Duplicating a published collection entry
- **WHEN** an editor duplicates a published collection entry titled `Launch`
  with a slug, two blocks, and a media field
- **THEN** a new draft-only entry titled `Launch (copy)` exists with no slug,
  the same fields and block data under new block keys, and media usage for the
  copy, while the source draft and publication are unchanged

#### Scenario: A long title is shortened
- **WHEN** the source title has the maximum title length
- **THEN** the copy's title has at most the maximum length and ends with
  ` (copy)`

#### Scenario: Duplicating a page fails
- **WHEN** a caller duplicates a page entry
- **THEN** it fails with `CONTENT_PAGE_SINGLETON` and no entry is created

#### Scenario: A source save races the duplication
- **WHEN** the source draft is saved between the duplicate read and the guarded
  creation
- **THEN** duplication fails with `CONTENT_REVISION_CONFLICT` and no entry is
  created
