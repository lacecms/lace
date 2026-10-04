## MODIFIED Requirements

### Requirement: Operations guide documents the Cloudflare Worker lifecycle
The operations guide of a project generated with `--cloudflare` SHALL contain a Cloudflare Worker section that documents: the generated files and their ownership; local state location and reset; local variable preparation and the development-mode override of production variables; explicit `cloudflare-local` and `cloudflare-remote` targets for migration, synchronization and bootstrap and that the D1 ID in the operator settings must equal the configuration's ID; account prerequisites and explicit commands to create the D1 database and R2 bucket, record their IDs, optionally add KV, upload secrets, migrate, sync, bootstrap and deploy; same-origin admin and API at the Worker's public base URL; the scheduled recovery trigger; the deploy-hook secret as the site build trigger; and the separate Astro deployment, whose build export transport uses the Worker origin with a read-only build token and whose rendered media and authentication use the Worker's public base URL. It SHALL label every remote command as an explicit account mutation, SHALL NOT contain usable credentials or resource IDs, and SHALL defer the verified real-account deployment to the release gate.

The section SHALL also document the complete local journey and its recovery:

- pointing the operator `.env` API and public origins at the local Worker for site builds and local diagnosis, and that the Node runtime uses different values;
- first-administrator setup in the browser at the local admin with the printed token, sign-in, and issuing a read-only build token;
- `lace doctor --target cloudflare-local` with its `setup`/`ready` meaning, API-derived migration evidence and that it never creates local state, and `lace doctor --target cloudflare-remote` for the explicit remote ledger check;
- an expired or lost setup token: setup stays open and the operator re-issues a token with the Worker stopped;
- an unavailable or rejected deploy hook: the build stays pending with a sanitized reason, the scheduled trigger retries, a terminal failure is retried explicitly in Admin, and locally the scheduled handler can be invoked manually;
- that deploy hooks exist only for a Git-connected Pages project (or another provider whose build hook accepts a bodiless `POST`), that the generated manual direct-upload workflow is not started by the hook, and that a hook accepted by the provider is recorded as a running build, which is not proof of a successful static deployment.

The guide SHALL NOT describe CMS Worker onboarding or its doctor path as future work.

#### Scenario: Operator prepares a remote deployment
- **WHEN** an operator follows the Cloudflare Worker section with their own account
- **THEN** each remote step is an explicit command they run, the order is provision, configure, secrets, migrate, sync, deploy, bootstrap, and no step is performed by generation, installation or a generated script

#### Scenario: Local and remote ID mismatch
- **WHEN** the operator updates the D1 ID in `worker/wrangler.jsonc` but not in `.env`
- **THEN** the guide explains the CLI's mismatch error and that local simulated data is keyed by that ID

#### Scenario: Operator diagnoses the local Worker
- **WHEN** an operator follows the guide to run doctor for the local Worker
- **THEN** the documented command selects `cloudflare-local` with the local Worker origin and the guide explains which results are expected before the Worker runs

#### Scenario: Deploy hook never fires a direct-upload workflow
- **WHEN** an operator reads how publication rebuilds the site
- **THEN** the guide states that the hook requires a Git-connected Pages project or an equivalent provider hook and that the manual workflow must be run explicitly otherwise
