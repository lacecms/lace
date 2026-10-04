# cloudflare-consumer-worker Specification

## Purpose
Defines how a generated Cloudflare consumer builds, configures, runs locally and deploys its own CMS Worker from versioned Lace packages, separately from its static Astro hosting.

## Requirements

### Requirement: Consumer Worker is composed from versioned packages
A project generated with `--cloudflare` SHALL contain a Worker entry that statically imports the project's root `lace.config.ts` at bundle time and composes the published Cloudflare platform package. The entry SHALL depend only on installed Lace packages and project files; bundling it SHALL require no Lace engine checkout, no source-workspace path and no Cloudflare account. The Worker SHALL serve the API, authentication, health and the admin under `/admin/` from one origin, and SHALL handle scheduled events for outbox recovery. The runtime SHALL NOT evaluate a configuration path supplied at request time.

#### Scenario: Account-free bundle
- **WHEN** an installed generated Cloudflare consumer runs its bundle check without Cloudflare credentials
- **THEN** Wrangler produces a Worker bundle containing the project's content models, and the bundle references no path inside a Lace source workspace

#### Scenario: Configuration change
- **WHEN** the consumer edits `lace.config.ts` and bundles again
- **THEN** the new bundle contains the edited configuration and no request can select another configuration

### Requirement: Packaged admin assets match the installed release
The published Cloudflare platform package SHALL contain the compiled admin application of the same release in a directory usable as a Workers static-assets directory. The generated Worker configuration SHALL bind that installed directory as `ASSETS` so the Worker serves `/admin/` and its client routes with the existing admin asset rules. The generated project SHALL contain no editable admin source.

#### Scenario: Local admin served
- **WHEN** the generated Worker runs locally after installation
- **THEN** `/admin/` returns the packaged admin HTML and its referenced assets are served with `nosniff`

#### Scenario: Assets missing from a package
- **WHEN** a packed Cloudflare platform archive lacks the admin entry document
- **THEN** release verification fails and names the package and missing asset

### Requirement: Worker configuration declares bindings without secrets
The generated, user-owned Worker configuration SHALL declare the Worker name, a pinned compatibility date, the `nodejs_compat` flag required by authentication, a D1 binding `DB` whose migrations directory is the installed `@lacecms/db` migrations, an R2 binding `MEDIA`, the packaged admin `ASSETS` binding with Worker-first routing, a scheduled trigger for recovery, and plain variables for the public base URL and, when the project has a site, the build-site identity. Resource IDs SHALL be clearly marked placeholders. KV SHALL be optional: without a `CACHE` binding the Worker uses its no-op cache, and the configuration SHALL document how to add one. The configuration SHALL contain no auth secret, deploy-hook URL, API token or account credential, and SHALL NOT contain Pages output settings.

#### Scenario: Generated Worker configuration
- **WHEN** a project is generated with `--cloudflare`
- **THEN** its Worker configuration declares `DB`, `MEDIA`, `ASSETS`, `nodejs_compat`, a cron trigger and no secret or Pages setting

#### Scenario: Optional KV absent
- **WHEN** the consumer runs or deploys the Worker without adding a `CACHE` binding
- **THEN** the Worker starts with the no-op cache and reports no missing-binding error

#### Scenario: Placeholder database ID before remote work
- **WHEN** an operator attempts a remote migration while the configuration still holds the placeholder D1 ID
- **THEN** the operation is refused or fails before mutating any remote database, and the guide names creating the database and setting its ID as the prerequisite

### Requirement: Local Worker state and secrets are explicit and persistent
Local Worker development SHALL use simulated D1 and R2 persisted in one ignored project directory that the local operator target and the development server share. Local Worker variables SHALL come from an ignored `worker/.dev.vars` created from a committed secret-free example; local values SHALL select development mode and the local origin and SHALL override the configuration's production variables only locally. Local migration, configuration synchronization and setup-token bootstrap SHALL require the explicit `cloudflare-local` target. Data, accounts, setup state and media SHALL survive restarting the local Worker.

#### Scenario: Restart persistence
- **WHEN** an administrator is created, media is uploaded and the local Worker is stopped and started again with the same state directory
- **THEN** the administrator can sign in, setup remains closed, the content models remain present and the media bytes are served unchanged

#### Scenario: Missing local secret
- **WHEN** the local Worker starts without `worker/.dev.vars`
- **THEN** requests fail closed with the generic unavailable response and the Worker log names the missing variable without revealing any value

### Requirement: Worker CMS and Astro hosting are configured separately
The CMS Worker configuration and the static Astro hosting SHALL be independent. Astro static hosting SHALL be configured by its deployment workflow with an explicit output directory and project name, and SHALL NOT rely on the Worker configuration. The guide SHALL state that deploying the static site does not deploy the CMS, that the Worker and the site are separate deployments, that the site's build export transport uses the Worker origin with a read-only build token, and that rendered media and authentication use the Worker's public base URL. Remote resource creation, remote migration, secret upload and Worker deployment SHALL remain explicit operator commands documented with their prerequisites; no generated script SHALL mutate a Cloudflare account or production resource.

#### Scenario: Static deployment
- **WHEN** the operator runs the generated Pages workflow
- **THEN** it builds and deploys only the Astro output and does not deploy, migrate or configure the Worker

#### Scenario: Generated scripts stay local
- **WHEN** an operator runs any generated `cf:*` package script
- **THEN** it reads or writes only local files and local simulated resources and makes no Cloudflare API request

### Requirement: Real-account deployment handoff is explicit
The repository SHALL provide a Cloudflare real-account deployment handoff for the release gate that lists: the account products and API-token permissions required; every resource to create and the IDs and names to record; Worker secrets and plain variables; the order provision, configure, secrets, remote migrate, remote sync, Worker deploy, remote bootstrap and browser setup; the static-hosting integration through a Git-connected Pages project with its build settings, build variables and read-only build token, and the deploy hook stored as the Worker secret; the evidence to capture and the pass criteria; and cleanup. The handoff SHALL distinguish a provider accepting a deploy hook from a confirmed successful static deployment, and SHALL state that local Worker acceptance, including Miniflare-backed D1 and R2, is not real Cloudflare deployment acceptance. It SHALL contain no usable credential, account ID or resource ID.

#### Scenario: Release gate prepares a real deployment
- **WHEN** a release owner follows the handoff with a dedicated Cloudflare account
- **THEN** every account mutation is an explicit step with its prerequisite permissions and every value to record is named without being supplied

#### Scenario: Local acceptance passed
- **WHEN** only the packed Cloudflare consumer acceptance has passed
- **THEN** the handoff and generated guidance still report real-account deployment as unverified until the release-gate evidence exists

#### Scenario: Hook accepted during the release gate
- **WHEN** the deployed Worker records a build as running with a provider deployment ID
- **THEN** the handoff requires separately confirming the provider's deployment result and the served page before the static deployment counts as verified
