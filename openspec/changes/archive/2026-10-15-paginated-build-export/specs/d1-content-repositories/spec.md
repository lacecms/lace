## ADDED Requirements

### Requirement: D1 build-export pages use bounded batched reads
The D1 adapter SHALL read a build-export page with at most two D1 batches and
at most ten read statements in total, independent of the number of entries,
blocks, globals and media on the page:

1. The first batch SHALL read the published-state version and the candidate
   routed entries after the cursor, with each candidate's stored JSON size.
2. The second batch SHALL read the published-state version again, then the
   page's snapshots, visible blocks and delivered media through path-range
   predicates, and, on the first page, the published globals with their
   snapshots, blocks and media.

Statements SHALL bind at most 100 parameters and SHALL NOT use identifier
lists that grow with page size. The page fails with
`BUILD_EXPORT_VERSION_CHANGED` in either of these cases:

- the version read in either batch differs from the cursor's version;
- on a first page, the two batches observe different versions.

Including build-token verification, a page request SHALL stay within the
Workers Free limit of 50 D1 queries per invocation.

#### Scenario: A full page stays within the statement budget
- **WHEN** a page holds 100 entries with 200 blocks and 200 media references
  each, and the first page also holds globals
- **THEN** the adapter issues at most two batches with at most ten read
  statements, and the complete HTTP page request issues at most 50 D1 queries

#### Scenario: A publication lands between the two batches
- **WHEN** the published-state version changes after the first batch and
  before the second
- **THEN** the page fails with `BUILD_EXPORT_VERSION_CHANGED` and no mixed
  page is returned
