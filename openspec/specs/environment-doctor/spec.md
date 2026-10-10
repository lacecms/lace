# environment-doctor Specification

## Purpose

Defines a bounded, read-only operator diagnosis of selected Lace installation prerequisites, distinguishing expected unfinished setup from failures without exposing credentials or changing persistent state.

## Requirements

### Requirement: Doctor selects its target and installation stage explicitly

The CLI SHALL provide `lace doctor --target node|cloudflare-local|cloudflare-remote --stage setup|ready [--mode native|compose] [--json]`. Target and stage SHALL be mandatory and unique. Node mode SHALL default to native; explicit mode SHALL be invalid for Cloudflare. Unsupported, duplicate, missing and extra arguments, including `--check`, SHALL return USAGE and exit 3 before probes. Existing command syntax and defaults SHALL remain unchanged. Doctor SHALL never prompt, install missing tools, infer a remote target or fall back to another target.

#### Scenario: Target or stage is omitted
- **WHEN** an operator invokes doctor without one required selector or with invalid arguments
- **THEN** the CLI returns sanitized usage with exit 3 and performs no filesystem, process or network probes

#### Scenario: Explicit remote diagnosis
- **WHEN** cloudflare-remote is selected and its credentials are missing
- **THEN** the report names missing settings and skips dependent remote probes without selecting a local database

### Requirement: Checks use project compatibility and selected runtime prerequisites

Doctor SHALL check the current project's declared Node and pnpm engine ranges against installed versions, required target/mode settings, migration state, API readiness and build-token presence. Missing or invalid project engine declarations, unavailable tools and incompatible versions SHALL fail prerequisite checks. Settings diagnostics SHALL name settings without values. Docker Compose and daemon probes SHALL run only for Node compose mode. Cloudflare SHALL check the installed project-local Wrangler, its selected configuration's DB binding and selected D1 settings; local selection SHALL require a local persistence setting and a loopback API origin. Remote selection SHALL require explicit account/database/token settings. A Pages-only configuration SHALL fail the CMS binding prerequisite. Native Node SHALL validate Node runtime settings; compose SHALL validate host inputs rather than demand container-internal settings from the host.

#### Scenario: Node native installation without Docker
- **WHEN** compatible tools, valid native settings and a ready installation exist without Docker installed
- **THEN** Docker checks are skipped as inapplicable and do not cause a failure

#### Scenario: Docker daemon is unavailable
- **WHEN** compose mode is selected and the Docker client exists but its daemon is unavailable
- **THEN** doctor reports a failed daemon prerequisite with a safe recovery action and does not start services

#### Scenario: Project changes its compatible versions
- **WHEN** installed versions fall outside valid ranges declared by that project's package.json
- **THEN** doctor fails compatibility even if those versions satisfy the engine repository's ranges

#### Scenario: Generated Cloudflare template is Pages-only
- **WHEN** the selected Wrangler file has no CMS DB binding
- **THEN** doctor reports the missing binding and explains that CMS Worker configuration must be provided explicitly

### Requirement: Installation stage controls only expected unfinished states

Each check SHALL have a stable identifier, status (`pass`, `expected`, `fail` or `skipped`), symbolic code, nonempty safe explanation and next action. Setup SHALL treat an absent Node database, absent migration ledger or pending migrations, an unreachable API and an empty build token as expected unfinished steps. Ready SHALL treat those states as failures. Malformed settings, denied access, locks, authorization rejection, invalid service responses and missing tools SHALL fail in either stage. A reachable API returning not-ready SHALL fail even during setup; an unavailable endpoint SHALL not be described as proof that it was never started. Dependent skipped checks SHALL identify the failed or expected prerequisite. Empty tokens SHALL never be reported as valid credentials; present tokens SHALL be described as present but unverified.

#### Scenario: Prepared initial Node consumer
- **WHEN** compatible tools and valid settings exist but the database, API and build token do not yet exist
- **THEN** setup reports expected next steps with exit 0 while ready reports failures with a nonzero exit

#### Scenario: Setup is blocked by permission or authorization
- **WHEN** an existing database cannot be read or remote D1 rejects credentials during setup
- **THEN** doctor reports a failed prerequisite rather than an expected missing migration

