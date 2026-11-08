## MODIFIED Requirements

### Requirement: Scenario guides document complete distinct operator journeys
Generated projects SHALL deliver separate managed Compose development and Compose production guides, and a managed Cloudflare guide when generated with `--cloudflare`. Each SHALL identify its working directory, prerequisites, ordered commands, one-time versus repeat actions, expected result, next step and failure recovery. Guides SHALL render the selected starter/existing/none mode, preserving explicit migration/sync/bootstrap and existing-site integration requirements; no-site projects SHALL NOT be instructed to run absent site scripts. References SHALL cover setup tokens and private input, model/route/block extension, build-site selection, doctor limits, backup and persistent-data-preserving stops. Each scenario SHALL be followable without reading another scenario's lifecycle first; shared detail SHALL be linked to existing references.

The development guide SHALL cover environment preparation before environment-loaded commands, setup doctor, migration/sync/bootstrap with stopped database users, browser setup/login/build-token issuance, publication, editable Astro and static builds when applicable, and restart/repeat operation. Production SHALL cover compatible images, reviewed public origins and service secrets, explicit initialization, build token and source/lockfile prerequisites, dispatcher/builder/static serving, prior-release preservation on failure, repeat maintenance and recovery. The host/Compose SQLite access rule SHALL precede every relevant command sequence.

The Cloudflare guide SHALL cover account-free local Worker preparation, local persistence, stopped-Worker operator commands, browser setup, doctor and site build, followed by explicit real-account provisioning, the explicit credential and preflight choices, Worker secrets, remote migration/sync/bootstrap/deploy, and separate static-site deployment. Local and remote data SHALL be labelled independent; Wrangler OAuth, the operator API token, LACE_AUTH_SECRET, setup/build tokens and Pages tracking token SHALL have separate purposes and locations. The guide SHALL use the explicit credential loading contract and SHALL NOT recommend storing the D1-only operator token in files Wrangler loads implicitly.

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
- **THEN** remote operations require explicit account/database selection and the credential preflight, do not copy local content automatically and keep Worker and static deployment separate

#### Scenario: Existing-site or headless mode
- **WHEN** a guide is generated for an existing site or no site
- **THEN** it identifies the recorded external site path and connection prerequisites, or explains unavailable site builds without referring to missing starter scripts
