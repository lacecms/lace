## MODIFIED Requirements

### Requirement: Root quickstart describes the delivered consumer workflow

The generated root README SHALL be a short entry guide stating minimum Node/pnpm requirements, separately pinned and tested versions, matching Lace artifacts, the selected CMS/site layout and ownership, and links to the Compose development, Compose production, existing-site connection and operations guides. With `--cloudflare` it SHALL link to the generated Cloudflare guide; without it SHALL explain that Cloudflare files require a fresh matching `--cloudflare` project without linking to an absent file. It SHALL distinguish draft save, publication and static deployment and state that the CMS Worker and static site are separate deployments. The complete installation, setup and operation sequence SHALL live in the scenario guides rather than be duplicated in README. It SHALL state that newer template behavior requires matching freshly built packages/images or a later compatible release and does not retroactively change published alpha artifacts.

#### Scenario: Consumer starts from README
- **WHEN** a fresh consumer opens README with compatible artifacts
- **THEN** the requirements and recorded layout identify the right scenario guide and every linked local file and anchor exists

#### Scenario: User extends the site
- **WHEN** the consumer adds a model or custom block
- **THEN** the entry guide points to the connection and operations references for explicit sync and user-owned route/renderer work

#### Scenario: Later roadmap capabilities are absent
- **WHEN** a consumer reads artifact compatibility and scenario guidance
- **THEN** it distinguishes delivered source behavior from immutable published artifacts and unverified real-account deployment

#### Scenario: Cloudflare consumer reads README
- **WHEN** a consumer opens README of a project generated with `--cloudflare`
- **THEN** it links to a guide that starts with the local Worker, then covers explicit remote provisioning and separate CMS/site deployment

### Requirement: Concise setup example uses placeholders and the configured public origin

The Compose development guide and operations reference SHALL include the same short placeholder-only `curl` example for `POST /api/v1/setup/admin` with JSON `token`, `email` and `password` and a placeholder configured public API base URL retaining its optional path prefix. Adjacent guidance SHALL explain obtaining the one-time expiring token via bootstrap, a 12-character password minimum, completed-setup closure, shell-history/process exposure when replacing inline placeholders, and the existing private-input script as the safer practical option. Examples SHALL contain no usable credentials and SHALL NOT weaken server setup authorization or imply a setup token is a build token.

#### Scenario: Request shape and configured origin
- **WHEN** a consumer replaces placeholders with test values and an API base URL including a path prefix
- **THEN** the example sends a JSON POST to that prefix plus `/api/v1/setup/admin` with exactly token, email and password

#### Scenario: Expired or already consumed setup
- **WHEN** setup fails because a token expired or setup already completed
- **THEN** the guide directs unfinished setup to bootstrap again and completed setup to existing-admin login without reopening registration

### Requirement: Generated guides explain publication visibility per mode
The generated Compose development and production guides and the operations guide SHALL separately explain draft save, CMS publication, Astro dev visibility, manual static build and deployment, and automatic Compose build/release visibility as applicable to their scenario. They SHALL state that dev shows publications to existing routes on reload and needs a restart for new or renamed slugs, token or environment changes; that a manual static build requires a fresh build and the operator's own deployment; and that Compose serves content after a succeeded covering build, keeps the previous release on failure, may serve a release moments before Builds records success, and sends revalidating cache headers. They SHALL direct operators to Builds for build state and SHALL NOT claim dev, manual or provider deployment success from CMS publication state. The entry README SHALL distinguish draft save, publication and deployment and link to these guides.

#### Scenario: Operator publishes in each mode
- **WHEN** an operator follows the applicable scenario guide after publishing a change
- **THEN** the documented next action for dev, manual static and Compose produces the observed visible result without an unnecessary restart or rebuild

### Requirement: Guides describe the project's site mode
The generated README, scenario guides and operations guide SHALL state the project's site mode and path. For existing-site mode the README SHALL name the site path, the block-install command and the connection guide, and the development guide and operations guide SHALL give the sequence: install the Lace site packages in the site, run `pnpm exec lace add block --all --site <path>` from the CMS directory, create the loader file and routes per `docs/lace-astro-site.md`, and build with the root `dev`/`build` scripts or the Compose builder selecting that site; they SHALL state that the generator did not modify the site. For no-site mode they SHALL state that no site is built, that build requests fail until a site is configured, and how to connect a site later with the existing-site guide and build-site settings, without instructing absent site scripts. Starter-mode guidance SHALL name the generated `site/` sources.

