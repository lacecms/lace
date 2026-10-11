## MODIFIED Requirements

### Requirement: Portable content domain vocabulary and stable failures
The system SHALL expose portable, framework-independent domain values for
content-model kinds, stable model and entry identities, drafts, published
snapshots, flat ordered blocks, media metadata, publication/build state, and
authenticated actors. A content model kind SHALL be either `page` or
`collection`. Domain values and failures SHALL not depend on REST DTOs,
database rows, Better Auth, Node, Cloudflare, or framework types. Rule failures
SHALL use stable machine-readable domain error codes covering authorization,
invalid content state, page-cardinality conflict, revision conflict,
public-route conflict, attempted mutation of published data, an operation that
requires a current publication on an entry that has none
(`CONTENT_NOT_PUBLISHED`), and a lifecycle operation that page singletons do
not support (`CONTENT_PAGE_SINGLETON`).

#### Scenario: Consume portable content state
- **WHEN** an application use case or runtime adapter receives a content entry,
  snapshot, block, media item, build state, or actor
- **THEN** it can consume the same domain contract without importing a transport
  framework, authentication session type, database row type, or runtime API

#### Scenario: Identify a rejected domain operation
- **WHEN** a domain rule rejects an unauthorized action, invalid lifecycle
  state, singleton race, stale revision, public-path collision, or mutation of
  published data
- **THEN** the failure includes its stable domain error code and does not expose
  infrastructure-specific error text

#### Scenario: Identify an operation that needs a publication
- **WHEN** a caller unpublishes or reverts an entry that has no current
  published snapshot
- **THEN** the failure carries `CONTENT_NOT_PUBLISHED` and no
  infrastructure-specific text

#### Scenario: Identify an unsupported page lifecycle operation
- **WHEN** a caller deletes or duplicates a page entry
- **THEN** the failure carries `CONTENT_PAGE_SINGLETON`

### Requirement: Draft and publication lifecycle invariants
Every committed content entry SHALL have exactly one mutable draft snapshot and
zero or one published snapshot. A complete draft mutation SHALL replace the
draft aggregate atomically, preserve a complete ordered block list, and advance
its revision by exactly one. Publication SHALL create an immutable detached
snapshot from the current draft while retaining an independent mutable draft;
later draft mutations SHALL not alter the published snapshot. A later
publication SHALL replace the one current published snapshot without creating
application-level revision history. Unpublication SHALL remove the current
published snapshot and its route while leaving the draft, its revision, and its
content unchanged; the removed snapshot SHALL not be recoverable, and a later
publication SHALL publish the then-current draft. Reverting a draft SHALL
replace the draft's title, slug, fields, blocks, and media references with the
published snapshot's values, advance the draft revision by exactly one, and set
the published snapshot's revision to the new draft revision without changing
its content, so an entry whose draft equals its publication is derived as
`published`. Page entries SHALL exist for as long as their page model is
configured; they SHALL not be deleted or duplicated through content commands.

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
