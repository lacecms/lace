## MODIFIED Requirements

### Requirement: D1 build-export pages use bounded batched reads
The D1 adapter SHALL read a build-export page with at most two D1 batches and
at most twelve read statements in total, independent of the number of entries,
blocks, globals and media on the page:

1. The first batch SHALL read the published-state version and the candidate
   routed entries after the cursor, with each candidate's stored JSON size.
2. The second batch SHALL read the published-state version again, then the
   page's snapshots, visible blocks and delivered media through path-range
   predicates, and, on the first page, the published globals with their
   snapshots, blocks and media, plus range-scoped reference manifests for routed entries and first-page globals.

Statements SHALL bind at most 100 parameters and SHALL NOT use identifier
lists that grow with page size. The page fails with
`BUILD_EXPORT_VERSION_CHANGED` in either of these cases:

- the version read in either batch differs from the cursor's version;
- on a first page, the two batches observe different versions.

Including build-token verification, a page request SHALL stay within the
Workers Free limit of 50 D1 queries per invocation.

The two additional statements SHALL read only the page's delivered reference
locations through indexed snapshot/path ranges, never per-source or per-target
queries. Manifest JSON SHALL count toward page size/CPU/memory accounting and
hidden locations SHALL be excluded. The complete request SHALL remain within
the 50-statement invocation budget including auth/version checks.

#### Scenario: A full page stays within the statement budget
- **WHEN** a page holds 100 entries with 200 blocks and 200 media references
  each, and the first page also holds globals
- **THEN** the adapter issues at most two batches with at most twelve read
  statements, and the complete HTTP page request issues at most 50 D1 queries

#### Scenario: A publication lands between the two batches
- **WHEN** the published-state version changes after the first batch and
  before the second
- **THEN** the page fails with `BUILD_EXPORT_VERSION_CHANGED` and no mixed
  page is returned

#### Scenario: Reference-heavy first page
- **WHEN** every returned entry/global has 200 delivered references
- **THEN** the adapter stays within two read batches and twelve read statements without page-sized identifier bind lists or target lookups

## ADDED Requirements

### Requirement: Reference operations have bounded indexed execution
Internal-reference mutations SHALL use the existing guarded atomic-batch model,
at most 100 bound parameters per statement, at most 40 mutation statements per
batch and at most 50 total D1 statements per HTTP invocation including auth and
preflight reads. Mutation writes and reference-target validation SHALL be
set-based with bounded JSON rowsets/chunks, not one statement per occurrence.
Impact/status reads SHALL avoid full content JSON scans; impact pages SHALL use
at most five content read statements and status batches of 200 IDs at most two.
The search picker SHALL use indexed title-prefix ranges with bounded keyset
pages. Reference-only dependency revision updates SHALL use one graph-wide
revision update per atomic mutation; unrelated content-only saves SHALL not
update it. Conservative invalidation of impact receipts after an unrelated
reference-graph change SHALL be permitted and explained to the user.

#### Scenario: Maximum supported aggregate
- **WHEN** a valid source has maximum blocks, media references and 200 internal references
- **THEN** its save/publication/revert/duplicate stays within the mutation and invocation statement budgets without truncating links or weakening atomicity

#### Scenario: A title edit has no reference write amplification
- **WHEN** a draft's title changes with identical outgoing reference tuples
- **THEN** reference rows and the graph revision receive no writes

#### Scenario: Indexed incoming lookup
- **WHEN** impact is queried for one target amid many unrelated entries
- **THEN** EXPLAIN QUERY PLAN confirms an indexed target lookup and primary/indexed joins without scanning all source content JSON

#### Scenario: Too large or stale request
- **WHEN** a request exceeds the declared occurrence limit or its graph receipt is stale
- **THEN** it fails before partial writes; no pagination/chunk boundary permits a half-applied lifecycle operation
