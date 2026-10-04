## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Cloudflare migration runs the project's installed Wrangler
For `cloudflare-local` and `cloudflare-remote` migration the CLI SHALL run the Wrangler executable installed in the nearest `node_modules/.bin` found from the configured Wrangler file's directory upward, with that configuration file, so a configuration in a subdirectory of the project uses the project's pinned Wrangler. When no installed Wrangler is found it SHALL fail with CONFIG before running any migration, naming the missing tool without exposing settings values.

#### Scenario: Configuration in a project subdirectory
- **WHEN** `LACE_WRANGLER_CONFIG` names `worker/wrangler.jsonc` and Wrangler is installed in the project root
- **THEN** local migration runs the root's Wrangler with that configuration and its migrations directory

#### Scenario: Wrangler not installed
- **WHEN** no `node_modules/.bin/wrangler` exists at or above the configuration's directory
- **THEN** migration fails with CONFIG naming Wrangler and applies nothing
