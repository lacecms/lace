## Purpose

Defines stable links to routable CMS entries in ordinary URL fields, with
predictable removal, recovery and bounded execution on Node and Cloudflare D1.

## ADDED Requirements

### Requirement: URL references identify entries independently of their route
An ordinary URL field SHALL accept existing manual safe URLs or the canonical
string `entry:` followed by the URI-component encoding of one entry identifier.
The decoded identifier SHALL have 1–255 UTF-16 code units, contain no control
characters or unpaired surrogates, and round-trip exactly through `encodeURIComponent`; malformed
escapes, noncanonical encodings, an empty identifier and unencoded query/fragment
suffixes SHALL fail. IDs SHALL be opaque, not restricted to UUIDs or ULIDs.
References SHALL target only this installation's page/collection entries.
Globals SHALL be permitted sources but SHALL NOT be targets. No descriptor
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

### Requirement: Every declared URL location participates consistently
Reference discovery SHALL follow normalized descriptors through model/global
fields and block data, including supported groups and
lists. Each location SHALL identify its source snapshot, source key (`$fields`
or block key), area (`fields` or `data`) and RFC 6901 pointer relative
to that area, with zero-based list indices. A snapshot SHALL contain at most
200 internal-reference occurrences after defaults, independently of media caps.
Repeated IDs and hidden blocks SHALL count. Block settings SHALL retain their
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

### Requirement: Drafts retain unresolved destinations and publication is strict
A syntactically valid reference to a missing or unpublished entry SHALL be
saveable in a draft and SHALL retain its original ID with a path-local warning.
A known global target SHALL be rejected as non-routable. Publication SHALL
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

### Requirement: Incoming usages require informed lifecycle confirmation
Delete and unpublish SHALL expose a paginated impact view of all current draft
and published source entities and exact locations, with draft, published-visible
and published-hidden groups distinguished. For unpublish, usages in the target's
own publication disappear with that publication and SHALL NOT require additional
acknowledgment; its retained draft usages SHALL be shown. For delete, all source
snapshots removed by that deletion SHALL be excluded from external impact.
Published-visible external usages SHALL require explicit additional confirmation
bound to the target/action, existing target revision/snapshot guards, actor and
the observed incoming dependency revision. Without acknowledgment the command
SHALL fail with `CONTENT_LINKS_IN_USE`; an outdated impact receipt SHALL fail
with `CONTENT_LINK_IMPACT_CHANGED`. Both SHALL be HTTP 409 with no writes.
Draft-only and hidden usages SHALL warn but SHALL NOT require the additional
published-link acknowledgment. Confirmation SHALL NOT bypass permissions,
singleton restrictions or existing lifecycle preconditions. No blanket force
flag or rewriting of sources SHALL substitute for the observed impact.

#### Scenario: Confirmed unpublication
- **WHEN** an authorized publisher reviews published incoming links and submits the current impact receipt with explicit acknowledgment
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

### Requirement: Unavailable targets degrade without active navigation
Published resolution SHALL use only the same complete export's routable entries.
An absent target SHALL resolve as unavailable, never to its former path, a new
owner of that path, `#`, the CMS admin, or the raw `entry:` string. Existing
published unavailable references SHALL generate diagnostics and allow builds.
The Link block and Hero/CTA actions SHALL retain labels as plain text without
active-control styling; navigation SHALL retain labels and valid descendants;
image/gallery usages SHALL render without a link and retain their configured
lightbox behavior. Recovery of the same target ID through republication SHALL
restore navigation after rebuilding, without editing sources. A new publication
of a source that still has an unavailable delivered reference SHALL fail.

#### Scenario: Removal is reflected after deployment
- **WHEN** a confirmed target removal is followed by a successful site deployment
- **THEN** affected content stays visible in non-navigating form and no emitted href contains `entry:`

#### Scenario: Target is republished
- **WHEN** the same ID obtains a published route again
- **THEN** the next successful build restores its incoming links to the current route

#### Scenario: Missing destination versus unavailable CMS
- **WHEN** a complete valid export lacks a target, or fetching the export fails
- **THEN** the former gives an unresolved-link warning and the latter fails the build under existing transport rules

### Requirement: Diagnostics are bounded and actionable
The admin SHALL show missing, unpublished and non-routable states with source
locations and replacement/clear actions. Builds SHALL expose the total number
of unresolved delivered locations and the first 100 deterministic diagnostics
ordered by source ID, area, source key and pointer, with a truncation indicator.
Diagnostics SHALL contain only IDs, model keys and location pointers, no draft
titles/content, credentials or arbitrary URL values. Warning collection SHALL
run once per assembled export rather than once per page render.

#### Scenario: Many usages of one missing target
- **WHEN** an export has 150 unresolved locations
- **THEN** the build reports total 150, exposes 100 ordered details and a truncated indicator, and repeated rendering does not repeat diagnostics or trigger HTTP requests

### Requirement: Manual URLs retain their existing limitations
Manual safe URLs SHALL remain unchanged and SHALL NOT acquire ID-based tracking,
deletion guards, redirect history or availability guarantees. Internal-reference
tokens SHALL NOT support fragment/query suffixes in this unit. Link captions
SHALL be authored independently of the selected target's current title.

#### Scenario: Manual path and anchor become outdated
- **WHEN** `/old#section` is entered manually and the path or anchor later changes
- **THEN** Lace preserves that value without claiming to repair it or blocking builds through a network health check

#### Scenario: Destination title changes
- **WHEN** the target title changes after a Link block was labelled `Read more`
- **THEN** the picker shows the updated target title and the authored label stays `Read more`
