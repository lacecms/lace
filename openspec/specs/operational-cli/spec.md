# operational-cli Specification

## Purpose

Defines the explicit operator commands that prepare a Lace database and first administrator on Node or Cloudflare without exposing credentials or selecting a remote installation by accident.

## Requirements

### Requirement: Commands select an explicit, validated environment
The `lace` CLI SHALL provide `db migrate`, `content sync [--check]`, and `auth bootstrap` for named `node` and `cloudflare` targets. An omitted target SHALL select only a local Node installation. A remote Cloudflare target SHALL require an explicit `--target cloudflare-remote` option and required account, database, and API credentials; local Cloudflare SHALL require `--target cloudflare-local`. Validation errors SHALL identify setting names but SHALL not disclose supplied values. No command SHALL fall back from a failed local target to a remote target.

#### Scenario: Default command is local
- **WHEN** an operator omits `--target` and provides a local SQLite path
- **THEN** the command accesses only that Node database

#### Scenario: Remote settings are incomplete
- **WHEN** an operator selects `cloudflare-remote` without a required credential or database identifier
- **THEN** the command fails before mutation and names only the missing setting

### Requirement: Migration is an explicit deployment command
`lace db migrate` SHALL apply the checked-in forward migrations to the selected database, report installed versions, and be safe to repeat. For a file-backed Node database it SHALL create missing parent directories recursively before opening the selected database, so a fresh generated project's configured nested path requires no manual directory creation. It SHALL preserve existing directories, files and stored application data. The `:memory:` target SHALL skip directory preparation. A directory creation failure SHALL fail the command without opening or mutating the selected database, using the existing nonzero operation exit code and sanitized error contract, including one result object in JSON mode. It SHALL not infer a production target from local defaults. The API SHALL not run migrations during startup.

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

### Requirement: Sync uses the accepted guarded synchronization policy
`lace content sync` SHALL use the existing application synchronization planner and guarded apply operation for Node and Cloudflare. `--check` SHALL never write; it SHALL return success only when the stored identities match the normalized configuration, and SHALL return a distinct nonzero exit code when changes are pending or invalid. A normal sync SHALL report operations and refuse incompatible changes without partial application.

#### Scenario: CI check finds a pending change
- **WHEN** `content sync --check` sees a valid pending plan
- **THEN** it reports the plan, exits with the pending-change code, and leaves persistent state unchanged

#### Scenario: Incompatible change
- **WHEN** a model change is incompatible with stored entries
- **THEN** sync reports the affected model and leaves the database unchanged

### Requirement: Bootstrap reveals one setup token safely
`lace auth bootstrap` SHALL use the selected target's existing setup service to mint a bounded one-time setup token while setup is incomplete. It SHALL emit the plaintext token only in the successful command response, never in an error or log, and SHALL refuse to mint after setup completes. It SHALL work non-interactively in CI.

#### Scenario: Initial setup
- **WHEN** a migrated installation has not completed setup
- **THEN** bootstrap prints one setup token and its expiry for the setup-admin flow

#### Scenario: Setup complete
- **WHEN** setup has completed
- **THEN** bootstrap returns a nonzero status and prints no credential

### Requirement: Operator output is deterministic and parseable
Every command SHALL support `--json` with one JSON result or error object on stdout, stable symbolic error codes and stable process exit codes. Human output SHALL be actionable. Non-interactive execution SHALL never prompt and SHALL fail closed if required target selection or configuration is absent.

#### Scenario: Automation receives a validation error
- **WHEN** a CI job invokes a command with invalid settings and `--json`
- **THEN** stdout contains one parseable error object with a stable code, stderr contains no secret, and the process exits nonzero

### Requirement: Operational failures explain safe recovery
Unsuccessful migration, synchronization, bootstrap and upgrade CLI responses SHALL retain their existing symbolic codes, process exit codes and result/report fields and add nonempty top-level string fields `operation`, `reason` and `nextAction` in JSON mode. `operation` SHALL identify the recognized command or `cli` for unrecognized commands, without echoing arguments. Human output SHALL display the same operation, concrete known cause and recovery action. JSON SHALL remain one object on stdout with no secret-bearing stderr. Success responses SHALL retain their existing shape, including the single intentional bootstrap token reveal.

Known failures SHALL distinguish denied filesystem access, unusable path shape, database locks, missing/outdated schema, invalid target/configuration, pending/blocked sync, completed setup and upgrade input/conflict/busy/recovery failures where trusted evidence exists. Unknown errors SHALL use fixed sanitized fallback text, never arbitrary exception messages, stacks, environment values, subprocess output, passwords or tokens. Recovery SHALL be advice only: target selection, sync atomicity, bootstrap guards and upgrade preservation/recovery semantics SHALL remain unchanged.

