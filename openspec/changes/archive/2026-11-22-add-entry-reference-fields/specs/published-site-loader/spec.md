## ADDED Requirements

### Requirement: Site views resolve authored entry IDs one hop at a time

The site view SHALL expose `site.reference(id)`. After all pages of one
version-bound format-2 export have been assembled, it SHALL return the
immutable site entry for a routed page or collection entry, or the immutable
published record for a route-less collection entry. An unknown or ineligible
ID SHALL return `undefined`. The result SHALL preserve the existing shape
of the target, including the absence of routing properties on a route-less
record. The lookup SHALL use the current view only, with no per-target HTTP
request or recursive expansion. Published field and block data SHALL retain
their authored IDs and ordered lists. A repeated ID SHALL resolve at each
authored position. Conflicting identities in the export SHALL fail as an
invalid export. Sites without reference fields SHALL continue to use the
existing format and lookups.

#### Scenario: A selected record appears on a later export page

- **WHEN** a service page stores [C, A, C] and A appears in a later records page of the same export
- **THEN** mapping the IDs through the lookup returns C, A and C in that order, with the records' published fields and without a per-record request or an invented URL

#### Scenario: Resolving one entry leaves its own references as IDs

- **WHEN** a site resolves a testimonial whose Author field also holds a reference
- **THEN** the returned testimonial exposes the stored author ID, and the author is available through a second explicit lookup

#### Scenario: Unknown or ineligible entry

- **WHEN** a site asks its valid view for an absent ID or the ID of a global
- **THEN** it receives `undefined` without accessing the CMS

#### Scenario: Conflicting identities across the two export phases

- **WHEN** an export claims one ID for a routed entry and a route-less record
- **THEN** assembly fails with the existing invalid-export error

#### Scenario: A target changes independently of its sources

- **WHEN** an author republishes and the next build or revalidation reads the new export version
- **THEN** the existing ID in each article resolves the updated author without republishing the articles, and an unchanged cached view continues to resolve its own version

### Requirement: Site-owned block components receive the same reference lookup

When rendering a site-view entry, the shared render and Astro block contracts
SHALL pass a reference resolver to the site's installed block component. The
resolver SHALL read from the same published or frozen preview view as the
entry. Existing manually assembled renderable entries without a resolver and
components that only consume earlier block props SHALL remain usable. A
lookup without a supplied view SHALL return `undefined` without fetching.

#### Scenario: A site block renders an ordered selection

- **WHEN** a site-owned testimonial block receives its ordered reference IDs and the shared resolver
- **THEN** the component can read each selected record's fields in order from the current build or preview without opening another loader or requesting individual entries

#### Scenario: A legacy caller supplies a minimal entry

- **WHEN** an existing caller renders a block with an entry that supplies no reference resolver
- **THEN** existing block rendering succeeds and a component attempting a reference lookup receives `undefined`
