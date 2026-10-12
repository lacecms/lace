## MODIFIED Requirements

### Requirement: Content cardinality, paths, and block ordering
The system SHALL permit exactly one entry for a `page` model and for a `global`
model, and any number of entries for a `collection` model. A page's public path
SHALL be its fixed canonical model path. A global SHALL have no public path and
SHALL never own a published route. A collection entry SHALL resolve its
canonical route from the model's single `:slug` segment only when it has a
valid lowercase ASCII slug of letters or digits separated by single hyphens. A
resolved public path SHALL conflict when it is already owned by a different
entry.

Blocks SHALL form one flat ordered list with unique stable keys and positive,
strictly increasing safe-integer positions. New or normalized positions SHALL
use sparse increments of 1,000; insertion SHALL use a safe in-between position
when one exists and SHALL require normalization when no integer gap remains.
Normalization SHALL preserve block order.

Invalid non-positive, unsafe, duplicate, or descending positions SHALL be rejected
with `CONTENT_INVALID_STATE` before persistence on both runtimes. The ordering
message SHALL identify the zero-based offending block index, include its key
only when it is a bounded safe identifier, and explain that positions must be
positive safe integers in strictly increasing order. It SHALL advise resubmitting
positions in displayed order, without exposing block data or arbitrary key text.
The domain SHALL NOT sort or normalize invalid client input into acceptance.

#### Scenario: Detect a page singleton race
- **WHEN** a second entry is created for a `page` model that already has its
  singleton entry
- **THEN** the operation is rejected with the stable page-cardinality conflict
  code

#### Scenario: Detect a global singleton race
- **WHEN** a second entry is created for a `global` model that already has its
  singleton entry
- **THEN** the operation is rejected with the same cardinality conflict code

#### Scenario: A global has no public path
- **WHEN** the domain is asked for the public path of a global entry
- **THEN** it reports that the entry has no route instead of resolving a path

#### Scenario: Resolve a published collection path
- **WHEN** a collection with route `/blog/:slug` publishes an entry with slug
  `release-notes`
- **THEN** its public path is `/blog/release-notes`

#### Scenario: Reject a conflicting public path
- **WHEN** an entry resolves to a public path owned by a different entry
- **THEN** the operation is rejected with the stable public-route conflict code

#### Scenario: Normalize exhausted block positions
- **WHEN** an insertion has no integer position between adjacent ordered blocks
- **THEN** the system normalizes the complete list into increasing 1,000-step
  positions without changing block order

#### Scenario: Reject invalid ordering without changing state
- **WHEN** a writer submits non-positive, unsafe, duplicate or descending positions
- **THEN** the request fails with the offending index and a safe reason, and draft revision, published snapshot and build state remain unchanged

#### Scenario: Diagnostics exclude arbitrary key text and block data
- **WHEN** an invalid ordered aggregate carries an unsafe or oversized key or sensitive block data
- **THEN** the ordering error includes the index and recovery instruction without echoing that key or data

### Requirement: Draft and publication lifecycle invariants
Every committed content entry SHALL have exactly one mutable draft snapshot and
zero or one published snapshot. A complete draft mutation SHALL replace the
draft aggregate atomically, preserve a complete ordered block list, and advance
its revision by exactly one. Publication SHALL create an immutable detached
snapshot from the current draft while retaining an independent mutable draft;
later draft mutations SHALL not alter the published snapshot. A later
publication SHALL replace the one current published snapshot without creating
application-level revision history. Unpublication SHALL remove the current
published snapshot and its route, if any, while leaving the draft, its
revision, and its content unchanged; the removed snapshot SHALL not be
recoverable, and a later publication SHALL publish the then-current draft.
Reverting a draft SHALL replace the draft's title, slug, fields, blocks, and
media references with the published snapshot's values, advance the draft
revision by exactly one, and set the published snapshot's revision to the new
draft revision without changing its content, so an entry whose draft equals
its publication is derived as `published`. Page and global entries SHALL exist
for as long as their model is configured; they SHALL not be deleted or
duplicated through content commands, and such a request SHALL fail with
`CONTENT_PAGE_SINGLETON`, whose message names configuration-defined singleton
entries rather than pages only.

#### Scenario: Preserve published content after a later draft save
- **WHEN** an entry is published and its draft is subsequently saved with a
  changed title, fields, slug, or blocks
- **THEN** the published snapshot remains unchanged and the draft revision
  advances exactly once

#### Scenario: Reject mutation of published data
- **WHEN** a caller attempts to mutate data that belongs to a published
  snapshot
- **THEN** the system rejects the operation with the stable published-data
  immutability error code

#### Scenario: Unpublication keeps the draft
- **WHEN** an entry with saved but unpublished draft changes is unpublished
- **THEN** the entry has no published snapshot, its derived status is `draft`,
  and its draft keeps the same revision, title, slug, fields, and blocks

#### Scenario: Republication after unpublication publishes the current draft
- **WHEN** an unpublished entry's draft is published again
- **THEN** a new published snapshot with a new identity is created from the
  current draft and the removed snapshot's content is not restored

#### Scenario: Revert restores the published content into the draft
- **WHEN** a published entry with changed draft content at revision 5 and a
  published snapshot at revision 3 is reverted
- **THEN** the draft holds the published title, slug, fields, and blocks at
  revision 6, the published snapshot keeps its content with revision 6, and the
  entry is derived as `published`

#### Scenario: A global entry cannot be deleted or duplicated
- **WHEN** a delete or duplicate operation targets a global entry
- **THEN** it fails with `CONTENT_PAGE_SINGLETON` and the entry is unchanged
