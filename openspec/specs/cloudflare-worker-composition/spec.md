# cloudflare-worker-composition Specification

## Purpose
Defines how the Cloudflare Worker composes D1, R2, optional KV, static admin
assets, secrets, Better Auth, and the project-owned configuration into the same
portable API behavior as the Node deployment.

## Requirements

### Requirement: Worker bindings and secrets are validated without disclosure
The Worker SHALL require a D1 binding, an R2 binding, an authentication secret,
and an absolute public base URL, and SHALL accept an optional KV cache binding,
an optional static-assets binding, an optional HTTPS deploy-hook URL secret, an
optional deploy-hook timeout from 1 to 60000 ms, an optional environment mode,
and an optional bounded storage timeout. It SHALL validate them once per isolate
before serving application traffic. When validation fails, API requests SHALL
receive a sanitized `503` error envelope and the Worker SHALL log only the names
of affected bindings or variables, never a supplied value.

#### Scenario: Valid bindings serve the API
- **WHEN** the Worker starts with valid required bindings and secrets
- **THEN** health, public, admin, and auth routes are served by the portable
  application backed by D1 and R2

#### Scenario: A required secret is missing
- **WHEN** the authentication secret or public base URL is absent or invalid
- **THEN** requests receive a sanitized `503` response and logs name only the
  affected variable

#### Scenario: Deploy-hook timeout is out of range
- **WHEN** the deploy-hook timeout is `0`, above `60000`, or not an integer
- **THEN** requests receive a sanitized `503` response and logs name only the
  deploy-hook timeout variable

### Requirement: Worker composition matches Node application behavior
The Worker SHALL compose the same portable application as Node: content, media,
build, and security capabilities backed by D1 and R2, D1 security persistence,
HMAC rate limiting keyed by the Cloudflare-provided client IP, and the
statically imported, normalized project configuration. No request SHALL select
or evaluate a configuration module. When a deploy-hook URL is configured, build
dispatch SHALL use the Cloudflare deploy-hook trigger. When no deploy-hook
trigger is configured, build dispatch SHALL record the same sanitized
trigger-unavailable failure as an unconfigured Node deployment.

#### Scenario: Same request gives the same response
- **WHEN** an authenticated admin creates, saves, and publishes an entry through
  the Worker and through Node with equal configuration
- **THEN** both return equal response contracts and enqueue one site-build event

#### Scenario: Deploy hook is configured
- **WHEN** a build event is dispatched by a Worker with a deploy-hook URL secret
- **THEN** the deploy hook is called and its mapped result is recorded on the
  build

#### Scenario: Deploy hook is absent
- **WHEN** a build event is dispatched by a Worker without a deploy-hook URL
- **THEN** the attempt is recorded as a sanitized `trigger_unavailable` failure

### Requirement: Better Auth runs on D1 with its compatibility flag
The Worker SHALL run Better Auth email/password sessions against D1 with the same
closed-enrollment, same-origin, trusted-origin, and disabled-account rules as
Node. Its Worker configuration SHALL enable the `nodejs_compat` compatibility
flag that Better Auth requires for `AsyncLocalStorage`. Session cookies SHALL be
`Secure` unless the Worker is explicitly configured for development mode.

#### Scenario: Bootstrapped administrator signs in on the Worker
- **WHEN** setup completes through the Worker and the administrator signs in
- **THEN** the session resolves to the administrator actor on subsequent admin
  requests

#### Scenario: Compatibility flag is present
- **WHEN** the Worker configuration is inspected
- **THEN** it declares the `nodejs_compat` compatibility flag

### Requirement: Built admin assets are served under /admin behind API routing
The Worker SHALL route `/api/*` and `/health/*` to the portable application
before any static asset, and SHALL serve compiled admin files under `/admin/`
from the static-assets binding, redirecting `/admin` to `/admin/` and falling
back to the admin entry document for extensionless client routes. A missing
asset with an extension SHALL return `404`, and non-`GET`/`HEAD` admin asset
requests SHALL return `405`.

#### Scenario: Admin client route is refreshed
- **WHEN** a browser requests `/admin/content/posts`
- **THEN** the Worker returns the admin entry document

#### Scenario: API path shadows no asset
- **WHEN** a request targets an unknown `/api/v1/...` path
- **THEN** it receives the API `404` error envelope rather than an admin asset

### Requirement: KV cache is optional and never authoritative
The Worker SHALL use a no-op cache unless a KV binding is configured. A
configured KV cache SHALL treat missing, malformed, or failing reads as misses
and SHALL ignore write and delete failures, so correctness never depends on KV
presence or freshness.

#### Scenario: KV is absent or stale
- **WHEN** the Worker runs without a KV binding or KV returns a stale or
  malformed value
- **THEN** request results are unchanged because the cache is treated as a miss

### Requirement: Worker bundle is runtime-portable
The deployable Worker bundle SHALL contain no Node SQLite driver, S3 client,
native image library, Node filesystem access, or secret value. Secrets SHALL be
supplied only through Worker secret bindings.

#### Scenario: Bundle is inspected
- **WHEN** the Worker is bundled for deployment
- **THEN** the output contains no `better-sqlite3`, `@aws-sdk`, `sharp`, or
  `node:fs` module and no configured secret value

### Requirement: Worker readiness requires a current D1 schema
The Worker SHALL verify that the selected D1 database has every checked-in migration before reporting readiness. A missing migration or unavailable migration table SHALL produce an unavailable readiness response without exposing binding values. The Worker SHALL not apply migrations on startup or on a health request.

#### Scenario: Remote deployment has not migrated
- **WHEN** a deployed Worker receives a readiness probe against D1 with a pending migration
- **THEN** readiness returns unavailable while the migration remains pending

### Requirement: Worker composes optional Pages tracking
The Worker SHALL validate the optional Pages tracking settings together with its other bindings, without disclosing values, and SHALL compose a site-build tracker backed by the D1 repository, the Worker clock, and a Pages deployment reader when tracking is configured, or by no reader otherwise. The deploy-hook trigger SHALL be told whether tracking is configured.

#### Scenario: Tracking settings are valid
- **WHEN** the Worker starts with a deploy hook and valid Pages tracking settings
- **THEN** identified hook acceptances are tracked and scheduled runs read the Pages deployment with the configured token

#### Scenario: Invalid tracking timeout
- **WHEN** `LACE_PAGES_TRACKING_TIMEOUT_MINUTES` is `4`, `1441`, or not an integer
- **THEN** requests receive the sanitized `503` and logs name only that variable
