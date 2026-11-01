## ADDED Requirements

### Requirement: Packed consumers import the documented sample package
Acceptance SHALL prove `lace import` from the packed CLI in a generated project,
using the documented sample package copied outside the project directory and
the generated project's own `lace.config.ts`:

- the CI starter phase SHALL run `pnpm exec lace import <sample> --validate-only`
  from the generated project root with no token and no running API and require
  exit code 0;
- the generated Node journey, after its existing publication and build checks,
  and the packed Cloudflare consumer journey, after its existing build checks
  and before stopping the Worker, SHALL issue an import token with publishing
  through the admin REST API, run `pnpm exec lace import <sample> --publish`
  with the token only in `LACE_IMPORT_TOKEN` and the runtime's origin in
  `--url`, require exit code 0, require the sample's posts and the `settings`
  global in the authenticated published export, then rerun the same command
  and require every item reported `unchanged`.

Failure diagnostics SHALL NOT contain the import token.

#### Scenario: The packed CLI validates the sample offline
- **WHEN** the starter phase validates the sample package from the generated
  project root
- **THEN** the command exits 0 without network access or a token

#### Scenario: The sample imports into a generated Node project
- **WHEN** the generated Node journey imports the sample package with
  `--publish` and reruns it
- **THEN** the published export contains the sample's posts and settings and
  the rerun reports every item `unchanged`

#### Scenario: The sample imports into a local Cloudflare Worker
- **WHEN** the packed Cloudflare consumer journey imports the sample package
  into its running local Worker with `--publish` and reruns it
- **THEN** the published export contains the sample's posts and settings and
  the rerun reports every item `unchanged`
