## MODIFIED Requirements

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

## ADDED Requirements

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
