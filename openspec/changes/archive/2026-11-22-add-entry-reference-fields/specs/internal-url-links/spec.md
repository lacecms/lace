## MODIFIED Requirements

### Requirement: URL references identify entries independently of their route
An ordinary URL field SHALL accept existing manual safe URLs or the canonical
string `entry:` followed by the URI-component encoding of one entry identifier.
The decoded identifier SHALL have 1–255 UTF-16 code units, contain no control
characters or unpaired surrogates, and round-trip exactly through `encodeURIComponent`; malformed
escapes, noncanonical encodings, an empty identifier and unencoded query/fragment
suffixes SHALL fail. IDs SHALL be opaque, not restricted to UUIDs or ULIDs.
These URL references SHALL target only this installation's page entries and entries of
collections that declare a route. Globals and entries of route-less
collections SHALL be permitted sources but SHALL NOT be targets. An ordinary URL field SHALL retain its string encoding and SHALL NOT automatically
convert literal paths into IDs. Typed fields follow the separate
entry-reference-fields contract.
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

### Requirement: Every declared URL location participates consistently
Reference discovery SHALL follow normalized descriptors through model/global
fields and block data, including supported groups and
lists. Each location SHALL identify its source snapshot, source key (`$fields`
or block key), area (`fields` or `data`) and RFC 6901 pointer relative
to that area, with zero-based list indices. A snapshot SHALL contain at most
200 ordinary internal URL and typed entry-reference occurrences combined after
defaults, independently of media caps.
Repeated IDs, retained hidden values and hidden blocks SHALL count in each
normalized snapshot that contains them. Only URL occurrences SHALL enter
URL-target checks and internalLinks manifests. Block settings SHALL retain their
existing select/boolean/number/text allowlist and SHALL NOT produce references.
Token-like text in settings SHALL remain ordinary text.
Hidden-block references SHALL stay tracked but SHALL NOT be delivered or block
publication for unavailable targets. Requiredness and all other validation of
hidden blocks SHALL retain existing behavior.

#### Scenario: Nested paths are unambiguous
- **WHEN** a gallery's third item has a reference and a nested model field has one
- **THEN** usages identify the block key with area `data` and pointer `/images/2/link`, and source key `$fields` with area `fields` and the model field's relative pointer, respectively

#### Scenario: Settings retain their existing contract
- **WHEN** a text setting contains `entry:post-a`, or a block definition declares a URL setting
- **THEN** the text creates no reference and the URL setting is rejected by the existing settings allowlist

#### Scenario: Reference occurrence limit
- **WHEN** a normalized snapshot has 200 or 201 references, even to one ID
- **THEN** 200 is accepted and 201 is rejected at the crossing location in both runtimes without writes

#### Scenario: Hidden block is later enabled
- **WHEN** an unavailable reference is stored in a hidden block and then that block is made visible
- **THEN** draft save succeeds with a warning and publication requires resolving that reference

### Requirement: Incoming usages require informed lifecycle confirmation
Delete and unpublish SHALL expose a paginated impact view of all current draft
and published URL source entities and exact URL locations, with draft, published-visible
and published-hidden groups distinguished. For unpublish, usages in the target's
own publication disappear with that publication and SHALL NOT require additional
acknowledgment; its retained draft usages SHALL be shown. For delete, all source
snapshots removed by that deletion SHALL be excluded from external impact.
Published-visible external URL usages SHALL require explicit additional confirmation
bound to the target/action, existing target revision/snapshot guards, actor and
the observed incoming dependency revision. Without acknowledgment the command
SHALL fail with `CONTENT_LINKS_IN_USE`; an outdated impact receipt SHALL fail
with `CONTENT_LINK_IMPACT_CHANGED`. Both SHALL be HTTP 409 with no writes.
Draft-only and hidden usages SHALL warn but SHALL NOT require the additional
published-link acknowledgment. Confirmation SHALL NOT bypass permissions,
singleton restrictions or existing lifecycle preconditions. No blanket force
flag or rewriting of sources SHALL substitute for the observed impact.
An acknowledgment SHALL apply to URL impact only. Typed reference dependencies
SHALL be evaluated independently under entry-reference-fields.

#### Scenario: Confirmed unpublication
- **WHEN** an authorized publisher reviews published incoming URL links, there is no blocking typed dependency, and the publisher submits the current impact receipt with explicit acknowledgment
- **THEN** unpublication succeeds atomically, keeps source IDs and drafts unchanged, advances published state and requests a rebuild

#### Scenario: Incoming link changes during confirmation
- **WHEN** a source is published, unpublished, hidden, removed or changes a referenced location after impact was read
- **THEN** the stale confirmation fails before target mutation and the UI can load a fresh impact view

#### Scenario: Publication races destination removal
- **WHEN** one operation publishes a new incoming reference while another confirms removal
- **THEN** either publication precedes removal and invalidates its receipt, or removal precedes publication and makes publication fail target validation; an unreviewed incoming link is never accepted by both operations

#### Scenario: Existing permission and cardinality restrictions
- **WHEN** a viewer confirms removal, an editor unpublishes, or an administrator deletes a page/global singleton
- **THEN** existing authorization/cardinality failures remain in force and no receipt grants extra authority
