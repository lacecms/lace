## ADDED Requirements

### Requirement: Route-less collection entries have no public path
The system SHALL permit any number of entries for a route-less collection. The
domain SHALL report that an entry of a route-less collection has no route
instead of resolving a public path, and such an entry SHALL never own a
published route or take part in a public-path conflict. Block ordering and
every other entry rule SHALL apply unchanged on both runtimes.

#### Scenario: A route-less entry has no public path
- **WHEN** the domain is asked for the public path of an entry of the
  route-less `testimonials` collection
- **THEN** it reports that the entry has no route instead of resolving a path

#### Scenario: Many route-less entries publish without conflicts
- **WHEN** three entries of the route-less `testimonials` collection are
  published
- **THEN** each publication succeeds without a route conflict and no published
  route exists for any of them
