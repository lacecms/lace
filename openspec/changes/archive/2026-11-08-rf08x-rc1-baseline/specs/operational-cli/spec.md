## MODIFIED Requirements

### Requirement: Migration is an explicit deployment command
`lace db migrate` SHALL apply the checked-in forward migrations to the selected database, report installed versions, and be safe to repeat. For a file-backed Node database it SHALL create missing parent directories recursively before opening the selected database, so a fresh generated project's configured nested path requires no manual directory creation. It SHALL preserve existing directories, files and stored application data. The `:memory:` target SHALL skip directory preparation. A directory creation failure SHALL fail the command without opening or mutating the selected database, using the existing nonzero operation exit code and sanitized error contract, including one result object in JSON mode. It SHALL not infer a production target from local defaults. The API SHALL not run migrations during startup.

Before applying anything, the command SHALL read the selected database's migration ledger (the Node SQLite ledger, or `d1_migrations` through the resolved local or remote D1 access) and SHALL refuse a database whose ledger records a migration that is not checked in, because an engine older than the baseline created it. The refusal SHALL use the code `SCHEMA_UNSUPPORTED` with exit code 5 and the sanitized error contract, SHALL tell the operator to recreate the database, exporting content first when it must be kept, and SHALL NOT apply a migration or change the database. A missing ledger SHALL count as a fresh database.

#### Scenario: Fresh installation
- **WHEN** migration runs against a fresh selected database
- **THEN** all checked-in migrations are installed and a repeat run reports them without reapplying them

#### Scenario: Generated project's first migration
- **WHEN** an installed generated Node consumer runs `pnpm db:migrate` for its configured `./.lace/data/lace.sqlite` path before `.lace/data` exists
- **THEN** the command creates the missing parents and reports installed migration versions without requiring an operator to run `mkdir`

#### Scenario: Existing content survives repeat migration
- **WHEN** the packaged CLI repeats migration against an existing populated SQLite database
- **THEN** installed versions and stored application data remain unchanged

#### Scenario: Directory preparation fails in automation
- **WHEN** the packaged CLI cannot create a parent directory and `--json` is selected
- **THEN** it exits with the existing operation failure code, writes one sanitized error object to stdout and creates no database at the selected path

#### Scenario: Database from an older engine
- **WHEN** `lace db migrate` selects a Node, local D1 or remote D1 database whose ledger records migrations that are not checked in
- **THEN** it fails with `SCHEMA_UNSUPPORTED` and exit 5, advises recreating the database, applies no migration, and leaves the database unchanged
