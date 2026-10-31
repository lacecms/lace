## ADDED Requirements

### Requirement: Repository contract fixtures cover media tags
The shared repository contract suite SHALL include identical cases, for every
SQL runtime, for media tags. They SHALL assert tag storage on create, full
replacement and clearing through metadata updates with `updatedAt` advancing,
tags in list, catalog and detail reads in ascending order, AND filtering with
search, type, every sort and cursor continuation, catalog counts, prefix
filtering and pagination, and removal of tags with deleted media metadata. They
SHALL assert that a tags-only update on media used by a current publication
leaves the published-content version and build work unchanged, that a stale
`updatedAt` fails with `MEDIA_UPDATE_CONFLICT` without changing tags, that an
injected checkpoint failure leaves tags unchanged, and that public media reads
and the build export carry no tags.

#### Scenario: Node and D1 conform for media tags
- **WHEN** the media tag cases run against migrated file-backed SQLite, in-memory SQLite and local D1
- **THEN** every case passes without a runtime-specific variant or skipped assertion
