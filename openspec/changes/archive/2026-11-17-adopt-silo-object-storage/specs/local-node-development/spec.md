## MODIFIED Requirements

### Requirement: One documented command starts the complete local Node stack
The system SHALL provide a documented `dev:node` command that starts the Node
API, applies already-committed SQLite migrations before the API becomes ready,
starts the bundled SILO service and its idempotent private bucket initializer,
and starts the admin and Astro development servers. The command SHALL make persistent
development database and object data explicit, preserve it across ordinary
stops, and report a non-zero outcome when a required service cannot become
healthy. It SHALL not use a production builder, release directory, or public
object bucket.

#### Scenario: A contributor starts a fresh local stack
- **WHEN** a contributor has installed the documented prerequisites, created a
  valid ignored local environment file, and invokes `dev:node`
- **THEN** the stack uses the pinned SILO image by default, applies migrations,
  initializes the configured private bucket, and exposes healthy API, admin,
  and site development endpoints

#### Scenario: A required service fails to become ready
- **WHEN** the configured storage image is unavailable to Compose or a required
  service cannot start with the supplied local configuration
- **THEN** the start command reports the failing service and exits unsuccessfully
  without claiming that the stack is ready

### Requirement: Local configuration is complete, non-secret by default, and validates safely
The tracked environment example and development documentation SHALL identify
every value required by the local stack, including local endpoint/origin values,
SQLite location, MinIO root and application credentials, bucket and region,
timeout, and authentication secret. The example SHALL contain no usable
credential. Startup diagnostics and command output SHALL name invalid settings
without printing supplied secret values, and the local environment file SHALL
remain ignored by version control. The example and development guide SHALL
explain the optional `LACE_MINIO_IMAGE` Compose override and how to preserve
ordinary development data when switching an existing storage container.

#### Scenario: A required local setting is absent
- **WHEN** a contributor starts the local stack with a missing or malformed
  required setting
- **THEN** startup fails before the affected service accepts traffic and names
  only the setting that requires correction

#### Scenario: A repository checkout is inspected
- **WHEN** a contributor reads the tracked environment example or repository
  history
- **THEN** it contains no local password, token, or other usable credential

#### Scenario: A contributor selects a compatible storage image
- **WHEN** the ignored local `.env` sets `LACE_MINIO_IMAGE` to a compatible image reference
- **THEN** `dev:node` selects that image with the same storage endpoint, credentials, and persistent volume

### Requirement: Local bootstrap, documentation, and smoke verification are reproducible
The system SHALL provide a documented local-only operator path that creates one
expiring first-admin setup credential without a default password and reveals
the credential only to its invoker. The root README SHALL document prerequisites,
first start, first-admin completion, normal stop, deliberate data reset,
development URLs, focused/root test commands, quality gates, and common local
failures. A repeatable `dev:smoke` command SHALL create an isolated stack,
wait for the documented readiness conditions, verify API, admin, site, and
SILO reachability using the pinned default, and clean up only the resources it
created.

#### Scenario: A contributor performs the documented first run
- **WHEN** a contributor follows the README from an installed checkout through
  local bootstrap and sign-in
- **THEN** it can create the first administrator without receiving a hard-coded
  credential or manually editing database records

#### Scenario: The smoke check succeeds
- **WHEN** `dev:smoke` runs against a valid local checkout with Docker
  available
- **THEN** it reports success only after all four documented surfaces are
  reachable and cleans up only the stack and persistent data it created

#### Scenario: A contributor requests a local reset
- **WHEN** a contributor explicitly invokes the documented destructive local
  reset command
- **THEN** only the named Lace development database and object-store data are
  removed, and the command clearly states that those local data cannot be
  recovered
