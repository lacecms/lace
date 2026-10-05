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
public-route conflict, and attempted mutation of published data.

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
The system SHALL permit exactly one entry for a `page` model and any number of
entries for a `collection` model. A page's public path SHALL be its fixed
canonical model path. A collection entry SHALL resolve its canonical route from
the model's single `:slug` segment only when it has a valid lowercase ASCII
slug of letters or digits separated by single hyphens. A resolved public path
SHALL conflict when it is already owned by a different entry.

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
application-level revision history.

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
