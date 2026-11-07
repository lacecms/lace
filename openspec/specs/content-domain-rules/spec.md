# content-domain-rules Specification

## Purpose

Defines portable CMS domain concepts and rules that keep content behavior
consistent across application use cases, SQLite, D1, Node, and Cloudflare.

## Requirements

### Requirement: Portable content domain vocabulary and stable failures
The system SHALL expose portable, framework-independent domain values for
content-model kinds, stable model and entry identities, drafts, published
snapshots, flat ordered blocks, media metadata, publication/build state, and
authenticated actors. A content model kind SHALL be `page`, `collection` or
`global`. Domain values and failures SHALL not depend on REST DTOs,
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

#### Scenario: Name every model kind
- **WHEN** a consumer reads the portable model kind of a configured model
- **THEN** the kind is exactly one of `page`, `collection` and `global`

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

### Requirement: Identifier grammar, route rules and transport limits are defined once
The content package SHALL publish one portable definition of each of the
following:

- the slug grammar (lowercase ASCII letters or digits in runs joined by single
  hyphens) and its maximum length of 100 characters;
- the field key grammar (an ASCII letter followed by ASCII letters or digits);
- the block type grammar (an ASCII letter followed by ASCII letters, digits or
  hyphens);
- the model key grammar (a lowercase ASCII letter followed by lowercase
  letters or digits, in runs joined by single hyphens);
- the supported video embed providers (`youtube`, `vimeo`);
- the content model kinds;
- the canonical route rules;
- these transport limits:

| Limit | Value |
| --- | --- |
| Entry search term length | 200 characters |
| Media search term length | 200 characters |
| Media usage entries returned by one read | 50 |
| Entries per build-export page | 100 |
| Entry title length | 200 characters |
| Items per admin list page | 1 to 100, default 50 |
| Media references in one draft | 200 |
| Entry IDs in one link-target resolution | 200 |

The domain package SHALL publish one portable definition of the media tag
rules and the account display-name rule:

- a normalized media tag of 1 to 40 lowercase ASCII letters, digits or hyphens;
- at most 200 code points per submitted tag before normalization;
- at most 20 distinct tags per media item;
- at most 5 tags per media-list filter;
- a display name of 1 to 120 characters after trimming, without control
  characters.

The canonical route rules are:

- A route value is canonical when it is a nonempty string that starts with
  `/`, contains no `?`, `#`, `\`, whitespace or `//`, has no trailing `/`
  unless it is `/`, and has no `.` or `..` segment.
- A page path is a canonical route value without parameter segments.
- A collection route is a canonical route value with exactly one `:slug`
  segment and no other parameter segment.
- A collection entry's public path is its collection route with `:slug`
  replaced by a valid slug, and the result is a canonical page path.

Configuration validation, domain rules, application use cases, persistence
adapters, REST and MCP contracts, the generated OpenAPI document, the SDK, the
server and the admin SHALL apply these definitions instead of declaring their
own copies. A layer that may not import the owning package SHALL receive the
definition through a package it may import.

Each layer SHALL keep its own failure type and stable code: configuration
rejects with a configuration error, and the domain rejects with
`CONTENT_INVALID_STATE`. Configuration and domain failures for the same
rejected value SHALL use the same message text. Transport failures SHALL keep
their current status codes, pointers and generic messages.

The values that are accepted and rejected SHALL stay the same as before this
requirement, on Node and Cloudflare, with one exception: the admin router no
longer matches a model key that starts with a digit, which configuration has
never accepted.

#### Scenario: Configuration and domain agree on a collection route
- **WHEN** configuration validation and the domain each check the collection
  route `/blog/:slug/:id`
- **THEN** both reject it, with a configuration error and with
  `CONTENT_INVALID_STATE` respectively, and both messages read "route must
  contain exactly one :slug segment and no other parameters."

#### Scenario: Configuration and domain resolve the same public path
- **WHEN** configuration and the domain each resolve the collection route
  `/blog/:slug` with slug `release-notes`
- **THEN** both return `/blog/release-notes`

#### Scenario: Reject a malformed slug everywhere
- **WHEN** the slug `Release_Notes`, `release--notes`, `-release` or a
  101-character slug is resolved by configuration or the domain, or is
  submitted as a collection entry slug query value
- **THEN** each layer rejects it with its own failure type, and the REST
  query rejection keeps its current 422 pointer

#### Scenario: Reject non-canonical paths
- **WHEN** a page path such as `/blog/`, `/a//b`, `/a/../b`, `/a?b`, `blog` or
  `/a b` is checked by configuration or by the domain
- **THEN** both reject it as a non-canonical path

#### Scenario: One transport limit bounds every layer
- **WHEN** a media search term of 201 characters reaches the REST media list
  query or the application media list use case
- **THEN** both reject it at the same bound, and a 200-character term is
  accepted by both

#### Scenario: Runtime search limits stay separate
- **WHEN** a Cloudflare deployment advertises its narrower entry search
  limit in content model discovery
- **THEN** that runtime limit is unchanged and still applies below the shared
  200-character transport bound

#### Scenario: A changed limit changes every consumer
- **WHEN** a maintainer changes the declared media usage limit
- **THEN** the application read bound, both runtime repositories, the
  in-memory test store and the media detail DTO schema use the new value
  without another edit

#### Scenario: One field key grammar everywhere
- **WHEN** the field key `2col`, `col-2` or `col_2` is used in a configured
  field, a list sort `field:<key>`, a collection query filter, field metadata
  or a synchronization hint
- **THEN** configuration, the domain, the REST query contracts, the SQL list
  query and the admin editor all reject it, and the OpenAPI field key pattern
  is the same grammar

#### Scenario: Media tag rules have one owner
- **WHEN** a media item is updated with 21 distinct tags, or a media list is
  filtered by 6 tags
- **THEN** every layer that enforces the bound (REST contracts, application,
  persistence and admin) refuses it at the value declared by the domain
  package, and 20 tags or 5 filter tags are accepted

#### Scenario: A raw tag may be longer than its normalized form
- **WHEN** an upload sends a tag part of 60 code points that normalizes to 40
  characters
- **THEN** it is accepted, and a part of 201 code points is refused before
  normalization

#### Scenario: Display names share one rule
- **WHEN** an invitation or a profile update supplies a display name of 121
  characters or one containing a control character
- **THEN** the REST contract and the account use case both reject it
