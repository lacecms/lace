# cloudflare-pages-deployment-tracking Specification

## Purpose
Defines optional Cloudflare Pages deployment tracking in the CMS Worker: the
separate Pages-Read credential and settings, exact-deployment polling and
outcome mapping, the overall tracking deadline, transient backoff kept out of
the outbox retry budget, and secrecy of tokens and provider responses.

## Requirements

### Requirement: Pages tracking is optional and uses a separate read credential
The CMS Worker SHALL enable Cloudflare Pages deployment tracking only when `LACE_PAGES_ACCOUNT_ID`, `LACE_PAGES_PROJECT_NAME`, and the Worker secret `LACE_PAGES_API_TOKEN` are all configured. The account ID SHALL be 32 lowercase hexadecimal characters, the project name a valid Pages project name, and the token a non-empty value without whitespace of at most 512 characters. Configuring only some of the three SHALL fail Worker validation naming only the missing or invalid variables. `LACE_PAGES_TRACKING_TIMEOUT_MINUTES` SHALL be optional, an integer from 5 to 1440, defaulting to 60. `LACE_PAGES_API_BASE_URL` SHALL be accepted only in development mode as an HTTPS or loopback HTTP URL ending in `/` and SHALL be invalid in production. The Worker SHALL NOT read the D1 operator token for tracking. Without tracking settings, deploy-hook acceptance SHALL remain terminal `accepted`.

#### Scenario: Tracking not configured
- **WHEN** the Worker runs with a deploy hook and no Pages tracking settings
- **THEN** an identified hook acceptance is recorded as `accepted` and no Pages API request is made

#### Scenario: Partial tracking settings
- **WHEN** `LACE_PAGES_ACCOUNT_ID` is set but `LACE_PAGES_API_TOKEN` is missing
- **THEN** requests receive the sanitized `503` and logs name `LACE_PAGES_API_TOKEN` and `LACE_PAGES_PROJECT_NAME` without any value

#### Scenario: Stub base URL in production
- **WHEN** `LACE_PAGES_API_BASE_URL` is set while the Worker runs in production mode
- **THEN** validation fails naming only that variable, so the token is never sent to another host

### Requirement: The exact deployment is polled and mapped from proof
Tracking SHALL read only the deployment identified by the build's stored provider ID through `GET accounts/{account}/pages/projects/{project}/deployments/{id}` with a bearer token, no redirects, a 10-second timeout, and a 256 KiB response limit. A response whose `result.id` differs from the requested ID SHALL never complete the build. The build SHALL become `succeeded` only when the latest stage is `deploy` with status `success`. A `failure` at `build` SHALL become `failed` with `provider_build_failed`, at `deploy` with `provider_deploy_failed`, and at another stage with `provider_failed`. Status `canceled` SHALL become `cancelled` with `provider_cancelled`; status `skipped` or `is_skipped: true` SHALL become `cancelled` with `provider_skipped`. `idle`, `active`, or `success` before `deploy` SHALL keep the build `running` with the observed stage recorded. `401` and `403` SHALL become `unknown` with `tracking_forbidden`; `404` after a 5-minute grace from tracking start SHALL become `unknown` with `tracking_not_found`; other non-2xx responses SHALL become `unknown` with `tracking_rejected`. Network errors, timeouts, `408`, `425`, `429`, `5xx`, oversize or malformed bodies, and unrecognized stage values SHALL be transient.

#### Scenario: Deployment succeeds
- **WHEN** the Pages API reports `latest_stage` `deploy`/`success` for the tracked ID
- **THEN** the build becomes `succeeded` with stage `deploy`, a completion time, and its target version becomes current

#### Scenario: Astro build fails
- **WHEN** the Pages API reports `latest_stage` `build`/`failure`
- **THEN** the build becomes `failed` with reason `provider_build_failed` and the previous release remains current

#### Scenario: Deploy stage fails
- **WHEN** the Pages API reports `latest_stage` `deploy`/`failure`
- **THEN** the build becomes `failed` with reason `provider_deploy_failed`

#### Scenario: Deployment cancelled or skipped
- **WHEN** the Pages API reports status `canceled`, or `is_skipped: true`
- **THEN** the build becomes `cancelled` with `provider_cancelled` or `provider_skipped` respectively

#### Scenario: Insufficient permission
- **WHEN** the Pages API answers `403`
- **THEN** the build becomes `unknown` with `tracking_forbidden` and the guidance names the Pages Read permission

#### Scenario: Build stage completed but not deployed
- **WHEN** the Pages API reports `build`/`success`
- **THEN** the build stays `running` with stage `build` and is checked again later

### Requirement: Tracking always ends within an overall deadline
Each tracked build SHALL have an overall deadline equal to the tracking start, defined as the completion time of its outbox event, plus the configured tracking timeout. A build whose deployment has not reached a terminal outcome by the deadline SHALL become `unknown` with `tracking_timeout`, including while the Pages API keeps failing transiently. Next checks SHALL never be scheduled after the deadline. When tracking settings are removed while builds are tracked, the next scheduled run SHALL complete each due tracked build as `unknown` with `tracking_unconfigured`.

#### Scenario: Provider never finishes
- **WHEN** a tracked deployment stays `active` beyond 60 minutes with the default timeout
- **THEN** the first check at or after the deadline records `unknown` with `tracking_timeout`, and a later `success` from Pages does not reopen it

#### Scenario: API outage outlasts the deadline
- **WHEN** every Pages API call fails with `503` until after the deadline
- **THEN** the build becomes `unknown` with `tracking_timeout` and never `failed` or endless `running`

#### Scenario: Tracking removed
- **WHEN** an operator removes the tracking settings while a build is tracked
- **THEN** the next scheduled run records that build as `unknown` with `tracking_unconfigured`

### Requirement: Transient failures back off without the outbox budget
A transient observation SHALL reschedule the check after a delay equal to the time since the last successful check or tracking start, bounded to 30 seconds through 10 minutes and to the deadline. A successful in-progress observation SHALL schedule the next check 30 seconds later. Backoff and deadlines SHALL be stored only in `site_builds` and SHALL NOT change outbox attempts, availability, or `last_error`.

#### Scenario: Transient outage then success
- **WHEN** the Pages API returns `503` twice and then `deploy`/`success` before the deadline
- **THEN** each failure postpones the next check by a growing delay, the build finally becomes `succeeded`, and the outbox event attempts are unchanged

### Requirement: Tracking secrets and provider responses are never disclosed
The Pages API token, deploy-hook URL, and Pages API response bodies SHALL NOT be persisted, logged, or returned by any API. Build records SHALL store only the closed stage name, last successful check time, next check time, closed reason, and the provider deployment ID. Tracking logs SHALL contain only the component, build ID, and closed reason.

#### Scenario: Response contains environment variables
- **WHEN** the Pages API response includes `env_vars` and build configuration
- **THEN** none of those values appear in D1, build DTOs, or logs
