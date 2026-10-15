## ADDED Requirements

### Requirement: Node build-export pages read one consistent snapshot
The Node adapter SHALL read each build-export page inside one SQLite read
transaction. The page's version check, entry selection, snapshot, block,
global and media reads SHALL therefore observe one database state.
Concurrent writers in other connections or processes SHALL NOT produce a page
that mixes two published states. A page SHALL use set-based reads bounded by
the page's path range. It SHALL NOT issue one query per entry, block or media
reference.

#### Scenario: A dispatcher publishes during a page read
- **WHEN** another connection commits a publication while a page is being
  read
- **THEN** the page reflects only the state at the start of its transaction,
  and the next continuation request fails with `BUILD_EXPORT_VERSION_CHANGED`

#### Scenario: A page loads aggregates without N+1 queries
- **WHEN** a page holds 100 entries with ordered blocks and media
- **THEN** the adapter loads them with a fixed number of range-bounded
  statements independent of the number of entries
