## ADDED Requirements

### Requirement: Fully migrated 1.0.0 databases are current in 1.1.0

The 1.1.0 migration chain SHALL retain the published 1.0.0 migration identities, hashes and order. The explicit packaged 1.1.0 migration command SHALL succeed against a fully migrated 1.0.0 SQLite or D1 database and apply zero migrations, preserving recorded ledger entries and existing data. Running it again SHALL produce the same result. Fresh database initialization and refusal of an unknown ledger SHALL remain supported and verifiable. No content or original-media transformation SHALL be required for a synchronized 1.0.0 project to start 1.1.0.

#### Scenario: An operator migrates a populated 1.0.0 store
- **WHEN** the target's packaged migration command runs twice on a fully migrated 1.0.0 store for Node SQLite or D1
- **THEN** both commands succeed, each adds zero ledger entries, and the schema and full ledger match the pre-upgrade state

#### Scenario: The database has an unknown ledger entry
- **WHEN** the 1.1.0 migration command encounters an unsupported migration ledger
- **THEN** it reports the schema incompatibility before writing to the store