#### Scenario: Existing-site README
- **WHEN** a project is generated with `--existing-site ..`
- **THEN** its README names the site path `..`, `pnpm exec lace add block --all --site ..`, and `docs/lace-astro-site.md`, and does not instruct editing `site/`

#### Scenario: No-site README
- **WHEN** a project is generated with `--no-site`
- **THEN** its README states that no site is built and links the connection guide for later

## ADDED Requirements

### Requirement: Scenario guides document complete distinct operator journeys
Generated projects SHALL deliver separate managed Compose development and Compose production guides, and a managed Cloudflare guide when generated with `--cloudflare`. Each SHALL identify its working directory, prerequisites, ordered commands, one-time versus repeat actions, expected result, next step and failure recovery. Guides SHALL render the selected starter/existing/none mode, preserving explicit migration/sync/bootstrap and existing-site integration requirements; no-site projects SHALL NOT be instructed to run absent site scripts. References SHALL cover setup tokens and private input, model/route/block extension, build-site selection, doctor limits, backup and persistent-data-preserving stops. Each scenario SHALL be followable without reading another scenario's lifecycle first; shared detail SHALL be linked to existing references.

The development guide SHALL cover environment preparation before environment-loaded commands, setup doctor, migration/sync/bootstrap with stopped database users, browser setup/login/build-token issuance, publication, editable Astro and static builds when applicable, and restart/repeat operation. Production SHALL cover compatible images, reviewed public origins and service secrets, explicit initialization, build token and source/lockfile prerequisites, dispatcher/builder/static serving, prior-release preservation on failure, repeat maintenance and recovery. The host/Compose SQLite access rule SHALL precede every relevant command sequence and not be labelled fixed by 33A–33F.

The Cloudflare guide SHALL cover account-free local Worker preparation, local persistence, stopped-Worker operator commands, browser setup, doctor and site build, followed by explicit real-account provisioning, credential/preflight choices delivered by 33F, Worker secrets, remote migration/sync/bootstrap/deploy, and separate static-site deployment. Local and remote data SHALL be labelled independent; Wrangler OAuth, the operator API token, LACE_AUTH_SECRET, setup/build tokens and Pages tracking token SHALL have separate purposes and locations. The guide SHALL use the settled 33F credential loading contract and SHALL NOT recommend storing the D1-only operator token in files Wrangler loads implicitly.

Guides SHALL describe delivered ordered blocks, weak/strong export ETags, sanitized builder source failures, retries preserving publication and prior output, untracked hook `accepted` versus deployment proof, and tracked Pages terminal outcomes. Remaining workarounds SHALL be labelled and real-account verification SHALL remain a release gate rather than a local-test claim.

#### Scenario: Compose development from an empty consumer
- **WHEN** an operator follows only the development guide and its linked detail references
- **THEN** documented commands complete preparation, first-admin setup, publication and an applicable site build without undocumented steps or overwritten credentials

#### Scenario: Repeated host maintenance with a running Compose stack
- **WHEN** an operator repeats migration, sync or bootstrap after starting Compose
- **THEN** the relevant sequence first stops api and dispatcher, performs the explicit command and restarts services while retaining content

#### Scenario: Production build fails
- **WHEN** selected source is invalid or a site build fails
- **THEN** production guidance identifies sanitized diagnostics and corrective retry, and explains that the prior release remains served

#### Scenario: Local then remote Cloudflare
- **WHEN** an operator follows the Cloudflare guide from local development to the real account section
- **THEN** remote operations require explicit account/database selection and the delivered 33F credential preflight, do not copy local content automatically and keep Worker and static deployment separate

#### Scenario: Existing-site or headless mode
- **WHEN** a guide is generated for an existing site or no site
- **THEN** it identifies the recorded external site path and connection prerequisites, or explains unavailable site builds without referring to missing starter scripts
