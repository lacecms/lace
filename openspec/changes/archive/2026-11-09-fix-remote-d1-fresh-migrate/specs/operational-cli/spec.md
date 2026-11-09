## MODIFIED Requirements

### Requirement: Migration is an explicit deployment command
`lace db migrate` SHALL apply the checked-in forward migrations to the selected database, report installed versions, and be safe to repeat. For a file-backed Node database it SHALL create missing parent directories recursively before opening the selected database, so a fresh generated project's configured nested path requires no manual directory creation. It SHALL preserve existing directories, files and stored application data. The `:memory:` target SHALL skip directory preparation. A directory creation failure SHALL fail the command without opening or mutating the selected database, using the existing nonzero operation exit code and sanitized error contract, including one result object in JSON mode. It SHALL not infer a production target from local defaults. The API SHALL not run migrations during startup.

Before applying anything, the command SHALL read the selected database's migration ledger (the Node SQLite ledger, or `d1_migrations` through the resolved local or remote D1 access) and SHALL refuse a database whose ledger records a migration that is not checked in, because an engine older than the baseline created it. The refusal SHALL use the code `SCHEMA_UNSUPPORTED` with exit code 5 and the sanitized error contract, SHALL tell the operator to recreate the database, exporting content first when it must be kept, and SHALL NOT apply a migration or change the database. A missing ledger SHALL count as a fresh database. For remote D1 the missing ledger SHALL be recognized from the provider's error body for the ledger query whether the provider answers with a successful or an unsuccessful HTTP status (other than an authorization rejection); recognition SHALL inspect only that signature and SHALL NOT surface provider text.

#### Scenario: Fresh installation
- **WHEN** migration runs against a fresh selected database
- **THEN** all checked-in migrations are installed and a repeat run reports them without reapplying them

#### Scenario: Fresh remote D1 reported as a failed query
- **WHEN** `lace db migrate --target cloudflare-remote` reads the ledger of a new D1 database and Cloudflare answers HTTP 400 with a `no such table: d1_migrations` error
- **THEN** the command treats the database as fresh, runs the project's Wrangler migration for the remote target and reports the installed versions instead of an unavailable-D1 failure

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

### Requirement: Operational failures explain safe recovery
Unsuccessful migration, synchronization, bootstrap and upgrade CLI responses SHALL retain their existing symbolic codes, process exit codes and result/report fields and add nonempty top-level string fields `operation`, `reason` and `nextAction` in JSON mode. `operation` SHALL identify the recognized command or `cli` for unrecognized commands, without echoing arguments. Human output SHALL display the same operation, concrete known cause and recovery action. JSON SHALL remain one object on stdout with no secret-bearing stderr. Success responses SHALL retain their existing shape, including the single intentional bootstrap token reveal.

Known failures SHALL distinguish denied filesystem access, unusable path shape, database locks, missing/outdated schema, invalid target/configuration, pending/blocked sync, completed setup and upgrade input/conflict/busy/recovery failures where trusted evidence exists. Unknown errors SHALL use fixed sanitized fallback text, never arbitrary exception messages, stacks, environment values, subprocess output, passwords or tokens. Recovery SHALL be advice only: target selection, sync atomicity, bootstrap guards and upgrade preservation/recovery semantics SHALL remain unchanged.

D1 unavailability advice SHALL match the selected target: `cloudflare-local` SHALL point to the persisted local state (`LACE_CLOUDFLARE_PERSIST_TO`), and `cloudflare-remote` SHALL point to Cloudflare connectivity and the selected account and database without mentioning local persisted state. A remote D1 query rejected with a client-error status other than 401, 403 or 429 SHALL be reported as an unsuccessful provider response rather than as unavailability.

#### Scenario: Filesystem failure in either output mode
- **WHEN** migration cannot access its database because of denied permissions or an unusable parent path
- **THEN** it retains OPERATION_FAILED and exit 6, identifies db migrate, explains the cause and advises correcting access or the configured path without revealing that path or creating a database

#### Scenario: Missing or outdated schema
- **WHEN** sync or bootstrap runs against a missing database or an incomplete migration ledger
- **THEN** it retains SCHEMA_OUTDATED and exit 5 and recommends the explicit migration command for the selected target

#### Scenario: Cloudflare infrastructure failure
- **WHEN** a D1 schema check fails because of a network failure or rejected authorization
- **THEN** it reports sanitized infrastructure/authorization guidance with OPERATION_FAILED and exit 6 instead of claiming that migrations are missing

#### Scenario: Remote D1 advice names the remote target
- **WHEN** a `cloudflare-remote` command fails because Cloudflare D1 is unreachable or answers with a server error or throttling (429)
- **THEN** it retains OPERATION_FAILED and exit 6 and advises checking Cloudflare connectivity and the selected account and database, without mentioning `LACE_CLOUDFLARE_PERSIST_TO` or echoing the provider body

#### Scenario: Invalid target or configuration
- **WHEN** an operator supplies an unsupported target, missing settings or invalid project configuration
- **THEN** human and JSON output identify the operation and corrective argument/setting/configuration action, preserving usage/config codes without supplied values

#### Scenario: Sync cannot be applied
- **WHEN** sync is blocked or check detects pending changes
- **THEN** it preserves the plan, code and exit status and advises reviewing compatible configuration before explicitly applying, with no partial writes

#### Scenario: Bootstrap has completed
- **WHEN** either Node or D1 refuses bootstrap after setup completion
- **THEN** the CLI retains OPERATION_FAILED and exit 6, explains completed setup and advises signing in with the existing administrator, without minting or revealing another token

#### Scenario: Upgrade conflict or interrupted operation
- **WHEN** upgrade review/apply reports conflicts, a busy lock or pending recovery
- **THEN** the existing conflict/recovery information and code remain available with guidance to review conflicts, verify the owner or resume the recorded direction without overwriting user edits

#### Scenario: Unknown failure contains credentials
- **WHEN** an unrecognized exception or failed subprocess includes a sentinel password/token in its message or output
- **THEN** both output modes contain only the sanitized fallback or trusted diagnostic, with no sentinel, stack or raw subprocess output
