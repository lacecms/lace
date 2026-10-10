# Cloudflare Worker runtime

The Cloudflare composition runs the same portable API as the
[Node runtime](node-api.md). It uses D1 for SQL data, a native R2 binding for
media, and the Workers static-assets binding for the built admin. Everything is
wired in `@lacecms/platform-cloudflare` (`createCloudflareWorker`). The
deployable entry is [`apps/api/worker/index.ts`](../apps/api/worker/index.ts),
configured by [`apps/api/wrangler.jsonc`](../apps/api/wrangler.jsonc).

The entry statically imports the repository-root `lace.config.ts`, so the
normalized configuration is bundled into the Worker. No request can select or
evaluate a configuration module.

Build dispatch calls the configured [deploy hook](#deploy-hook). Without one,
it records the same sanitized `trigger_unavailable` failure that an
unconfigured Node deployment records.

## Bindings and variables

| Name | Kind | Required | Meaning |
| --- | --- | --- | --- |
| `DB` | D1 binding | yes | Authoritative SQL data, migrated from `packages/db/drizzle`. |
| `MEDIA` | R2 binding | yes | Private media bucket; objects are keyed `media/<id>`. |
| `ASSETS` | static assets | no | Built admin files served under `/admin/`. |
| `CACHE` | KV binding | no | Opt-in derived cache. Absent means no-op; misses and failures never change results. |
| `LACE_PUBLIC_BASE_URL` | variable | yes | Canonical absolute HTTP(S) base URL. It is the only source for public media URLs. |
| `LACE_AUTH_SECRET` | secret | yes | Better Auth and rate-limit HMAC secret. |
| `LACE_DEPLOY_HOOK_URL` | secret | no | HTTPS deploy-hook URL that rebuilds the static site. |
| `LACE_DEPLOY_HOOK_TIMEOUT_MS` | variable | no | Deploy-hook call timeout from 1 to 60000 ms; defaults to 10000. |
| `LACE_ENVIRONMENT` | variable | no | `production` (default, `Secure` cookies) or `development`. |
| `LACE_PAGES_ACCOUNT_ID` | variable | no¹ | Cloudflare account ID (32 hex characters) of the Pages project. |
| `LACE_PAGES_PROJECT_NAME` | variable | no¹ | Pages project whose deploy hook is `LACE_DEPLOY_HOOK_URL`. |
| `LACE_PAGES_API_TOKEN` | secret | no¹ | Separate API token with only *Account · Cloudflare Pages · Read*; never the D1 operator token. |
| `LACE_PAGES_TRACKING_TIMEOUT_MINUTES` | variable | no | Overall tracking deadline per build, 5–1440 minutes; defaults to 60. |
| `LACE_PAGES_API_BASE_URL` | variable | no | Development only: HTTPS or loopback HTTP stub of the Cloudflare API, ending in `/`. Invalid in production. |
| `LACE_R2_TIMEOUT_MS` | variable | no | Per-operation R2 timeout from 1 to 60000 ms; defaults to 10000. |
| `EMAIL` | send_email binding | with `cloudflare` | Cloudflare Email Service binding; requires Workers Paid and an onboarded sending domain. |
| `LACE_EMAIL_PROVIDER` | variable | no | `none` (default), `resend`, `cloudflare`, or `log` (development only). `smtp` is Node-only. |
| `LACE_EMAIL_FROM` | variable | with a provider | Sender as `address` or `Display Name <address>`. |
| `LACE_EMAIL_TIMEOUT_MS` | variable | no | Per-send timeout from 1 to 60000 ms; defaults to 10000. |
| `LACE_RESEND_API_KEY` | secret | with `resend` | Resend API key; works on Workers Free. |
| `LACE_RESEND_API_BASE_URL` | variable | no | Test-only endpoint override; HTTPS outside development. |

¹ Pages tracking is enabled only when all three are set; setting some of them is
a validation error.

Email is optional. Resend is the recommended Worker provider: it works on the
Workers Free plan over HTTPS. The `cloudflare` provider uses the Email Service
`send_email` binding, which can reach arbitrary recipients only on Workers Paid
after the sending domain is onboarded; binding errors map to the same closed
reasons as every other provider.

The sender also delivers invitations, password-reset links, and
password-changed notices (see
[Authentication operations](auth-operations.md#invitations)). Public reset
emails and password-changed notices run after the response through the
request's `executionCtx.waitUntil`, so delivery never delays the request.
Without a working provider, invitation and administrator reset responses carry
their link once. Local `pnpm dev:cloudflare` uses the `log` provider, so those
links appear in the Worker output.

Set secrets with `wrangler secret put`, never through `vars`. When bindings or
variables are invalid, every request receives a sanitized `503` envelope. The
Worker logs only the names of the affected bindings or variables, never their
values.

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
verified by a runtime-neutral structural inspector for JPEG, PNG, WebP, and
AVIF. The inspector rejects malformed or trailing data and reports displayed
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
`accepted` build from Admin if the deployment failed. Databases migrated from
earlier alphas record former `running` hook builds, and hook `succeeded`
builds without a provider ID, as `accepted`.

## Pages deployment tracking

With `LACE_PAGES_ACCOUNT_ID`, `LACE_PAGES_PROJECT_NAME` and the secret
`LACE_PAGES_API_TOKEN`, every identified hook acceptance stays `running` and
each scheduled run reads exactly that deployment
(`GET /accounts/{account}/pages/projects/{project}/deployments/{id}`). Create
a dedicated token with only *Account · Cloudflare Pages · Read*; the Worker
never uses the D1 operator token. The token, the hook URL and Pages response
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

Cloudflare Pages offers deploy hooks only for projects connected to Git. A
project deployed by direct upload (`wrangler pages deploy`) has no hook. The
real-account deployment procedure, including the Pages Git integration, is in
[cloudflare-deployment-handoff.md](cloudflare-deployment-handoff.md).

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

Migrations are an explicit deployment step. The command refuses to run
without exactly one target:

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

Migration `0004_account_tokens` adds the `invitations` and
`password_reset_tokens` tables. It is additive; back up D1 (or record a Time
Travel restore point), apply it remotely before deploying a Worker with
invitations, and deploy the API and admin assets together because `POST
/api/v1/admin/users` is gone. Invitation acceptance and reset confirmation are
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

See [34C local operations verification](local-operations-verification.md) for coordinated database/object restore, credential rotation, health/log interpretation and the running CMS version in administrator Settings. Remote deployment, D1 capacity/restore and provider permissions remain owner checks; local evidence does not close them.
