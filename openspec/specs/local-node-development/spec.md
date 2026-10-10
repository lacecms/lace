# Local Node Development Specification

## Purpose

Defines the repeatable, secure local Node development environment that lets a
contributor run and verify the complete Lace browser stack before VPS release work.

## Requirements

### Requirement: Local configuration synchronization is an explicit guarded command
The local development workflow SHALL provide `content:sync` against the configured local SQLite database and root project configuration. It SHALL print the complete human-readable plan before any mutation, reject invalid and stale plans with actionable diagnostics, and apply valid plans through the existing guarded atomic operation. `--check` SHALL make no writes and SHALL exit successfully only for a valid no-op plan. Startup and migration SHALL NOT synchronize models.

#### Scenario: First local synchronization
- **WHEN** a contributor runs `content:sync` against a migrated empty local database
- **THEN** the command shows creates before applying them, creates exactly one editable draft for each page, and creates no collection entry

#### Scenario: Repeat or changed configuration
- **WHEN** the command is repeated without a change or run after a safe configuration change
- **THEN** it reports respectively a no-op or the planned change, and applies only the latter

#### Scenario: Check and invalid plan preserve data
- **WHEN** `--check` finds pending operations or any invocation finds an invalid or stale plan
- **THEN** the command exits unsuccessfully with the reason and leaves entries, snapshots, public state, and outbox unchanged

### Requirement: Local sync instructions identify the contributor workflow
The developer guide SHALL describe the local sync command, `--check` semantics, the required running migrated stack, page and collection results, unsafe-change diagnostics, and the separation from API restart and migrations.

#### Scenario: Contributor defines another model
- **WHEN** a contributor edits the root configuration and follows the local guide
- **THEN** they can restart the API, inspect or apply synchronization, and find the resulting page draft or empty collection in Admin

### Requirement: One documented command starts the complete local Node stack
The system SHALL provide a documented `dev:node` command that starts the Node
API, applies already-committed SQLite migrations before the API becomes ready,
starts a private MinIO bucket and its idempotent bucket initializer, and starts
the admin and Astro development servers. The command SHALL make persistent
development database and object data explicit, preserve it across ordinary
stops, and report a non-zero outcome when a required service cannot become
healthy. It SHALL not use a production builder, release directory, or public
object bucket.

#### Scenario: A contributor starts a fresh local stack
- **WHEN** a contributor has installed the documented prerequisites, created a
  valid ignored local environment file, and invokes `dev:node`
- **THEN** the stack applies migrations, initializes the configured private
  bucket, and exposes healthy API, admin, and site development endpoints

#### Scenario: A required service fails to become ready
- **WHEN** MinIO, the migration dependency, API, admin server, or site server
  cannot start with the supplied local configuration
- **THEN** the start command reports the failing service and exits unsuccessfully
  without claiming that the stack is ready

### Requirement: Local configuration is complete, non-secret by default, and validates safely
The tracked environment example and development documentation SHALL identify
every value required by the local stack, including local endpoint/origin values,
SQLite location, MinIO root and application credentials, bucket and region,
timeout, and authentication secret. The example SHALL contain no usable
credential. Startup diagnostics and command output SHALL name invalid settings
without printing supplied secret values, and the local environment file SHALL
remain ignored by version control.

#### Scenario: A required local setting is absent
- **WHEN** a contributor starts the local stack with a missing or malformed
  required setting
- **THEN** startup fails before the affected service accepts traffic and names
  only the setting that requires correction

#### Scenario: A repository checkout is inspected
- **WHEN** a contributor reads the tracked environment example or repository
  history
- **THEN** it contains no local password, token, or other usable credential

### Requirement: Local browser development retains one public API origin and live frontend behavior
The local stack SHALL expose the API and health endpoints through the Node
development origin and route admin and site browser traffic through that origin
without sending API or health requests to frontend servers. The admin and site
processes SHALL run as development servers against mounted workspace sources so
their documented source-change behavior remains available. The local topology
SHALL not require a browser to know a container-only hostname or an object-store
credential.

#### Scenario: A browser uses the local admin
- **WHEN** a contributor opens the documented local admin URL and the admin
  requests an authenticated API resource
- **THEN** the request reaches the Node API at the same documented origin and
  does not require a CORS exception or a MinIO URL

#### Scenario: A browser opens an API or health URL
- **WHEN** a browser requests `/api/*`, `/health/live`, or `/health/ready` on
  the local development origin
- **THEN** the Node API handles that request locally rather than forwarding it
  to the admin or site server

### Requirement: Local bootstrap, documentation, and smoke verification are reproducible
The system SHALL provide a documented local-only operator path that creates one
expiring first-admin setup credential without a default password and reveals
the credential only to its invoker. The root README SHALL document prerequisites,
first start, first-admin completion, normal stop, deliberate data reset,
development URLs, focused/root test commands, quality gates, and common local
failures. A repeatable `dev:smoke` command SHALL create an isolated stack,
wait for the documented readiness conditions, verify API, admin, site, and
MinIO reachability, and clean up only the resources it created.

#### Scenario: A contributor performs the documented first run
- **WHEN** a contributor follows the README from an installed checkout through
  local bootstrap and sign-in
