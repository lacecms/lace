## ADDED Requirements

### Requirement: Model kind registration and database enforcement agree

The current schema definition SHALL generate the `content_models.kind` CHECK from the keys of the model kind descriptor table. A fully migrated Node SQLite or D1 database SHALL accept exactly that set. Released migration SQL and snapshots SHALL retain their historical constraints. Expanding the set SHALL require a separate versioned table-rebuild migration which preserves model rows, referencing entries and foreign-key actions. EX5A SHALL use the existing schema version.

#### Scenario: Direct SQL is subject to the same kind set

- **WHEN** a writer inserts otherwise valid models on either runtime with kinds `page`, `collection`, `global` and `article` in separate statements
- **THEN** the database accepts each registered kind and rejects the `article` statement at the CHECK, preserving the three valid rows

#### Scenario: Installing the descriptor on a current database

- **WHEN** an installation already at the current migration version upgrades to the descriptor-based implementation with existing entries
- **THEN** there is no pending model-table migration, and its model keys, kinds, referencing entries and installed migration history are preserved

#### Scenario: A later release registers another kind

- **WHEN** a later release widens the descriptor key set
- **THEN** the pre-upgrade database still rejects the new kind, and schema verification requires a new migration before the widened schema can ship on SQLite and D1
