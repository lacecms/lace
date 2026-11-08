## MODIFIED Requirements

### Requirement: Migration and API evidence remain truthful across targets

Node migration diagnosis SHALL read the ledger of the existing selected SQLite database and compare all packaged migrations without creating a database or changing its journal settings. Remote D1 diagnosis SHALL perform only a bounded migration-ledger SELECT against the explicit selected database. When either ledger records a migration that is not packaged, doctor SHALL report the migration check as failed with code `SCHEMA_UNSUPPORTED` in setup and ready, explaining that an engine older than the baseline created the database and advising to recreate it, instead of reporting pending migration work. Local Cloudflare SHALL derive migration evidence from the existing Worker's `/health/ready` contract, which verifies its packaged migration ledger, and SHALL label that evidence as API-derived rather than claim an independent offline ledger inspection. When the local Worker is unreachable, migration evidence SHALL be skipped with advice to start the explicitly selected local Worker separately; no local D1 state SHALL be created. API readiness SHALL accept only the expected ready response; arbitrary HTTP success or malformed bodies SHALL fail. No readiness or token-presence result SHALL claim content synchronization, token authorization, storage availability or successful static deployment.

#### Scenario: Node migration ledger is incomplete
- **WHEN** an existing Node database lacks a required packaged migration
- **THEN** doctor reports expected migration work in setup or failure in ready and advises explicit migration for the same target

#### Scenario: Offline local Cloudflare
- **WHEN** the selected local Worker cannot be reached
- **THEN** doctor reports the API as expected in setup or failed in ready, labels migration inspection skipped, and leaves the persistence directory unchanged

#### Scenario: Local Worker is ready
- **WHEN** the selected local Worker returns the accepted ready response
- **THEN** doctor reports API readiness and API-derived migration readiness without opening local D1 state

#### Scenario: Database from an older engine
- **WHEN** the selected Node database or remote D1 database records migrations that are not packaged
- **THEN** doctor reports the migration check failed with `SCHEMA_UNSUPPORTED` and recreate advice in both setup and ready, exits with the migration-state code and changes nothing
