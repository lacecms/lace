## MODIFIED Requirements

### Requirement: Writers can detach draft-only usage before deleting media
A writer SHALL be able to detach media from up to 50 distinct using entries across bounded requests on Node and Cloudflare. Each request SHALL require both `media:write` and `content:write` before reading or writing application data. A missing or inactive item SHALL fail with `CONTENT_INVALID_STATE`.

Admission SHALL inspect current draft and published usage in one consistent read. Any current published usage or a 51st distinct using entry SHALL fail with `MEDIA_IN_USE` before any draft changes. For 1–50 eligible entries admission SHALL return all distinct entry IDs with their current draft revisions and leave the item active. With zero uses it SHALL request guarded deletion directly.

Each entry step SHALL address exactly one entry at a caller-supplied revision. It SHALL enforce active status, absence of published usage and the 50-entry ceiling at the mutation boundary, including for a direct call. It SHALL save a still-using draft only at the expected revision, with the requesting actor as editor and one revision increment. If an eligible active item is already absent from the named draft (including a removed entry), the step SHALL report completion without a write. If an edited draft still uses the item, the step SHALL fail with `CONTENT_REVISION_CONFLICT`. Every successful step SHALL leave the media active.

Finishing SHALL perform the ordinary atomic zero-reference check, transition to `deleting` and enqueue exactly one `media.delete.requested` event. Any remaining use, including a new use outside the admitted set, SHALL yield `MEDIA_IN_USE` and preserve active status. The protocol SHALL never automatically add a newly discovered draft to a previously admitted set.

Removing the item from a draft SHALL clear a media field whose value is the
item, remove an element whose value is the item from a list of media, and
clear an SEO image that is the item. It SHALL apply at every nesting depth of
groups and lists, in entry fields and in the data of visible and hidden blocks
alike, and SHALL leave every other value, block, block envelope and the
title and slug unchanged. A draft may afterwards miss a required value or fall
below a list minimum; draft validation accepts that and publication reports
it. A published snapshot SHALL never be rewritten, so detaching requests no
build and never changes public delivery. Without the option, deletion SHALL
behave exactly as before.

Each draft save SHALL atomically update its content and derived projections. Failure SHALL preserve the original error, previously committed steps and the current values of pending drafts. A retry SHALL operate on committed state.

#### Scenario: Draft-only usage is detached and the item is queued
- **WHEN** an editor completes admission, both entry steps and finish for an image that
  two entries use only in their drafts, one in a `cover` field and one in an
  `image` block and in a gallery list
- **THEN** the `cover` field is cleared, the block's `image` value is cleared,
  the gallery element is removed, each draft's revision advances by one with
  the editor as its last editor, the image's `usageCount` is 0, and the item is
  `deleting` with one deletion event queued

#### Scenario: Published usage refuses detaching without changing drafts
- **WHEN** a writer requests deletion with the detach option of an image that a
  current published snapshot uses
- **THEN** the request fails with `MEDIA_IN_USE`, no draft revision changes,
  and the item stays `active`

#### Scenario: A published-only usage is released by publishing
- **WHEN** an entry's published snapshot uses an image in a block, the writer
  removes that block from the draft and saves it, and later publishes the
  entry
- **THEN** after the save the image reports that entry with the block location
  marked published only and deletion is refused as in use, and after the
  publication its `usageCount` is 0 and an ordinary deletion request is
  accepted

#### Scenario: Detaching requires content write permission
- **WHEN** an actor with `media:write` but without `content:write` requests
  deletion with the detach option
- **THEN** the request fails with the stable authorization error before any
  read or write

#### Scenario: Too many using entries are refused
- **WHEN** 51 entries use an image only in their drafts and a writer requests
  deletion with the detach option
- **THEN** the request fails with `MEDIA_IN_USE` and no draft changes

#### Scenario: A concurrent draft edit stops detaching
- **WHEN** a using entry's draft is saved by someone else after the detach
  request read it and before the request saves it, and the edited draft still uses the item
- **THEN** the request fails with `CONTENT_REVISION_CONFLICT`, the concurrent
  draft is kept, and the item stays `active`

#### Scenario: A new reference committed during detaching blocks deletion
- **WHEN** another draft starts using the item after detaching saved the last
  known using draft and before deletion is requested
- **THEN** the request fails with `MEDIA_IN_USE` and the item stays `active`

#### Scenario: A lost entry response can be replayed
- **WHEN** the save commits but the caller loses its response and resends that entry and revision
- **THEN** the step acknowledges the absent reference, preserves the new revision and enqueues no event

#### Scenario: A publication appears between steps
- **WHEN** another editor publishes a use after admission but before the next draft mutation
- **THEN** the next step fails with `MEDIA_IN_USE`, earlier saves survive, and neither the named draft nor the publication changes

#### Scenario: Two finish requests race
- **WHEN** two writers finish after the last draft save
- **THEN** at most one changes the media status and exactly one deletion event commits
