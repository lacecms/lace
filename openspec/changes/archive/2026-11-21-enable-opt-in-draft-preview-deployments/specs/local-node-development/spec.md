## MODIFIED Requirements

### Requirement: One documented command starts the complete local Node stack
The system SHALL provide a documented `dev:node` command that starts the Node
API, applies already-committed SQLite migrations before the API becomes ready,
starts the bundled SILO service and its idempotent private bucket initializer,
and starts the admin and Astro development servers. The command SHALL make persistent
development database and object data explicit, preserve it across ordinary
stops, and report a non-zero outcome when a required service cannot become
healthy. The development workflow SHALL NOT use a production builder,
release directory, or public object bucket. An explicitly selected preview
variant SHALL be allowed to start a private development runner that only
performs preview work.

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

## ADDED Requirements

### Requirement: Contributors can opt in to protected preview locally
The Node development workflow SHALL document an opt-in startup that uses
trusted local HTTPS for the CMS and a separate preview hostname, with
loopback-only browser ingress and no published runner or storage ports.
The runner SHALL build the selected eligible Astro route from a committed
source tree using PV1 validation and capture. It SHALL require no production
build token or hosted runner. Existing local SQLite and private SILO data,
frontend reload, and ordinary Astro development SHALL remain available.

#### Scenario: Preview a saved draft in the reference site
- **WHEN** a contributor starts the opt-in stack with trusted local HTTPS and compatible committed source and opens a saved draft in Admin
- **THEN** the normal UI can create and view the single-page revision and its protected assets with the contributor's Lace session

#### Scenario: Local source changes after checkout
- **WHEN** relevant source changes are uncommitted and an editor requests a preview
- **THEN** the runner reports a safe source error instead of building from the mutable tree

#### Scenario: Ordinary local startup stays lightweight
- **WHEN** a contributor starts the standard stack without the preview variant
- **THEN** the existing local editing and site development workflow starts without a preview runner or a local TLS prerequisite
