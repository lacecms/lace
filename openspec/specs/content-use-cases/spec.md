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
status filter, canonical typed field filters, resolved configured query targets and the sort, defaulting to `-updatedAt`, to the read port. It
SHALL reject an unknown model, an unsupported status or sort, and a trimmed
search term exceeding the trusted runtime q budget with the stable invalid-state domain
error before querying. It SHALL also reject unsupported field operations, invalid filter operands and exceeded query limits before invoking the read port; transport mapping SHALL retain precise validation issue pointers. The composition root SHALL supply listQueryLimits (Node 200/null, Cloudflare 48/50), enforced on trimmed q and literal contains operands according to collection-query-options, including escaped-pattern UTF-8 size. Text eq SHALL retain 200 code units without a LIKE budget. Client parameters/config SHALL NOT override runtime policy, and excess input SHALL NOT be truncated. Resolved query identity SHALL bind sqlite-like-v1 and the effective policy. The same policy SHALL be exposed by admin runtime metadata without entering model hashes. It SHALL return a detached page including per-status
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

#### Scenario: Configuration is authoritative for every role
- **WHEN** a viewer or administrator requests a configured field filter and sort
- **THEN** the use case resolves the same effective query from active configuration and passes only validated portable query data to the read port

#### Scenario: Disabled operations fail before persistence
- **WHEN** an enabled filter field is removed from configuration and a client reuses its query
- **THEN** the use case rejects the stale query before reading entries



#### Scenario: Platform limits are enforced before reads
- **WHEN** a Cloudflare actor submits q or contains whose escaped substring pattern exceeds 50 UTF-8 bytes
- **THEN** the use case rejects it at /q or /filters/<index>/value without a read-port call, and Node accepts an otherwise valid operand within 200 code units

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

### Requirement: Entry lifecycle use cases carry the SEO group
Create and save SHALL accept an optional SEO group as part of the complete
editable draft. An absent or `null` group SHALL store no SEO values, so a save
still replaces the whole draft. For a model without SEO enabled, a submitted
group that is not `null` SHALL fail with a content validation issue
`seo_not_allowed` at `/seo`, with no repository write. Draft and publish
validation SHALL both apply the shared SEO rules. Publication SHALL validate
the stored draft's group again in publish mode. The publication idempotency
fingerprint SHALL cover the group. An SEO image SHALL be recorded as a draft
media reference with source `$seo` and path `image`. It SHALL count toward the
200-reference limit and SHALL require an `active` media item, exactly like a
media field. Revert SHALL restore the published group. Duplicate SHALL copy
the source draft's group and its image reference. A singleton created by
synchronization SHALL start without a group. Authorization SHALL be that of
the surrounding command.

#### Scenario: Save and publish an SEO group
- **WHEN** an editor saves a draft of an SEO-enabled collection entry with
  `seo: {title: "Hello", image: "media-1", canonical: "https://example.com/hello"}`
  and then publishes it
- **THEN** the draft and the new published snapshot carry that group, and both
  snapshots reference `media-1` from `$seo`/`image`

#### Scenario: Saving without a group clears it
- **WHEN** an editor saves a draft that previously had an SEO group and omits
  `seo`
- **THEN** the new draft revision carries no group and no `$seo` reference

#### Scenario: Reject SEO on a model without it
- **WHEN** a save for a model without SEO submits `seo: {title: "x"}`
- **THEN** it fails with `422` issue `seo_not_allowed` at `/seo` and the draft
  revision is unchanged
- **WHEN** the same save submits `seo: null`
- **THEN** the save succeeds

#### Scenario: Reject an unavailable SEO image
- **WHEN** a save names an SEO image that does not exist or is not `active`
- **THEN** it fails as an unavailable media reference does and writes nothing

#### Scenario: Duplicate and revert copy the group
- **WHEN** an entry with a published SEO group and a different draft group is
  reverted, and another entry with a draft group is duplicated
- **THEN** the reverted draft carries the published group, and the copy's
  draft carries the source draft's group and image reference

### Requirement: Entry lifecycle use cases carry the block envelope
Create and save SHALL accept each block's optional envelope values as part of
the complete editable draft and store the normalized envelope that aggregate
validation returns. An omitted envelope value SHALL take its default (no
anchor, no class name, visible, declared setting defaults), so a client that
does not send envelope values keeps working, but a save still replaces the
whole draft, including the envelope. Publication SHALL validate the stored
draft again in publish mode, where hidden blocks are validated in draft mode,
and the publication idempotency fingerprint SHALL cover the envelope. Media
fields of a hidden block SHALL remain draft media references: they SHALL count
toward the 200-reference limit and SHALL require `active` media. Revert SHALL
restore the published envelopes. Duplicate SHALL copy every source block's
envelope, including its anchor, under new block keys. Envelope validation
failures SHALL be content validation issues under the block's path, with no
repository write.

#### Scenario: Publish an entry with an unfinished hidden block
- **WHEN** an editor publishes a draft whose only incomplete block is hidden
- **THEN** publication succeeds, and the published snapshot stores the hidden
  block with its incomplete data

#### Scenario: Unhiding an incomplete block blocks publication
- **WHEN** the editor saves the same draft with the block visible and
  publishes it
- **THEN** publication fails with `missing_required_field` under that block's
  data path, and public content is unchanged