- **THEN** it can create the first administrator without receiving a hard-coded
  credential or manually editing database records

#### Scenario: The smoke check succeeds
- **WHEN** `dev:smoke` runs against a valid local checkout with Docker
  available
- **THEN** it reports success only after all four documented surfaces are
  reachable and leaves no stack or persistent data that existed before the
  check altered or removed

#### Scenario: A contributor requests a local reset
- **WHEN** a contributor explicitly invokes the documented destructive local
  reset command
- **THEN** only the named Lace development database and object-store data are
  removed, and the command clearly states that those local data cannot be
  recovered

### Requirement: Contributors can edit code-owned models with route guidance
The local developer guide SHALL identify the root configuration as the editable source of page and collection definitions, explain the stable key, version and explicit rename rules, and show how fixed page paths and collection route patterns relate to contributor-owned Astro route and rendering code. It SHALL instruct contributors to restart the development API after a configuration edit and SHALL make clear that configuration loading does not synchronize SQLite models or create content automatically.

#### Scenario: Add a page or collection in a local checkout
- **WHEN** a contributor follows the guide to define a model and its corresponding Astro route
- **THEN** they can identify the required configuration fields, route ownership, restart step, and separate synchronization step

#### Scenario: Configuration changes without synchronization
- **WHEN** a contributor restarts the local API after editing configuration but has not synchronized the database
- **THEN** the guide does not promise that the changed model is immediately editable in the admin

### Requirement: Local site can enter published-content development mode
The local Node stack SHALL support an explicit live site mode that reads the local published build export through the existing read-only build credential. The credential SHALL be available only to the server-side site process and SHALL not be embedded in browser output. A fresh stack without a build credential SHALL still support the first-admin and credential-creation workflow. Fixture mode SHALL remain available for isolated tests and setup.

#### Scenario: Contributor configures live mode
- **WHEN** a contributor supplies a valid local build credential and starts the site in live mode
- **THEN** the same-origin site renders only the content in the local published export through the existing SDK

#### Scenario: Fresh installation has no credential
- **WHEN** a contributor starts a fresh local stack before creating the first administrator or build credential
- **THEN** the stack remains usable for bootstrap and credential creation without exposing a default build credential

#### Scenario: Browser requests the site
- **WHEN** a browser opens a local site route in live mode
- **THEN** the browser response contains neither the build credential nor a client-side request bearing it

### Requirement: Local publication refresh and credential setup are documented
The developer guide SHALL explain how an administrator creates a read-only build token through the Admin Settings screen, configures the local server-side site process without committing the plaintext token, and refreshes or restarts the site after publication. The documented editorial path SHALL not require a browser-console API call or direct content API call. It SHALL explain that saving a draft does not change public site content and that automated build dispatch is not yet part of this workflow.

#### Scenario: Contributor publishes a changed draft
- **WHEN** a contributor follows the guide after publishing an edited entry
- **THEN** the documented refresh or restart step displays the new published content without editing the fixture

#### Scenario: Contributor saves without publishing
- **WHEN** a contributor saves a draft and follows the same refresh or restart step
- **THEN** the public site continues displaying the prior published content

#### Scenario: Administrator configures the live site through Admin
- **WHEN** an administrator follows the documented local setup after first sign-in
- **THEN** Settings issues the once-shown read-only build token and the administrator can enable live site mode without calling an API from the browser console

### Requirement: Contributor workflow proves code-owned content end to end
The local developer workflow SHALL demonstrate adding a page and collection in code, explicitly synchronizing their models, editing drafts in Admin, publishing entries, reading published-only API output, and refreshing the Astro site to observe the corresponding URLs. It SHALL state the field and block registration steps and distinguish structural model changes that require a version increase from display-only metadata changes that do not.

#### Scenario: Contributor adds and publishes a page and collection entry
- **WHEN** a contributor follows the local workflow from a migrated stack with the matching Astro route files present
- **THEN** Admin exposes the synchronized page and collection, and publication followed by the documented site refresh displays their published content at the configured URLs

#### Scenario: Contributor saves a later draft
- **WHEN** a contributor saves changed content or a slug without publishing and performs the documented site refresh
- **THEN** published-only API output and the site continue showing the previous published content and route

#### Scenario: Contributor changes model structure
- **WHEN** a contributor changes fields, allowed blocks, a page path, or a collection route
- **THEN** the guide instructs them to increase that model's version before explicit synchronization and explains that stored content can still make the plan invalid

### Requirement: The local Node stack captures outgoing email
The documented local Node development stack SHALL include a pinned local mail
capture service that accepts SMTP from the API container and offers a web
inbox on a documented local port. The local API SHALL be configured with the
`smtp` provider, development-only unencrypted transport, and a non-routable
development sender, so that no message leaves the developer's machine. The
local environment template SHALL contain no real mail credentials. Local
Cloudflare development templates SHALL default to the `log` provider. The
acceptance stack SHALL use the same capture configuration.

#### Scenario: Developer sends a test email locally
- **WHEN** a developer starts the local Node stack and an administrator sends a
  test email from Settings
- **THEN** the message appears in the local capture inbox and is not delivered
  to any external host

#### Scenario: Local environment is created
- **WHEN** the local environment is created from its template
- **THEN** it configures the capture service without any real provider key or
  password
