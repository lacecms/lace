## ADDED Requirements

### Requirement: Shared SQL and the declared schema stay consistent with the checked-in migrations

The repository SHALL verify that the shared column lists used by both the Node
SQLite and D1 repositories name only columns created by the checked-in
migrations. For each shared entry, media, snapshot, block and block-copy column
list, a test SHALL apply every checked-in migration in journal order to an empty
in-memory SQLite database. The test SHALL then fail when the list names a column
missing from its table's column information, or when the list's statement does
not prepare against that database.

The root lint gate SHALL fail when the migration snapshot chain is inconsistent,
or when the declared table schema differs from the latest checked-in migration
snapshot, so that generating migrations would produce a new migration. The
check SHALL not write to the committed migration directory, and SHALL fail
rather than wait for interactive input. Both checks SHALL use the same schema
definition and migrations that Node SQLite and D1 apply, so the parity of the
two runtimes is unchanged.

#### Scenario: Column lists match the migrated schema

- **WHEN** the package tests run against the committed migrations and column lists
- **THEN** every column named by each shared column list exists in its table, every list's statement prepares, and the test passes

#### Scenario: A column list names a column no migration creates

- **WHEN** a shared column list names a column that no checked-in migration adds to its table
- **THEN** the test fails and its message names the list, the table and the missing column

#### Scenario: The declared schema changes without a migration

- **WHEN** a table, column, index or constraint is added to or changed in the declared schema and no migration is generated
- **THEN** `pnpm lint` fails, reports that a migration is pending, and leaves the committed migration directory unchanged

#### Scenario: The migration snapshot chain is inconsistent

- **WHEN** two checked-in migration snapshots collide or a snapshot does not follow its predecessor
- **THEN** `pnpm lint` fails with the migration tool's check result

#### Scenario: Schema and migrations agree

- **WHEN** `pnpm lint` runs on a checkout whose declared schema matches the latest checked-in snapshot
- **THEN** the schema check passes without creating, changing or deleting a file under the committed migration directory
