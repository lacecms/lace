# Cloudflare Worker runtime

Internal note on the Cloudflare composition: request routing, bounded
background work, deploy-hook and Pages-tracking outcomes, the engine
repository's local Worker stack and its verification. Operator setup,
credentials, site deployment, email and upgrades are public:
[Deploy on Cloudflare](../apps/docs/src/content/docs/en/latest/deployment/cloudflare.md).
Every Worker var, secret and binding is listed in
[CLI and environment](../apps/docs/src/content/docs/en/latest/reference/cli-environment.md).

The Cloudflare composition runs the same portable API as the
[Node runtime](node-api.md). It uses D1 for SQL data, a native R2 binding for
media, and the Workers static-assets binding for the built admin. Everything is
wired in `@lacecms/platform-cloudflare` (`createCloudflareWorker`). The
engine's deployable entry is [`apps/api/worker/index.ts`](../apps/api/worker/index.ts),
configured by [`apps/api/wrangler.jsonc`](../apps/api/wrangler.jsonc).

The entry statically imports the repository-root `lace.config.ts`, so the
normalized configuration is bundled into the Worker. No request can select or
evaluate a configuration module.

Build dispatch calls the configured [deploy hook](#deploy-hook). Without one,
it records the same sanitized `trigger_unavailable` failure that an
unconfigured Node deployment records.

## Runtime bindings

The Worker requires the `DB` (D1) and `MEDIA` (R2, objects keyed `media/<id>`)
bindings; `ASSETS` serves the built admin under `/admin/`, `CACHE` (KV) is an
opt-in derived cache whose misses and failures never change results, and
`EMAIL` is the Email Service `send_email` binding of the `cloudflare` email
provider. Secrets are set with `wrangler secret put`, never through `vars`.
When bindings or variables are invalid, every request receives a sanitized
`503` envelope, and the Worker logs only the names of the affected bindings or
variables, never their values. Pages tracking is enabled only when all three of
its settings are present; a partial set is a validation error.

Email sends map binding and provider errors to the same closed reasons as the
Node runtime ([email delivery boundary](node-api.md#email-delivery-boundary)).
Public reset emails and password-changed notices run after the response
through the request's `executionCtx.waitUntil`, so delivery never delays the
request.

## Compatibility and routing

`wrangler.jsonc` enables `nodejs_compat`, the compatibility flag Better Auth
needs for `AsyncLocalStorage`. Static assets use `run_worker_first`, so every
request reaches the Worker. Requests are handled in this order:

1. `/api/v1/*` routes
2. `/api/auth/*` routes; only `POST sign-in/email`, `POST sign-out`, and
   `GET get-session` reach Better Auth, and every other provider path returns
   `404`
3. `/health/*` routes
4. `/admin/*`, which serves compiled files and falls back to `index.html` for
   extensionless client routes

Unknown `/api` paths return the API `404` envelope. They never return an admin
asset.

## Media

R2 objects are written by the native binding, without an S3 client. Each write
is capped at the 10 MiB media limit, and every call has a bounded timeout. Any
binding error surfaces as one sanitized storage failure. Uploaded images are
verified by a runtime-neutral structural inspector for JPEG, PNG, GIF, WebP,
and AVIF. The inspector rejects malformed or trailing data and reports displayed
(orientation-applied) dimensions, matching the Node sharp inspector.

## Outbox recovery

A cron trigger (`* * * * *`) runs a scheduled invocation every minute. Each
invocation claims at most one site-build event, checks at most five tracked
Pages deployments, and claims at most five media-deletion events through the
shared 60-second leases and retry policy. That bound keeps one
invocation within D1's 50-query free-plan budget. Work left unfinished when a
Worker terminates is reclaimed after its lease expires.

Successful publication, entry deletion, media deletion or retry, and build
requests also register a best-effort `waitUntil` pass. The pass processes media
deletions immediately and a build after the 5-second debounce. Its failures are
logged and swallowed. The pass is never the only recovery path: the scheduled
invocation remains authoritative.

## Build export on Workers

`GET /api/v1/public/build-export` is paged so that every request stays within
per-invocation limits regardless of site size. Each page request, including
build-token verification, uses at most two D1 batches with at most ten read
statements, well inside the 50-query free-plan budget, and a page holds at
most 100 entries or about 4 MB of stored entry JSON. Staying within the Free
plan's 10 ms CPU limit is best effort: typical pages fit, but one maximal
entry can exceed it on its own page. Site builds use `@lacecms/sdk`, which
follows the page cursors; see [compatibility](compatibility.md) for raw
readers.

## Deploy hook

When `LACE_DEPLOY_HOOK_URL` is set, each claimed site-build event sends one
bodiless `POST` to that URL, typically a Cloudflare Pages or Workers Builds
deploy hook. The URL is the credential, so store it only with
`wrangler secret put LACE_DEPLOY_HOOK_URL`. It never appears in logs, errors,
or build records. The call does not follow redirects, is aborted after
`LACE_DEPLOY_HOOK_TIMEOUT_MS`, and reads at most 16 KiB of the response.

| Hook response | Recorded outcome |
| --- | --- |
| 2xx with a Cloudflare envelope `result.id`, Pages tracking configured | Build stays `running` and is tracked (below) |
| 2xx with a Cloudflare envelope `result.id`, no tracking | Build `accepted`, with that provider deployment ID |
| 2xx without a usable ID | Build `accepted`, without a provider ID (never tracked) |
| 2xx with `success: false`, redirect, or other 4xx | Retryable failure, `provider_failed` |
| `408`, `425`, `429`, 5xx, network error, or timeout | Retryable failure, `trigger_unavailable` |

Failures follow the normal eight-attempt retry policy. While the hook call is
in progress the build is `running`. Without Pages tracking, `accepted` is a
final status that means only that the provider took the request; it never
proves the site was published (only `succeeded` does). Use the recorded
provider ID to find the deployment in the Cloudflare dashboard, and retry an
`accepted` build from Admin if the deployment failed.

## Pages deployment tracking

With `LACE_PAGES_ACCOUNT_ID`, `LACE_PAGES_PROJECT_NAME` and the secret
`LACE_PAGES_API_TOKEN`, every identified hook acceptance stays `running` and
each scheduled run reads exactly that deployment
(`GET /accounts/{account}/pages/projects/{project}/deployments/{id}`). The
Worker never uses the D1 operator token for this. The token, the hook URL and Pages response
bodies (which contain environment variables) are never stored, logged or
returned; Builds shows only the closed stage, the last check time and a reason.

| Pages deployment | Build |
| --- | --- |
| `deploy` stage `success` | `succeeded` |
| `build` stage `failure` | `failed`, `provider_build_failed` |
| `deploy` stage `failure` | `failed`, `provider_deploy_failed` |
| another stage `failure` | `failed`, `provider_failed` |
| `canceled` | `cancelled`, `provider_cancelled` |
| `skipped` or `is_skipped` | `cancelled`, `provider_skipped` |
| `idle`, `active`, or `success` before `deploy` | stays `running`; stage recorded, checked again after 30 s |
| `401` or `403` | `unknown`, `tracking_forbidden` |
| `404` more than 5 minutes after acceptance | `unknown`, `tracking_not_found` |
| other 4xx or redirect | `unknown`, `tracking_rejected` |
| `408`, `425`, `429`, 5xx, network error, timeout, unexpected body | retried with backoff (30 s growing to 10 min) |
| no outcome by the deadline (`LACE_PAGES_TRACKING_TIMEOUT_MINUTES`, default 60) | `unknown`, `tracking_timeout` |
| tracking settings removed while tracked | `unknown`, `tracking_unconfigured` |

The deadline counts from the hook acceptance, so no build stays `running`
longer than the configured timeout plus one cron interval, even when the Pages
API, the token or the Worker misbehaves. Tracking state lives in `site_builds`
(a 60-second check lease, the stage, last check and next check) and never uses
the outbox retry budget, so Worker restarts lose nothing. Checks are matched to
the exact build and deployment ID: parallel builds, repeats and late results
never change another build, and a terminal status is never reopened.
`unknown`, `cancelled` and `failed` builds can be retried from Admin.

A generic deploy hook without Pages tracking stays honestly `accepted`; an
authenticated CI callback is deliberately not offered (a callback after
`pnpm build` cannot prove publication).

The real-account deployment procedure, including the Pages Git integration, is
in [cloudflare-deployment-handoff.md](cloudflare-deployment-handoff.md).

## Local development

```bash
pnpm dev:cloudflare
```

This builds the Worker's workspace packages, then applies local D1 migrations
and synchronizes `lace.config.ts` into local D1. While first-admin setup is
still open, it prints a one-time setup token. It then starts:

- `wrangler dev` in local mode (workerd), with local-only D1 and R2 and the
  test-scheduled endpoint
- the admin Vite server
- the Astro dev server

All three sit behind one gateway at `http://127.0.0.1:8787`:

| Path | Destination |
| --- | --- |
| `/api/*`, `/health/*`, `/__scheduled` | Worker (internal port 8788) |
| `/admin/*` | Admin Vite server (port 5173) |
| everything else | Astro dev server (port 4321) |

Admin, API, and auth therefore share one origin. The Worker runs in
`development` mode, so session cookies are not `Secure`. Email uses the `log`
provider: messages, including any account links, are printed in the Worker
output and never sent. Pass `-- --kv` to add a
local `CACHE` KV binding. Visit
`http://127.0.0.1:8787/__scheduled?cron=*+*+*+*+*` to run a scheduled recovery
pass immediately. The site uses fixture data unless you set
`LACE_SITE_DATA_MODE=live` and `LACE_BUILD_TOKEN`.

State lives in the git-ignored `dev-data/cloudflare/` directory:

- `state/`: persisted D1 and R2 data
- `.dev.vars`: the generated local `LACE_AUTH_SECRET`, mode `0600`, reused on
  every run
- `wrangler.dev.json`: the generated development configuration. The
  checked-in `wrangler.jsonc` is never modified.

Stop the stack with Ctrl-C. Delete `dev-data/cloudflare/` to start from an
empty database.

## D1 migrations

Migrations are an explicit deployment step. Build the workspace CLI and its
dependencies first with `pnpm exec turbo run build --filter=@lacecms/cli...`.
The command delegates to that built CLI and refuses to run without exactly one
target:

```bash
pnpm db:migrate:cloudflare -- --local
```

```bash
pnpm db:migrate:cloudflare -- --remote
```

- `--local` applies `packages/db/drizzle` to `dev-data/cloudflare/state`, or
  to the directory given with `--persist-to <dir>`. Stop `pnpm dev:cloudflare`
  first.
- `--remote` refuses the placeholder `database_id` in `wrangler.jsonc`. Set
  the real ID from `wrangler d1 list` first. Outside CI, you must type the D1
  database name at the prompt, and a non-interactive shell is refused. With
  `CI` set, the command runs without prompting.

The baseline migration creates the `invitations` and `password_reset_tokens`
tables. Deploy the API and admin assets together. Invitation acceptance and reset confirmation are
single atomic D1 batches, so concurrent uses of one token succeed at most once.

## Verification

- `pnpm --filter @lacecms/platform-cloudflare test` runs the adapters,
  including the shared repository and security contract suites, against local
  D1, R2, and KV through Miniflare. It also covers the composed Worker handlers.
- `pnpm --filter @lacecms/app-api test` bundles the Worker with a Wrangler
  dry-run, checks that the bundle contains no Node SQLite, S3, sharp, or
  filesystem module, and serves health and Better Auth routes from the bundle
  under workerd.
- The same package's smoke test runs that bundle under workerd. It migrates D1
  with `db:migrate:cloudflare --local`, prepares it with the local helper, and
  intercepts the deploy hook. It covers health, setup and sign-in, an R2
  upload, publication, scheduled dispatch recording the provider ID,
  authenticated build export, and static admin fallback. It also invites a
  user with the copy-once link fallback, accepts the invitation, signs in as
  the invitee, lists sessions, and checks that reset requests return `202`.
- Root tests cover migration target parsing, remote confirmation, the
  development configuration, and gateway routing.

## Local operations evidence

See [owner checks on real infrastructure](verification.md#owner-checks-on-real-infrastructure) for deployment, restore, rotation and provider evidence beyond local verification.

## Optional content assistant

The public guide is
[Connect an AI assistant](../apps/docs/src/content/docs/en/latest/operations/mcp.md);
shared implementation notes are in [Node API runtime](node-api.md#optional-content-assistant).

OAuth maintenance rotates three bounded cleanup phases across minute invocations,
using at most three D1 statements per run so existing dispatch work retains the
50-query budget. Revocation and abort of expired pending issuances share one
atomic phase; dependency rows are removed before parent records. Credential
expiry and revocation are enforced on every request without waiting for cleanup.
