## MODIFIED Requirements

### Requirement: Snapshot references and idempotency expiry are indexed

The schema SHALL declare an index whose leading column is each column that
references `content_snapshots`: the entry draft pointer, the entry published
pointer, the published-route snapshot and the site-build published snapshot.
It SHALL also index idempotency-record expiry. The shipped index definitions SHALL agree on Node SQLite and D1 and remain present across supported forward upgrades.

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

- **WHEN** a populated RC5 database completes the forward upgrade on either runtime
- **THEN** each required index is present once, the indexed lookups retain their plans and the existing records are preserved

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

- **WHEN** a fresh database is initialized or an RC5 database is migrated
- **THEN** each of those indexes exists exactly once and the migration does
  not fail

## ADDED Requirements

### Requirement: RC5 installations upgrade through both runtime migration entry points

The 1.0.0 engine SHALL initialize empty stores and migrate a fully migrated RC5 database in place by applying only its pending checked-in migrations in order. Node and D1 SHALL retain the original ledger identities and existing data. The resulting schema, triggers, seed state and indexes SHALL match a fresh 1.0.0 database. Migration SHALL preserve operator configuration, auth identities and verifiers, content IDs, drafts, publications, media keys, URL references and queued work.

#### Scenario: Populated RC5 database

- **WHEN** the operator runs explicit migration on a populated RC5 SQLite file or D1 database with its real ledger
- **THEN** the two RC5 entries remain and five later migrations are recorded, existing actors acquire profiles, old URL links retain their meaning, preview starts without published private artifacts, and integrity checks pass

#### Scenario: Repeat after success

- **WHEN** migration is rerun against the upgraded store
- **THEN** ledger, data, published version and pending work remain the same and the database passes readiness

#### Scenario: Unrecognized migration history

- **WHEN** the supplied ledger includes an unknown migration
- **THEN** explicit migration refuses before changing the database and gives the operator the existing unsupported-schema diagnostic
