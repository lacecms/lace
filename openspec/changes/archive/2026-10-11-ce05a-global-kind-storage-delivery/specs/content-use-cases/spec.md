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
Deleting or duplicating a page or global entry SHALL fail with
`CONTENT_PAGE_SINGLETON` after authorization and before any state-changing port
is invoked.

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

#### Scenario: Global deletion is refused
- **WHEN** an administrator requests deletion of a global entry, published or
  not
- **THEN** it fails with `CONTENT_PAGE_SINGLETON` and the entry and its
  snapshots remain unchanged

### Requirement: Duplication creates an unpublished copy of a collection entry
The duplicate use case SHALL accept a source entry identity and an optional
expected draft revision. It SHALL refuse a page or global source with
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

#### Scenario: Duplicating a global fails
- **WHEN** a caller duplicates a global entry
- **THEN** it fails with `CONTENT_PAGE_SINGLETON` and no entry is created

#### Scenario: A source save races the duplication
- **WHEN** the source draft is saved between the duplicate read and the guarded
  creation
- **THEN** duplication fails with `CONTENT_REVISION_CONFLICT` and no entry is
  created

## ADDED Requirements

### Requirement: Global entries follow the page lifecycle without a route
The save, publish, unpublish and revert use cases SHALL apply to a global entry
with the same authorization, validation, revision, idempotency and conflict
rules as to a page entry. Saving a global draft SHALL store the model label, or
the model key when no label is configured, as the title regardless of the
submitted title, and SHALL reject a submitted slug. Publishing a global SHALL
resolve no public path, SHALL create or replace no published route, and SHALL
increment the published-state version and create or coalesce one site-build
request in the same atomic mutation as for every publication. Unpublishing a
global SHALL remove only its published snapshot and SHALL increment the
published-state version and request a build. Creating an entry of a global
model through the content commands SHALL fail with
`CONTENT_MODEL_CARDINALITY_CONFLICT` because synchronization owns its singleton.

#### Scenario: Save ignores a submitted global title
- **WHEN** an editor saves the `settings` global labelled `Site settings` with
  the title `Anything`
- **THEN** the saved draft's title is `Site settings` and its revision
  advances once

#### Scenario: Publishing a global writes no route
- **WHEN** an administrator publishes a valid global draft
- **THEN** the global has a published snapshot, no published route exists for
  it, the published-state version advances by one, and one pending build
  request targets that version

#### Scenario: Unpublishing a global
- **WHEN** an administrator unpublishes a published global with the current
  published snapshot ID
- **THEN** the published snapshot is removed, the draft is unchanged, the
  published-state version advances, and a build is requested

#### Scenario: Reverting a global draft
- **WHEN** an editor reverts a published global whose draft changed
- **THEN** the draft holds the published fields and blocks and the published
  state, version and build work are unchanged
