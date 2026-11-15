## ADDED Requirements

### Requirement: Snapshot references and idempotency expiry are indexed

The schema SHALL declare an index whose leading column is each column that
references `content_snapshots`: the entry draft pointer, the entry published
pointer, the published-route snapshot and the site-build published snapshot.
It SHALL also index idempotency-record expiry. One forward migration after the
baseline SHALL create these indexes with the same SQL for Node SQLite and D1,
SHALL rewrite no rows, and SHALL leave every existing index in place.

#### Scenario: Deleting a superseded snapshot uses indexes

- **WHEN** the plan for deleting a snapshot row is explained on a migrated
  database
- **THEN** each foreign-key check on `content_entries`, `published_routes`
  and `site_builds` searches through an index rather than scanning the table

#### Scenario: Published media lookup does not scan entries

- **WHEN** the plans for the public media dictionary and the published-usage
  lookup of a media item are explained
- **THEN** neither plan scans `content_entries`

#### Scenario: A baseline database receives the migration

- **WHEN** a database at the baseline migration is migrated on Node SQLite or
  local D1
- **THEN** the new migration reports as installed, the new indexes exist, and
  every pre-existing row is unchanged

### Requirement: Every index exists in the declared schema

Every index that a checked-in migration creates SHALL also be declared in the
Drizzle schema, including partial indexes. The declared schema SHALL match the
latest migration snapshot. Adopting an index that already exists in the
database SHALL NOT create it a second time.

#### Scenario: Security indexes are declared

- **WHEN** the schema check runs after this change
- **THEN** the setup-token expiry, active API-token lookup and rate-limit
  expiry indexes are part of the declared schema and the latest snapshot, and
  the check reports no pending migration

#### Scenario: Declared adoption does not duplicate an index

- **WHEN** a baseline database is migrated after the security indexes are
  declared
- **THEN** each of those indexes exists exactly once and the migration does
  not fail
