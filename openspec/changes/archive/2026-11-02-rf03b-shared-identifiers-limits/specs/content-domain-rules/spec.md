## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Identifier grammar, route rules and transport limits are defined once
The content package SHALL publish one portable definition of each of the
following: the slug grammar (lowercase ASCII letters or digits in runs joined
by single hyphens) and its maximum length of 100 characters; the content
model kinds; the canonical route rules; and these transport limits:

| Limit | Value |
| --- | --- |
| Entry search term length | 200 characters |
| Media search term length | 200 characters |
| Media usage entries returned by one read | 50 |
| Entries per build-export page | 100 |

The canonical route rules are:

- A route value is canonical when it is a nonempty string that starts with
  `/`, contains no `?`, `#`, `\`, whitespace or `//`, has no trailing `/`
  unless it is `/`, and has no `.` or `..` segment.
- A page path is a canonical route value without parameter segments.
- A collection route is a canonical route value with exactly one `:slug`
  segment and no other parameter segment.
- A collection entry's public path is its collection route with `:slug`
  replaced by a valid slug, and the result is a canonical page path.

Configuration validation, domain rules, application use cases, REST and MCP
contracts, the server and the admin SHALL apply these definitions instead
of declaring their own copies. Each layer SHALL keep its own failure type and
stable code: configuration rejects with a configuration error, and the domain
rejects with `CONTENT_INVALID_STATE`. Configuration and domain failures for
the same rejected value SHALL use the same message text. Transport failures
SHALL keep their current status codes, pointers and generic messages. The
values that are accepted and rejected SHALL stay the same as before this
requirement, on Node and Cloudflare.

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
