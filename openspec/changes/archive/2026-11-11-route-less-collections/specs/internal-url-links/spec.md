## MODIFIED Requirements

### Requirement: URL references identify entries independently of their route
An ordinary URL field SHALL accept existing manual safe URLs or the canonical
string `entry:` followed by the URI-component encoding of one entry identifier.
The decoded identifier SHALL have 1–255 UTF-16 code units, contain no control
characters or unpaired surrogates, and round-trip exactly through `encodeURIComponent`; malformed
escapes, noncanonical encodings, an empty identifier and unencoded query/fragment
suffixes SHALL fail. IDs SHALL be opaque, not restricted to UUIDs or ULIDs.
References SHALL target only this installation's page entries and entries of
collections that declare a route. Globals and entries of route-less
collections SHALL be permitted sources but SHALL NOT be targets. No descriptor
kind, object-valued reference field or automatic path-to-ID conversion is added.
Provider-restricted URL fields, rich text, SEO canonical URLs, media values and
ordinary text that happens to start with `entry:` SHALL retain their contracts.

#### Scenario: Slug changes without editing link sources
- **WHEN** target `post-a` moves from `/blog/old` to `/blog/new` through publication
- **THEN** stored `entry:post-a` values remain unchanged and the next successful build links to `/blog/new` without republishing sources

#### Scenario: Draft route changes stay private
- **WHEN** the target's draft changes its slug but its publication is unchanged
- **THEN** every public resolution continues to use the published route

#### Scenario: Literal strings are not discovered as references
- **WHEN** a text field, rich-text text node or JSON key contains `entry:post-a`
- **THEN** it creates no usage or dependency; a rich-text link with that href is rejected

#### Scenario: Canonical opaque identifiers
- **WHEN** identifier `a/b` is selected and stored as `entry:a%2Fb`
- **THEN** it resolves to the entry with ID `a/b`, while `entry:`, `entry:%ZZ`, `entry:post-a#x` and `entry:%70ost-a` fail field validation

#### Scenario: A route-less entry is a source but not a target
- **WHEN** an entry of the route-less `testimonials` collection links to the
  published page `about`, and a page draft stores `entry:<testimonial-id>`
- **THEN** the testimonial saves and publishes with a delivered reference to
  `about`, and the page draft save fails with a `non-routable` issue at the
  URL field path

### Requirement: Drafts retain unresolved destinations and publication is strict
A syntactically valid reference to a missing or unpublished entry SHALL be
saveable in a draft and SHALL retain its original ID with a path-local warning.
A known global target, or a known entry of a route-less collection, SHALL be
rejected as non-routable in draft and publish mode. Publication SHALL
require every delivered internal reference to have a published route at commit
time, except that a self-reference SHALL use the publishing entry's candidate
route. Invalid targets SHALL produce field-path issues without changing the
entry, route, published version or build queue. Mutual links SHALL be allowed;
resolution SHALL NOT traverse targets' outgoing links. A manually entered URL
SHALL be validated syntactically without network availability or anchor checks.

#### Scenario: Draft-only target
- **WHEN** a draft selects an unpublished target
- **THEN** saving succeeds with a warning and publication fails with a localizable `internal_link_unavailable` issue until the target is published or the source link is removed/replaced

#### Scenario: First publication links to itself
- **WHEN** a valid first publication contains an internal reference to its own ID
- **THEN** publication succeeds using its candidate route

#### Scenario: Mutual references
- **WHEN** published A links to B and B is published with a link to A
- **THEN** both resolve in constant lookup depth and do not create a cycle error

#### Scenario: A route is reused by a different entry
- **WHEN** a deleted target's old slug is assigned to a new entry with another ID
- **THEN** references to the original ID stay unresolved and do not silently retarget

#### Scenario: Linking to a route-less entry
- **WHEN** a draft or publication submits a reference to an existing entry of
  a route-less collection
- **THEN** it fails with a path-local non-routable issue and the entry, routes,
  published version and build queue are unchanged