#### Scenario: Filesystem failure in either output mode
- **WHEN** migration cannot access its database because of denied permissions or an unusable parent path
- **THEN** it retains OPERATION_FAILED and exit 6, identifies db migrate, explains the cause and advises correcting access or the configured path without revealing that path or creating a database

#### Scenario: Missing or outdated schema
- **WHEN** sync or bootstrap runs against a missing database or an incomplete migration ledger
- **THEN** it retains SCHEMA_OUTDATED and exit 5 and recommends the explicit migration command for the selected target

#### Scenario: Cloudflare infrastructure failure
- **WHEN** a D1 schema check fails because of a network failure or rejected authorization
- **THEN** it reports sanitized infrastructure/authorization guidance with OPERATION_FAILED and exit 6 instead of claiming that migrations are missing

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

### Requirement: Local environment preparation creates protected credentials explicitly
The CLI SHALL provide `lace env prepare [--target cloudflare-local] [--json]` in the current project root, without requiring an existing `.env`, target credentials, runtime services or database access. It SHALL reject `--target node`, `--target cloudflare-remote`, `--check` and extra arguments using USAGE and exit 3. Without a target it SHALL read a regular non-symlink `.env.example`, require exactly one single-line assignment for each of the four generated credential names and `LACE_BUILD_TOKEN`, preserve every other template byte, and never execute template contents or copy credentials from process environment. With `--target cloudflare-local` it SHALL instead read a regular non-symlink `worker/.dev.vars.example`, require exactly one single-line `LACE_AUTH_SECRET` assignment, preserve every other template byte, and publish `worker/.dev.vars`. Missing or invalid templates SHALL return CONFIG and exit 4. It SHALL generate independent cryptographically random values: at least 256 bits for `LACE_AUTH_SECRET`, `LACE_MINIO_ROOT_SECRET` and `LACE_BUILDER_SECRET`, and at least 112 bits in a 20-character alphanumeric `LACE_MINIO_ROOT_ACCESS_KEY`. `LACE_BUILD_TOKEN` SHALL be empty until issued in Settings.

#### Scenario: Preparation before configuration exists
- **WHEN** a fresh consumer runs preparation with no `.env` or database settings
- **THEN** it creates service-compatible credentials, leaves the build token empty and preserves URLs, images, ports, database path, comments and other settings

#### Scenario: Template cannot be safely used
- **WHEN** `.env.example` is missing, a symlink, not regular, or lacks unique single-line controlled assignments
- **THEN** preparation fails with sanitized template recovery guidance and creates no `.env`

#### Scenario: Preparation cannot select remote infrastructure
- **WHEN** an operator supplies `--target cloudflare-remote`, `--target node`, `--check` or extra positional arguments
- **THEN** preparation returns USAGE without modifying local or remote state

#### Scenario: Local Worker variables
- **WHEN** a Cloudflare consumer runs `lace env prepare --target cloudflare-local` without `worker/.dev.vars`
- **THEN** it creates `worker/.dev.vars` with a fresh auth secret and the example's development settings, makes no network request and leaves `.env` untouched

### Requirement: Environment publication preserves existing files and exposes no partial credentials
Preparation SHALL publish only a fully written destination — `.env`, or `worker/.dev.vars` for `cloudflare-local` — with owner-only permissions (`0600` on POSIX), without replacing an existing file, directory or symlink. Concurrent creators SHALL have exactly one successful publication. Existing destinations SHALL return OPERATION_FAILED and exit 6 with recovery advice to retain/edit the existing file, without reading or exposing its contents. Write/publication failures SHALL leave no partial destination and SHALL clean temporary output during normal error handling. A process killed before publication SHALL leave no destination; any private staging remnants SHALL be documented. Outputs SHALL print no credentials or template values. Success SHALL use ENV_PREPARED and exit 0; JSON SHALL be one result object on stdout. Failures SHALL retain the accepted operation/reason/nextAction diagnostics with `operation` equal to `env prepare`.

#### Scenario: Repeated preparation preserves operator edits
- **WHEN** preparation runs with an existing destination, including an empty file or symlink
- **THEN** the destination and any linked file remain unchanged and the command reports safe recovery without revealing their contents

#### Scenario: Two processes prepare concurrently
- **WHEN** two preparations race to create the same destination
- **THEN** one succeeds, the other refuses overwrite, and the destination contains one complete set of credentials with owner-only permissions

