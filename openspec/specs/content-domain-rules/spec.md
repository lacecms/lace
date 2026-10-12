# content-domain-rules Specification

## Purpose

Defines portable CMS domain concepts and rules that keep content behavior
consistent across application use cases, SQLite, D1, Node, and Cloudflare.

## Requirements

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

### Requirement: Default role permissions
The system SHALL represent the global roles `admin`, `editor`, and `viewer` and
the permissions `content:read`, `content:write`, `content:publish`,
`media:write`, `users:manage`, and `settings:manage`. The default matrix SHALL
grant every permission to `admin`; grant `content:read`, `content:write`, and
`media:write` to `editor`; and grant only `content:read` to `viewer`.
Authorization SHALL check requested permissions through an actor rather than
comparing role strings in callers. A missing permission SHALL fail with the
stable authorization error code.

#### Scenario: Editor saves but cannot publish
- **WHEN** an actor with the `editor` role requests `content:write` and then
  `content:publish`
- **THEN** the write permission is granted and the publish permission is
  rejected with the stable authorization error code

#### Scenario: Viewer can read only
- **WHEN** an actor with the `viewer` role requests `content:read`,
  `content:write`, or `media:write`
- **THEN** only the read permission is granted

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

### Requirement: Snapshots carry an optional SEO group with shared validation rules
A draft or published snapshot SHALL be able to carry an SEO group, held apart
from model fields, with the optional values `title`, `description`, `image`,
`canonical` and `noindex`. One portable rule set SHALL normalize and validate
the group, and REST contracts SHALL reuse it:

- `title` and `description` SHALL be single-line plain text. They are trimmed,
  an empty value clears them, and control characters or unpaired surrogates
  are rejected. They are limited to 200 (title) and 500 (description) Unicode
  code points.
- `canonical` SHALL be an absolute `http:` or `https:` URL with a host, no
  user name or password, no fragment and no whitespace. It is at most 2,048
  characters and is stored as submitted after trimming. An empty value clears
  it.
- `image` SHALL be a media identifier.
- `noindex` SHALL be a boolean. `false` is equivalent to absent.

A group whose values are all cleared and whose `noindex` is not `true` SHALL
normalize to no group. Validation failures SHALL be content validation issues
whose JSON Pointers are under `/seo`, for example `/seo/canonical`. Snapshot
cloning, publication, revert and copy SHALL preserve the group unchanged.

#### Scenario: Normalize a submitted group
- **WHEN** a group `{title: "  Hello  ", description: "", noindex: false}` is
  normalized
- **THEN** the result is `{title: "Hello"}`

#### Scenario: An empty group normalizes to none
- **WHEN** a group `{title: " ", canonical: "", noindex: false}` is normalized
- **THEN** the snapshot carries no SEO group

#### Scenario: Reject a relative or unsafe canonical URL
- **WHEN** `canonical` is `/blog/hello`, `//example.com/a`, `ftp://example.com/`,
  `https://user:pass@example.com/` or `https://example.com/a#top`
- **THEN** validation fails at `/seo/canonical`

#### Scenario: Reject over-long or multi-line text
- **WHEN** `title` has 201 code points, `description` has 501 code points, or
  either contains a line break
- **THEN** validation fails at the matching `/seo/...` pointer

#### Scenario: Publication and revert preserve the group
- **WHEN** a draft with an SEO group is published and later reverted
- **THEN** the published snapshot and the reverted draft carry the same group

### Requirement: Blocks carry a presentation envelope
A block of a draft or published snapshot SHALL carry, besides its key, type,
schema version, position and data, an envelope of presentation values: an
optional `anchor`, an optional `className`, a boolean `hidden` and a `settings`
object. The domain SHALL treat the envelope as part of the snapshot value: it
SHALL copy the envelope with the block wherever a snapshot is cloned,
published, reverted or duplicated, and a block built without envelope values
SHALL be completed as visible with no anchor or class name and `{}` settings.
Envelope values SHALL NOT affect block ordering, key or position rules.

#### Scenario: Publication copies the envelope
- **WHEN** a draft whose block carries anchor `pricing`, class name `wide`,
  `hidden: true` and settings `{align: "center"}` is published
- **THEN** the published snapshot's block carries the same four values

#### Scenario: A legacy block value is completed
- **WHEN** a snapshot is built from a block that carries no envelope values
- **THEN** the block reads as visible with `{}` settings and without an anchor
  or class name