### Requirement: Migration and API evidence remain truthful across targets

Node migration diagnosis SHALL read the ledger of the existing selected SQLite database and compare all packaged migrations without creating a database or changing its journal settings. Remote D1 diagnosis SHALL perform only a bounded migration-ledger SELECT against the explicit selected database. Local Cloudflare SHALL derive migration evidence from the existing Worker's `/health/ready` contract, which verifies its packaged migration ledger, and SHALL label that evidence as API-derived rather than claim an independent offline ledger inspection. When the local Worker is unreachable, migration evidence SHALL be skipped with advice to start the explicitly selected local Worker separately; no local D1 state SHALL be created. API readiness SHALL accept only the expected ready response; arbitrary HTTP success or malformed bodies SHALL fail. No readiness or token-presence result SHALL claim content synchronization, token authorization, storage availability or successful static deployment.

#### Scenario: Node migration ledger is incomplete
- **WHEN** an existing Node database lacks a required packaged migration
- **THEN** doctor reports expected migration work in setup or failure in ready and advises explicit migration for the same target

#### Scenario: Offline local Cloudflare
- **WHEN** the selected local Worker cannot be reached
- **THEN** doctor reports the API as expected in setup or failed in ready, labels migration inspection skipped, and leaves the persistence directory unchanged

#### Scenario: Local Worker is ready
- **WHEN** the selected local Worker returns the accepted ready response
- **THEN** doctor reports API readiness and API-derived migration readiness without opening local D1 state

### Requirement: Diagnosis is bounded and does not mutate the installation

Doctor SHALL NOT migrate, sync, bootstrap, generate secrets, start services, evaluate lace.config.ts, write configuration or create database/persistence/cache/log files. Probes SHALL have a maximum five-second deadline each, bounded output/response sizes and an overall thirty-second deadline. HTTP redirects SHALL NOT be followed, credentials SHALL be sent only to the explicit D1 provider endpoint, and API readiness SHALL be anonymous. Local Cloudflare SHALL refuse a non-loopback API origin. Read-only database access SHALL NOT create WAL/SHM sidecars; if safe access to existing state is unavailable, diagnosis SHALL fail with safe advice instead of selecting a writable opener or presenting stale immutable data. Concurrent doctors SHALL not acquire persistent ownership locks or mutate the installation.

#### Scenario: Offline or hanging dependency
- **WHEN** a process or HTTP dependency does not finish within its deadline
- **THEN** doctor cancels the probe, reports a sanitized failure or stage-appropriate unreachable API result, and completes within the overall bound

#### Scenario: Database or local state is absent
- **WHEN** doctor checks an installation with no database or local persistence directory
- **THEN** no directory, database, credential or service is created

#### Scenario: Concurrent diagnosis of live SQLite
- **WHEN** two doctors inspect an existing database including a WAL-mode database
- **THEN** content, ledger and project bytes remain unchanged and no new journal sidecars or persistent doctor locks appear

### Requirement: Output and exits are deterministic and secret-safe

JSON mode SHALL emit exactly one object on stdout and no secret-bearing stderr. A report SHALL contain `ok`, `code`, `message`, `operation` equal to `doctor`, `reason`, `nextAction` and `data` containing normalized target, stage, mode and ordered checks. Fixed check order and codes SHALL not depend on probe completion order; output SHALL omit timestamps, durations and arbitrary tool/provider data. Explanations SHALL never contain environment values, paths, URL credentials, tokens, passwords, raw exceptions, stacks or subprocess output. Human mode SHALL show the same check statuses and recovery guidance.

For valid invocations, exit precedence SHALL be 4 for any failed project compatibility/settings prerequisite, otherwise 5 for failed migration state, otherwise 6 for infrastructure/probe failures, otherwise 0 for passing and expected checks. Nonzero reports SHALL use DOCTOR_FAILED; zero reports SHALL use DOCTOR_OK. Usage errors SHALL retain USAGE/3 and operation/reason/nextAction diagnostics. Reports SHALL continue independent checks after a failure; dependent checks SHALL be skipped. Documentation SHALL describe setup/ready semantics, applicable modes, local D1 evidence limits and token-presence limits.

