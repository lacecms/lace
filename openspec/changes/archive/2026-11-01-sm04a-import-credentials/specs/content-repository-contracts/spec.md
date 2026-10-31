## ADDED Requirements

### Requirement: Repository contract fixtures cover import lookups
The shared repository contract suite SHALL include identical cases, for every
SQL runtime, for content-hash and slug lookups. They SHALL assert that a
created item stores its hash, that metadata and tag updates keep it, that a
hash filter returns only `active` matching items and combines with search,
type, tags, every sort and cursor continuation, that items without a hash never
match, and that public media reads and the build export carry no hash. They
SHALL assert that a slug filter matches the current draft slug exactly and not
the published slug, applies to totals, combines with search, status, field
filters and sorts, and continues by cursor. The security contract suite SHALL
assert import-credential issuance, expiry, revocation, kind separation from
build credentials, rate-limited `last_used_at` and revocation by account
security events.

#### Scenario: Node and D1 conform for import lookups
- **WHEN** the lookup and import-credential cases run against migrated file-backed SQLite, in-memory SQLite and local D1
- **THEN** every case passes without a runtime-specific variant or skipped assertion

#### Scenario: Hash lookup stays within the D1 budget
- **WHEN** the D1 budget suite lists media by hash in an installation with 500 media items
- **THEN** the read uses the hash index and stays within the existing media-list query budget
