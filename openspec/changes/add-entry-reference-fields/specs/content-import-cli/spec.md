## MODIFIED Requirements

### Requirement: References name package items and appear only where their type is expected
A value `{"$media": "<key>"}` SHALL be accepted only as the value of a media
field (in model fields, groups, list items or block data) and as `seo.image`,
and SHALL name a media key of the same package. A value
`{"$entry": "<key>"}` SHALL be accepted in an ordinary URL field or a typed
reference field at any supported depth, including lists, groups and block
data. It SHALL name a package entry. An ordinary URL destination SHALL be a
page or routed collection entry. A reference destination SHALL be a page or
collection entry allowed by that field's model set, including a route-less
collection. A reference object SHALL have exactly one property. Unknown
keys, globals, disallowed models or positions SHALL be invalid at the value's
JSON Pointer. Before saving, the CLI SHALL replace a media marker with the
media item's ID, an ordinary URL marker with its canonical `entry:<id>` token
and a typed reference marker with its raw target ID. Literal media IDs, URL
tokens and raw typed IDs in their declared positions SHALL pass through as
authored without guessing semantics from other strings.

#### Scenario: Media reference in a text field
- **WHEN** an entry places `{"$media": "hero"}` in a text field
- **THEN** validation fails at that field's pointer and nothing is written

#### Scenario: Entry reference to a global
- **WHEN** a URL field references the key of a global entry
- **THEN** validation fails at that field's pointer

#### Scenario: Reference becomes a link token
- **WHEN** an entry's URL field references the entry `contact` whose server ID is `abc/1`
- **THEN** the saved draft holds `entry:abc%2F1` in that field

#### Scenario: Ordered route-less references lower to raw IDs
- **WHEN** a list of reference fields selects the same package review before and after another review, and its matched ID is `abc/1`
- **THEN** both occurrences store `abc/1` in the original positions, and an ordinary URL field attempting to select the route-less review is rejected

#### Scenario: A local entry key names the wrong model
- **WHEN** a review field nested in block list data targets a package entry in the authors model
- **THEN** offline validation reports that exact marker's pointer before a request or a write

### Requirement: Publication follows link dependencies
With `--publish`, entries whose `publish` is not `false` SHALL be published
when their draft is not already the published version. The order SHALL publish
a link target before any entry that links to it from a delivered location
(model fields or a block that is not hidden) when the target has no published
version. A dependency cycle among entries that need such ordering, or a
delivered link to a package entry that has no published version and will not
be published, SHALL fail before the first write with the involved keys.
The plan SHALL include delivered typed references in target-first ordering.
For a reversal involving already-published entries it SHALL order publication
of the source that removes the old dependency before the source that introduces
its reverse. It SHALL reject an unsatisfiable update to the published graph
that is determinable from its input and authorized reads, and SHALL preserve
ordinary URL behavior, including the existing staged mutual URL rules.
Without `--publish`, nothing SHALL be published and the plan SHALL say that
publication was skipped.

#### Scenario: Linked entries publish in order
- **WHEN** `home` links to the unpublished collection entry `posts/launch` and both are published by the import
- **THEN** `posts/launch` is published before `home`

#### Scenario: Cycle among new entries
- **WHEN** two unpublished entries link to each other from delivered fields and `--publish` is given
- **THEN** the command fails before the first write and names both keys

#### Scenario: Hidden block link does not order publication
- **WHEN** the only link to an unpublished target is inside a hidden block
- **THEN** that link adds no ordering constraint

#### Scenario: Reversal works with published entries in reverse package order
- **WHEN** published A selects B, both updated drafts replace it with B selecting A, and the import package lists B first
- **THEN** the plan publishes A before B using distinct guarded entry publications and the final published graph contains only B selecting A

#### Scenario: Draft-only route-less dependency is not scheduled for publication
- **WHEN** a delivered service field selects an unpublished package review marked `publish: false` and the service will publish
- **THEN** the plan reports the affected package keys before the first write

## ADDED Requirements

### Requirement: Draft import ordering preserves entry-reference integrity

Offline validation SHALL detect self, mutual and longer typed-reference cycles
identifiable from package keys, including hidden fields or hidden blocks,
with or without `--publish`. It SHALL report participating keys and field
locations without contacting a server. It SHALL validate known target models,
value and list shape, and combined snapshot budgets. It SHALL defer conclusions
about literal server IDs, current external dependencies or published snapshots
that cannot be established from package data to authorized server checks.

Online planning SHALL use the existing import authority and matched candidates
to order complete draft saves so a staged reversal removes the old dependency
before introducing its reverse, independent of input order. It SHALL preserve
existing draft revision guards, conflicts, the two-phase creation of draft
identities, list order, and resumable bookkeeping. The dry run SHALL report
the planned order when draft or publication order matters. All creates, saves
and publications SHALL still pass the server's current guarded graph checks.
A graph conflict discovered at write time SHALL stop remaining work and
preserve the state for a safe rerun without clearing other entries, publishing
them automatically or silently dropping references from the complete candidate.

#### Scenario: Package cycle without publication
- **WHEN** a hidden block in A selects B and B selects A through a typed field, and the operator runs `--validate-only` without `--publish`
- **THEN** the CLI rejects the cycle with both keys and reference locations and makes zero requests

#### Scenario: Staged draft reversal respects current edges
- **WHEN** existing drafts have A selecting B, and candidates list B selecting A first and A clearing its selection second
- **THEN** the CLI saves A before B and a rerun after interruption between the writes resumes without duplicates or redundant publications

#### Scenario: A remote edge changed since planning
- **WHEN** a concurrently edited source outside the package completes a path that would make the next import write cyclic
- **THEN** the server rejects the operation, the CLI reports a sanitized actionable failure and a retry can resume recorded successful writes
