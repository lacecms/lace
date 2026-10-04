## MODIFIED Requirements

### Requirement: Root quickstart describes the delivered consumer workflow

The generated root README SHALL describe compatible Node/pnpm, Docker Compose and matching release prerequisites; dependency installation; protected environment preparation before environment-loaded scripts; settings/origins; setup-stage doctor; explicit migration and configuration sync; API start; bootstrap and first-admin creation; login and Settings-issued build token; Home publication; Astro development/static build; Compose operation and stop commands that preserve data. It SHALL explain root `lace.config.ts`, Home/Posts models, user-owned routes, SDK export loading, renderers, layouts and styling, linking to `docs/lace-operations.md` for detailed operation and private setup input. It SHALL distinguish draft save, publication and static deployment, identify the explicit generated `site/` default and link to deployment-time external Astro source selection. In a project generated with `--cloudflare` it SHALL summarize the local CMS Worker commands and state that the Worker and the static site are separate deployments, linking to the operations guide's Cloudflare Worker section; in other projects it SHALL state that `--cloudflare` adds a separate CMS Worker and static-site workflow. It SHALL NOT claim that the static-site workflow or Pages configuration deploys the CMS. It SHALL state that source-template behavior requires matching freshly built packages/images or a later compatible release and is not retroactively added to published alpha artifacts.

#### Scenario: Consumer starts from README
- **WHEN** a fresh consumer follows README with compatible artifacts
- **THEN** preparation precedes migration/sync, the consumer can complete first-admin setup and Home publication, and the site can read published content with a server-only build token using documented commands

#### Scenario: User extends the site
- **WHEN** the consumer adds a model or custom block
- **THEN** README explains explicit sync and user-owned route/renderer work, identifies the layout and SDK loader, and refers to the operations guide for guarded structural changes

#### Scenario: Later roadmap capabilities are absent
- **WHEN** a consumer reads the Cloudflare, setup or builder sections
- **THEN** the guide describes the existing API setup and generated-site/Pages support with browser setup for compatible Step 28A or later API/admin artifacts and the retained API alternative, with external-site selection requiring compatible Step 29A or later artifacts, and describes the generated CMS Worker as requiring compatible Step 31A or later packages without claiming a verified real-account deployment

#### Scenario: Cloudflare consumer reads README
- **WHEN** a consumer opens README of a project generated with `--cloudflare`
- **THEN** it lists the local Worker preparation, migration, sync, bootstrap and development commands with their explicit local target, and links to the Cloudflare Worker section for remote provisioning and deployment

## ADDED Requirements

### Requirement: Operations guide documents the Cloudflare Worker lifecycle
The operations guide of a project generated with `--cloudflare` SHALL contain a Cloudflare Worker section that documents: the generated files and their ownership; local state location and reset; local variable preparation and the development-mode override of production variables; explicit `cloudflare-local` and `cloudflare-remote` targets for migration, synchronization and bootstrap and that the D1 ID in the operator settings must equal the configuration's ID; account prerequisites and explicit commands to create the D1 database and R2 bucket, record their IDs, optionally add KV, upload secrets, migrate, sync, bootstrap and deploy; same-origin admin and API at the Worker's public base URL; the scheduled recovery trigger; the deploy-hook secret as the site build trigger; and the separate Astro deployment, whose build export transport uses the Worker origin with a read-only build token and whose rendered media and authentication use the Worker's public base URL. It SHALL label every remote command as an explicit account mutation, SHALL NOT contain usable credentials or resource IDs, and SHALL defer the verified real-account deployment to the release gate.

#### Scenario: Operator prepares a remote deployment
- **WHEN** an operator follows the Cloudflare Worker section with their own account
- **THEN** each remote step is an explicit command they run, the order is provision, configure, secrets, migrate, sync, deploy, bootstrap, and no step is performed by generation, installation or a generated script

#### Scenario: Local and remote ID mismatch
- **WHEN** the operator updates the D1 ID in `worker/wrangler.jsonc` but not in `.env`
- **THEN** the guide explains the CLI's mismatch error and that local simulated data is keyed by that ID
