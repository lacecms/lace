## MODIFIED Requirements

### Requirement: Node content reads use validated, stable cursor boundaries
The Node persistence adapter SHALL return portable entry aggregates and bounded
cursor pages without database-row types. It SHALL encode continuation cursors as
base64url-encoded versioned JSON, validate the version and every value before
using a cursor as a query boundary, and reject malformed, unsupported, or
wrong-kind cursors without running an unbounded query. An admin model-entry
cursor's kind SHALL bind the model key, search term, status filter, sort, canonical field filters and effective query configuration. It
SHALL be rejected for any other combination. It SHALL be ordered by the
requested sort key and then by entry ID in the same direction: `updated_at`,
case-insensitive draft title, or published snapshot `created_at` with
never-published entries treated as earliest. Configured field sorts SHALL follow the typed and missing-value rules in
collection-query-options: numeric/boolean/date/datetime boundaries SHALL encode
a bounded typed scalar plus missing rank, while custom string boundaries SHALL
use the bounded entry/current-draft/revision anchor protocol with an indexed,
consistent lookup and explicit invalidation described there. Custom cursors
SHALL stay within 4096 characters and SHALL bind the complete canonical query
through a fixed-length fingerprint rather than copy unbounded string values or
field names into the cursor. The default SHALL remain
`(updated_at DESC, id DESC)` and SHALL use the model-entry list index. A public
collection page SHALL be ordered by
`(published snapshot created_at DESC, entry id DESC)`. Neither cursor is an
authorization claim, and neither SHALL require a signature.

Configured predicates SHALL execute over the model's current drafts before cursor boundaries and LIMIT. Filter values and field paths SHALL be bound safely; unsupported keys SHALL never become SQL expressions. Node and D1 SHALL share match, total and boundary semantics for requests accepted by both runtime policies; Node retains its 200-code-unit q/contains budget, while D1 rejects over-budget escaped LIKE input before SQL with precise validation. Text eq uses = COLLATE NOCASE without the pattern budget. Existing system sorts and independent public collection ordering SHALL remain unchanged.

#### Scenario: Admin continuation retains its order
- **WHEN** an administrator reads a full page of model entries and passes its
  continuation cursor to the next bounded request
- **THEN** the next page contains only rows after the prior
  `(updated_at DESC, id DESC)` boundary with no duplicate row from that page

#### Scenario: Every admin sort pages without gaps or duplicates
- **WHEN** a caller pages a model's entries one row at a time by title, update
  time, or publication time in either direction, including equal titles and
  never-published entries
- **THEN** the concatenated pages contain every matching entry exactly once in
  the requested order

#### Scenario: Invalid cursor is rejected before a query
- **WHEN** a caller supplies malformed base64url data, unsupported cursor
  version, missing field, unsafe timestamp, a sort value of the wrong type, or
  a cursor for a different list, model, search term, status, or sort
- **THEN** the adapter rejects the request and does not treat its values as SQL
  query parameters

#### Scenario: Public collections have independent stable paging
- **WHEN** a caller pages published collection content that shares publication
  timestamps
- **THEN** the continuation boundary uses the published snapshot timestamp and
  entry ID so the result order is deterministic


#### Scenario: Configured sort pages through ties and missing values
- **WHEN** an unchanged collection with equal field values, zero, false and absent values is paged one row at a time in either direction
- **THEN** all matching entries appear exactly once in the specified order with absent values last and totals independent of page boundaries

#### Scenario: Query affects entries beyond the first page
- **WHEN** only an entry beyond the default first page matches a configured case-sensitive Cyrillic text search and numeric range
- **THEN** the first filtered page includes it on Node and D1 without loading all entry JSON into application memory



#### Scenario: Long custom strings retain exact boundaries
- **WHEN** unchanged draft string values exceed the cursor transport bound or share long prefixes and are paged one item at a time
- **THEN** Node and local D1 use complete NOCASE string boundaries from validated anchors, return each matching entry exactly once in either direction, and emit bounded cursors

#### Scenario: Anchor validation remains truthful for an empty continuation
- **WHEN** the boundary draft was deleted, replaced or edited before a continuation that would otherwise contain no items
- **THEN** the repository rejects it with a value-free /after validation error instead of returning a successful empty page