#### Scenario: Failure before publication
- **WHEN** writing, syncing or publishing staged output fails
- **THEN** no partially written destination is visible, temporary files are cleaned during normal error handling, and sanitized output contains no credential or raw exception text

### Requirement: Cloudflare migration runs the project's installed Wrangler
For `cloudflare-local` and `cloudflare-remote` migration the CLI SHALL run the Wrangler executable installed in the nearest `node_modules/.bin` found from the configured Wrangler file's directory upward, with that configuration file, so a configuration in a subdirectory of the project uses the project's pinned Wrangler. When no installed Wrangler is found it SHALL fail with CONFIG before running any migration, naming the missing tool without exposing settings values.

#### Scenario: Configuration in a project subdirectory
- **WHEN** `LACE_WRANGLER_CONFIG` names `worker/wrangler.jsonc` and Wrangler is installed in the project root
- **THEN** local migration runs the root's Wrangler with that configuration and its migrations directory

#### Scenario: Wrangler not installed
- **WHEN** no `node_modules/.bin/wrangler` exists at or above the configuration's directory
- **THEN** migration fails with CONFIG naming Wrangler and applies nothing

### Requirement: Explicit remote credentials reach both D1 transports
Remote migration, synchronization and bootstrap SHALL use the same resolved account, database and token from process settings or the explicitly selected operator file. Remote migration's installed Wrangler child SHALL receive the resolved account and API token explicitly so implicit dotenv loading cannot substitute a different token for that operation. Token values SHALL NOT be placed in arguments, stdout, stderr or diagnostics. File resolution and target validation SHALL finish before provider writes; migration ordering, sync atomicity, bootstrap guards, error codes and the single successful bootstrap token reveal SHALL remain unchanged. Local/Node operations SHALL NOT load a remote operator file or gain remote credentials as a side effect. The parent process environment SHALL remain unchanged.

#### Scenario: Private-file remote migration
- **WHEN** a remote migration uses a private-file D1 token and root dotenv contains a different token
- **THEN** both Wrangler migration and the subsequent D1 ledger read use the explicitly resolved token and account without exposing them

#### Scenario: Sync and bootstrap use the selected target
- **WHEN** either command selects the same operator file
- **THEN** D1 requests use that file's account/database/token with existing atomicity and setup guards

#### Scenario: Local migration
- **WHEN** local migration runs without the remote option
- **THEN** local persistence and credential behavior remain unchanged and no remote account is selected

### Requirement: Host SQLite commands refuse live Compose database consumers
In a project with a generated or recognized Compose deployment, before opening a file-backed Node database, host migration, configuration synchronization including check mode, and bootstrap SHALL detect running local Compose database consumers by resolving each container's configured LACE_DATABASE_PATH through its bind mounts to the host storage. A source-only mount whose service has no database configuration SHALL NOT block maintenance merely because the source tree contains the host database directory. A matching live API or dispatcher SHALL cause refusal before any database handle opens, including read-only or schema checks. Detection SHALL compare resolved database locations rather than only a project or service name. A running API or dispatcher whose database location cannot be established SHALL cause a conservative inspection failure. Commands inside the selected deployment container SHALL remain usable for explicit maintenance. Memory databases and Cloudflare targets SHALL remain outside this guard. Node-only projects without a Compose deployment SHALL retain ordinary operation without requiring Docker.

Where Compose safety inspection is required, unavailable or inconclusive inspection SHALL fail closed with fixed sanitized guidance. Refusal SHALL preserve the existing OPERATION_FAILED/exit-6 contract and operation, reason and nextAction fields, emit one object in JSON mode, disclose no Docker environment or secrets, and advise stopping the matching services and retrying. The guard SHALL NOT stop services automatically or claim cross-host locking.

#### Scenario: Bootstrap would open an active Compose database
- **WHEN** a host bootstrap command selects a database mounted by a running Compose API
- **THEN** it refuses before opening SQLite or creating a token and names the safe maintenance action

#### Scenario: Services have been stopped
- **WHEN** inspection proves no running matching consumer and the operator runs migration, sync or bootstrap
- **THEN** the original command semantics and output remain available

#### Scenario: Another installation runs
- **WHEN** another Compose project uses a different resolved storage directory
- **THEN** its running services do not block the selected installation

#### Scenario: Builder mounts source without opening SQLite
- **WHEN** api and dispatcher are stopped and the builder retains its source-only mount containing the project's .lace/data directory
- **THEN** that mount alone does not block host migration, sync or bootstrap

#### Scenario: Safety cannot be established
- **WHEN** required container inspection fails or produces unusable results
- **THEN** the command returns a sanitized nonzero result without opening the database
