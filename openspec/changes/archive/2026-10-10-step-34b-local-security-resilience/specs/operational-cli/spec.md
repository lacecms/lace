## ADDED Requirements

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