#### Scenario: Omitted envelope values default
- **WHEN** a client saves a block with only `key`, `type`, `schemaVersion`,
  `position` and `data` for a block that declares settings
- **THEN** the stored block is visible, has no anchor or class name, and
  carries the declared setting defaults

#### Scenario: A duplicate anchor is refused before writing
- **WHEN** a save submits two blocks with the anchor `faq`
- **THEN** it fails with `422` issue `duplicate_block_anchor` and the draft
  revision is unchanged

#### Scenario: Hidden-block media stays referenced
- **WHEN** a draft holds a hidden image block that references `media-1`
- **THEN** the draft's media references include `media-1` from that block's
  key, and the save fails if `media-1` is not `active`

#### Scenario: Duplicate and revert copy envelopes
- **WHEN** an entry with an anchored hidden block is duplicated, and another
  entry whose draft changed a published block's settings is reverted
- **THEN** the copy holds the anchored hidden block under a new key, and the
  reverted draft holds the published settings

### Requirement: Nested media participate in the complete content lifecycle
Create, save and publish SHALL validate normalized nested media as active media,
count every location toward the existing 200-reference cap (including SEO and
hidden blocks), and rebuild references from declared fields without guessing
from strings. A root scalar path SHALL keep its existing field key; nested paths
SHALL use RFC 6901 JSON Pointers relative to `$fields` or the block source key,
such as `/images/0/image`. Groups SHALL use field keys and lists zero-based
indices. Saves SHALL replace reference paths atomically with JSON and revision,
including after reorder/removal. Load, publish, revert and duplicate SHALL
preserve nested data and the corresponding locations, remapping duplicated block
source keys as today. Authorization, expected revisions, idempotency and media
deletion-race protections SHALL remain unchanged.

#### Scenario: References have unambiguous paths
- **WHEN** model `cover`, group `contact.photo`, block `images[0].image` and a media-list item are stored
- **THEN** their field paths are respectively `cover`, `/contact/photo`, `/images/0/image` and the list's pointer ending `/0`, with the existing source keys

#### Scenario: Reorder and remove
- **WHEN** a draft list referencing media A and B is reordered and A is removed
- **THEN** B's location uses its new index, A has no stale draft location, and any published location of A still protects it

#### Scenario: Inactive nested media
- **WHEN** a writer saves a nested media value whose metadata is missing or deleting
- **THEN** the command fails and draft JSON, references and revision stay unchanged

#### Scenario: Reference maximum counts occurrences
- **WHEN** a snapshot repeats one media ID at 201 nested locations
- **THEN** the command rejects it before writing, despite having one distinct media ID

#### Scenario: Existing authorization applies
- **WHEN** a viewer saves composite data, or an editor without publish permission publishes it
- **THEN** authorization is denied before content reads or writes

#### Scenario: Stale nested save
- **WHEN** two writers save different list orders using the same expected revision
- **THEN** only one commits and the other receives the existing revision conflict without partial reference changes

### Requirement: Content lifecycle maintains internal URL projections atomically
Create, save, publish, revert, duplicate, delete and unpublish SHALL maintain the
descriptor-derived internal URL projection and incoming dependency revisions in
the same mutation as source JSON/snapshot pointers. Publication SHALL recheck
delivered targets within its guarded commit. Unchanged draft reference tuples
SHALL NOT be deleted/reinserted on unrelated edits. Source deletion SHALL remove
outgoing usages, while target deletion SHALL preserve surviving sources' IDs and
usages. Publication/revert/duplicate SHALL preserve paths and remap new block
keys where applicable. No stored reference SHALL require scanning arbitrary JSON
to answer impact queries. Existing media, revision, audit and build semantics
SHALL remain intact. Existing unavailable links SHALL not block target-only
route/title publication when that target has no unavailable outgoing links.

#### Scenario: Unrelated draft edit
- **WHEN** a title-only save leaves every outgoing reference tuple unchanged
- **THEN** draft revision advances normally, reference rows and dependency revisions remain unchanged, and no build is requested

#### Scenario: Reorder or duplicate
- **WHEN** reference-bearing list items are reordered or their entry is duplicated
- **THEN** locations follow current indices and copied block keys, with no stale usages and no publication of the duplicate

#### Scenario: Lifecycle write fails midway
- **WHEN** a fault occurs after content changes but before reference/counter writes finish
- **THEN** the entire mutation rolls back on Node and D1, including the build queue and dependency revisions

### Requirement: Destructive confirmation is guarded and replay-safe
Delete/unpublish SHALL apply the impact contract of internal-url-links in the
same transaction as existing target preconditions, public-state advance and
outbox write. Unpublish idempotency SHALL include the confirmation input and
replay a committed success before checking now-obsolete receipt state; changed
input under the same key SHALL conflict. Delete SHALL retain existing revision
guards; a retry after deletion SHALL report the existing not-found behavior
without mutating other content. Receipt failures SHALL preserve all target and
source state. Read-only impact access SHALL require `content:read`, while
mutations SHALL retain their existing permissions.

#### Scenario: Lost unpublish response
- **WHEN** an acknowledged unpublication commits and its response is lost
- **THEN** a retry with the same idempotency key and input replays success without a second state bump or build

#### Scenario: Unconfirmed direct API call
- **WHEN** a caller bypasses the dialog and removes a target with published-visible incoming links without acknowledgment
- **THEN** the application returns `CONTENT_LINKS_IN_USE` without writes
