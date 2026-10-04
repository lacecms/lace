## MODIFIED Requirements

### Requirement: Generated deployment paths pass local smoke tests

Acceptance SHALL run the generated Docker Compose production configuration with locally built, versioned API and builder images, verify API readiness and serving behavior, and stop its containers and volumes after the test. For a project generated with `--cloudflare`, acceptance SHALL preview the generated static-site output locally and SHALL run the packed consumer's own Worker without requiring a Cloudflare account or importing the source-workspace Worker composition.

#### Scenario: Compose production flow
- **WHEN** the required local images and generated environment are supplied to the generated Compose project
- **THEN** its production services start and the migrated API reaches readiness without accessing engine source in the generated project

#### Scenario: Optional Cloudflare flow
- **WHEN** the generator is invoked with `--cloudflare`
- **THEN** the generated static output previews locally and the generated consumer's Worker bundles and starts without remote credentials

## ADDED Requirements

### Requirement: Packed Cloudflare consumer runs its own Worker
The repository SHALL provide a Cloudflare consumer acceptance phase, runnable without Docker or a Cloudflare account, that packs the local Lace graph, generates a project with `--cloudflare`, installs it from the packed artifacts outside the source workspace, and uses only the generated project's scripts, Worker entry and configuration. It SHALL bundle the Worker and reject a bundle that references the source workspace or lacks the project's models; prepare local Worker variables; migrate, synchronize and bootstrap through the `cloudflare-local` target; start the Worker with persistent local state; verify readiness, the packaged admin document and an admin asset, first-administrator setup with the bootstrap token, login, the project's content models and a media upload; then stop and restart the Worker and verify sign-in, closed setup, models and the uploaded media bytes. It SHALL redact the setup token, password and session from diagnostics, stop every Worker process and remove its temporary project unless retention is requested.

#### Scenario: Cloudflare consumer journey
- **WHEN** the Cloudflare consumer acceptance phase runs on a clean checkout
- **THEN** the packed generated project bundles and starts its own Worker, serves the packaged admin and its configuration, and its D1 and R2 state survives a restart

#### Scenario: Worker bundle uses source-workspace code
- **WHEN** the generated Worker bundle references a path inside the Lace source workspace
- **THEN** acceptance fails at the bundle stage with that reason

#### Scenario: Worker fails to become ready
- **WHEN** the local Worker exits or does not report readiness within the bounded wait
- **THEN** acceptance fails with the stage and sanitized Worker output and stops the Worker process
