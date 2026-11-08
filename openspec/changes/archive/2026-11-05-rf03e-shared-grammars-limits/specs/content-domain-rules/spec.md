## MODIFIED Requirements

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