#### Scenario: Multiple failures complete in different orders
- **WHEN** a settings prerequisite and service probe both fail
- **THEN** doctor emits the same ordered check report and exit 4 regardless of completion order

#### Scenario: Tool or provider response contains a secret
- **WHEN** a subprocess, response or exception contains sentinel secrets or private paths
- **THEN** neither output mode includes those bytes and JSON remains a single parseable object

#### Scenario: Independent packed consumer
- **WHEN** a generated consumer runs the packaged CLI outside the engine workspace
- **THEN** doctor uses that consumer's engine declarations and selected settings, emits the documented report and preserves its files and database

### Requirement: Doctor checks the recorded site
Doctor SHALL report a `site` check derived from `.lace/manifest.json` in the working directory without modifying files. Without a manifest the check SHALL be not applicable; a manifest that cannot be read or validated SHALL fail as configuration. For mode `none` the check SHALL pass and state that no build site is configured. For `starter` and `existing` it SHALL fail as configuration when the site directory is missing or lacks `astro.config.*` or an `astro` dependency in its `package.json`, and SHALL report as unfinished (expected during `setup`, failed during `ready`) when `@lacecms/astro` or `@lacecms/render` is not installed for the site, or when `lace.site.json` or the block map it names is missing, with the next action naming `pnpm install` for the site or `pnpm exec lace add block --all --site <path>`. Doctor SHALL NOT expect `site/` when the recorded mode is not starter.

#### Scenario: Headless project
- **WHEN** doctor runs in a project recorded with mode `none`
- **THEN** the `site` check passes and no `site/` path is probed

#### Scenario: Existing site without blocks
- **WHEN** doctor runs with `--stage setup` in a project recorded as existing site at `..` whose site has no `lace.site.json`
- **THEN** the `site` check is expected and its next action names `pnpm exec lace add block --all --site ..`

#### Scenario: Missing site directory
- **WHEN** the recorded site path does not exist
- **THEN** the `site` check fails as configuration with exit code 4

### Requirement: Doctor accepts generated minimum-only version declarations
Doctor SHALL evaluate the selected consumer project's engine declarations without imposing additional repository-only Node or pnpm major caps. For current generated declarations Node `>=24.12.0` and pnpm `>=12`, versions meeting the minimum SHALL pass the version checks and versions below the minimum SHALL fail them. A passing version check SHALL remain only evidence of satisfying that declaration. Valid custom consumer ranges, including explicit upper bounds, SHALL continue to be enforced; missing/invalid declarations and existing secret-safe output and read-only constraints SHALL remain unchanged.

#### Scenario: Minimum and newer majors
- **WHEN** doctor receives a generated consumer manifest and versions at the minimum or stable newer majors
- **THEN** its Node and pnpm version checks pass without claiming the newer majors were runtime-tested

#### Scenario: Below the minimum
- **WHEN** installed Node is 24.11.9 or pnpm is 11.9.9 against the generated declarations
- **THEN** the corresponding compatibility check fails and the prerequisite exit is 4

#### Scenario: Consumer retains an upper bound
- **WHEN** an existing consumer retains a valid bounded engine range and the installed version exceeds it
- **THEN** doctor fails that declared range instead of silently adopting the current generated minimum policy

### Requirement: Doctor validates email settings without sending mail
For the `node` target, doctor SHALL validate the project environment's
`LACE_EMAIL_*`, `LACE_SMTP_*` and `LACE_RESEND_*` settings with the same
provider, sender, transport-security and pairing rules as the Node runtime.
Selecting `cloudflare` for the `node` target SHALL be reported as invalid.
Invalid settings SHALL be reported by variable name only, under the existing
deterministic output and exit rules. Doctor SHALL NOT open SMTP connections,
call provider APIs, or send messages. An absent provider SHALL be reported as
email delivery not configured, not as a failure.

#### Scenario: SMTP host is missing
- **WHEN** doctor runs for the `node` target with `LACE_EMAIL_PROVIDER=smtp`
  and no `LACE_SMTP_HOST`
- **THEN** it reports `LACE_SMTP_HOST` as invalid without contacting any mail
  server

#### Scenario: Email is not configured
- **WHEN** doctor runs without `LACE_EMAIL_PROVIDER`
- **THEN** it reports email delivery as not configured and does not fail on
  that account
