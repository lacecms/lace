# Node API runtime

The Node composition uses SQLite, Better Auth, and a private MinIO bucket. It
checks that the configured bucket exists before binding the listener.

## Prerequisites

For the supported full local browser stack, follow the root
[README](../README.md). `pnpm dev:node` owns the Compose lifecycle: it applies
already-committed migrations before the API becomes ready and does not run
configuration synchronization. Synchronization remains an intentional operator
operation, not a readiness side effect.

## Environment

| Variable | Required | Meaning |
| --- | --- | --- |
| `LACE_DATABASE_PATH` | yes | Non-empty SQLite database path. |
| `LACE_PUBLIC_BASE_URL` | yes | Canonical absolute HTTP(S) base URL, with no credentials, query, or fragment. It is the only source for public media URLs. |
| `LACE_AUTH_SECRET` | yes | Better Auth secret; startup diagnostics never include its value. |
| `LACE_MINIO_ENDPOINT` | yes | Absolute HTTP(S) MinIO endpoint with no credentials, query, fragment, or path. |
| `LACE_MINIO_BUCKET` | yes | Existing private bucket for verified media objects. |
| `LACE_MINIO_REGION` | yes | S3-compatible region identifier. |
| `LACE_MINIO_ACCESS_KEY` | yes | MinIO/S3 access key; never logged. |
| `LACE_MINIO_SECRET_KEY` | yes | MinIO/S3 secret key; never logged. |
| `LACE_MINIO_TIMEOUT_MS` | yes | Positive per-operation timeout, capped at 60 seconds. |
| `LACE_HOST` | no | Listener host; defaults to `127.0.0.1`. |
| `LACE_PORT` | no | Listener port from `1` to `65535`; defaults to `3000`. |
| `LACE_ADMIN_DEV_ORIGIN` | no | Absolute origin for the Admin development server. The Docker topology uses `http://admin:5173`. |
| `LACE_SITE_DEV_ORIGIN` | no | Absolute origin for the Astro development server. The Docker topology uses `http://site:4321`. |

Startup errors identify invalid variable names, never their values. The runtime
does not derive public URLs from `Host`, `Forwarded`, or `X-Forwarded-*`
headers.

### Email delivery

Email is optional. Without `LACE_EMAIL_PROVIDER` the API starts with delivery
reported as not configured, and Settings offers no test action.

| Variable | Required | Meaning |
| --- | --- | --- |
| `LACE_EMAIL_PROVIDER` | no | `none` (default), `smtp`, `resend`, or `log`. `log` is refused when `NODE_ENV=production`; `cloudflare` is Worker-only. |
| `LACE_EMAIL_FROM` | with a provider | Sender as `address` or `Display Name <address>`. |
| `LACE_EMAIL_TIMEOUT_MS` | no | Per-send timeout from 1 to 60000 ms; defaults to 10000. |
| `LACE_SMTP_HOST` | with `smtp` | SMTP server host name. |
| `LACE_SMTP_PORT` | no | Defaults to `587`. |
| `LACE_SMTP_SECURITY` | no | `starttls` (default; refuses servers without STARTTLS), `tls` (implicit TLS, usually port 465), or `none` (development only). |
| `LACE_SMTP_USER`, `LACE_SMTP_PASSWORD` | no | Supplied together or not at all; the password is never logged. |
| `LACE_RESEND_API_KEY` | with `resend` | Resend API key; never logged. |
| `LACE_RESEND_API_BASE_URL` | no | Test-only endpoint override; HTTPS outside development. |

Every send reports `sent` (accepted by the provider) or `failed` with
`not_configured`, `invalid_message`, `rejected`, `rate_limited`, or
`unavailable`. Failures are logged as `{ "component": "email", "provider",
"reason" }` without recipients, subjects, or provider text. Administrators use
Settings → Email delivery → Send test email to check the configuration; the
message always goes to their own account address and is limited to five
requests per hour.

The same sender delivers invitations, password-reset links, and
password-changed notices. Without a working provider, invitation and
administrator reset responses carry their link once instead (see
[Authentication operations](auth-operations.md#invitations)); public reset
requests still answer `202` and send nothing. Public reset emails and
password-changed notices are scheduled after the response with a caught
promise, so a slow provider never delays the request, and their failures are
logged with the same sanitized fields. Links are built from
`LACE_PUBLIC_BASE_URL`, never from request headers.

### Accounts and migration `0004`

Invitations, password resets, and account self-service use the Lace routes
listed in [Authentication operations](auth-operations.md#invitations) and
migration `0004_account_tokens`. Run `pnpm db:migrate:node` (or let the local
migration role apply it) before starting the new API, and deploy the API and
admin together: `POST /api/v1/admin/users` no longer exists. Only Better
Auth's sign-in, sign-out, and get-session routes are forwarded; every other
`/api/auth/*` path returns `404`.

## Local development

`pnpm dev:node` starts all six development roles: private MinIO, its bucket
initializer, a migration job, the Node gateway, Admin Vite, and Astro. It is
the only supported local start command; do not manually start an API process,
frontend process, or MinIO service alongside it.

The browser uses `http://127.0.0.1:3000` by default. `/api/*` and `/health/*`
stay local to Node; `/admin/*` reaches Vite and all other frontend paths reach
Astro through the same origin. Upgrade connections used by the frontend
development servers are forwarded to their selected upstream. If a frontend
upstream is unavailable, the gateway returns a sanitized `502` response.

Outgoing email is captured by a local Mailpit service: the API uses the `smtp`
provider against `mailpit:1025` with development-only plaintext transport, and
the inbox is at `http://127.0.0.1:8025/` (`LACE_MAILPIT_PORT` changes the
port). No message leaves the machine and no real credentials are involved.
Invitation and password-reset emails therefore appear in Mailpit, and their
links open the local admin.

The full local environment list is in [`.env.example`](../.env.example); use
`pnpm dev:env` rather than placing credentials in shell history. MinIO remains
inside the Compose network, and its persistent data is preserved unless the
explicit root reset is requested.

Astro starts in fixture mode for bootstrap. After an administrator creates a
read-only build credential in `/admin/settings` and publishes
the `home` page, set `LACE_SITE_DATA_MODE=live` and `LACE_BUILD_TOKEN` in the
ignored `.env` and restart the stack. The site process uses
`LACE_API_BASE_URL=http://api:3000` inside Compose to read the export, while
`LACE_PUBLIC_BASE_URL` supplies browser-reachable media URLs. The token is not
available to browser code. See the [README](../README.md#show-published-content-on-the-local-site)
for the Settings token flow and refresh commands. A draft save alone does not
change the site; restart Astro after publication to refresh cached routes and
content. The local stack does not yet schedule site-build dispatch; Step 21C
adds its separate recovery process.

For an isolated local product acceptance run, use `pnpm acceptance:start`,
`pnpm --filter @lacecms/app-admin test:acceptance`, and
`pnpm acceptance:stop`. The first command applies committed migrations and
explicitly synchronizes code-owned models in separate SQLite and MinIO volumes;
the browser check uses Admin for page and collection editing, media reuse,
publication, and Settings token issuance. It refreshes Astro in live mode,
checks the published routes and later-draft isolation, invites the editor and
viewer and accepts both invitations from the links in the acceptance stack's
Mailpit, and checks editor/viewer affordances. See the [README](../README.md#local-product-acceptance-session-15c)
for the exact browser observations, manual variant, prerequisites, and cleanup.

## Editing content models

The repository-root [`lace.config.ts`](../lace.config.ts) is the editable source
of content structure. Its `definePage` and `defineCollection` calls use the
typed `@lacecms/config` API; `field` and `builtInBlocks` come from
`@lacecms/content`. The examples define singleton `home` (`/`) and `about`
(`/about`) pages plus `posts` (`/blog/:slug`) and `notes` (`/notes/:slug`)
collections. A new page needs a stable lowercase
kebab-case `key`, positive integer `version`, fixed canonical `path`, and any
fields or allowed blocks. A collection uses a canonical `route` with exactly
one `:slug` segment instead of `path`. All allowed block keys must be listed
in the config's registered block definitions.

Choose the site presentation alongside the model definition. Public block
styling hooks and the site-owned stylesheet are documented in
[`site-styling.md`](site-styling.md). The current `home` route is
[`apps/site/src/pages/index.astro`](../apps/site/src/pages/index.astro)
and `posts` uses
[`apps/site/src/pages/blog/[slug].astro`](../apps/site/src/pages/blog/[slug].astro).
The additional examples use
[`apps/site/src/pages/about/[...slug].astro`](../apps/site/src/pages/about/[...slug].astro)
and
[`apps/site/src/pages/notes/[slug].astro`](../apps/site/src/pages/notes/[slug].astro).
The `about` route uses `getStaticPaths()` so it emits no static page before
publication. Further pages and collections need matching Astro route files;
collections use `getStaticPaths()`. The existing routes read entries from the
published-site loader in [`src/lib/lace.ts`](../apps/site/src/lib/lace.ts)
(`byPath`, `entries`, `bySlug`) and render ordered blocks with
`<LaceBlocks>` from `@lacecms/astro` and the block map
[`src/lace/blocks.ts`](../apps/site/src/lace/blocks.ts). Lace validates route definitions; it does not create
Astro files or choose a layout. The reference site reads the committed fixture
until live mode is configured; live mode reads locally published content.

To add a model, register a `definePage` or `defineCollection` call in
`lace.config.ts`. Start a new model at `version: 1`; choose a unique key and
path or route, then list its allowed blocks. `notes` demonstrates an optional
text field with `fields: { summary: field.text() }`. Add further fields using
typed `field` descriptors and render any field intended for public display in
the Astro route. To add a block type, register its definition in the root
`blocks` list, allow its key in the model, add its component to
`apps/site/src/components/lace/`, and map its definition to that component in
`apps/site/src/lace/blocks.ts`. A published block without a mapped component fails
the build with its model, entry, and block keys.

Keep a model key stable once it has stored content. Increase `version` when a
field, allowed block, path, route, or other structural definition changes. A
display-only label or description change does not require a bump; a
structural change with stored snapshots can still be rejected by the sync
planner. To deliberately rename a key, set `renamedFrom` to its old key while
introducing the new key and increased version. The hint is temporary and
requires the former stored key to exist; Lace never infers a rename from a
removal and addition. A changed route alone does not rename a model.

After editing the config, restart the development API through the supported
stack lifecycle:

```sh
pnpm dev:stop
pnpm dev:node
```

The API imports and normalizes the file once before listening. A missing,
unloadable, or invalid file fails startup. Neither a browser request nor an
environment value selects a different TypeScript file. Restarting and running
SQLite migrations do not synchronize models or create page drafts. With the
stack running, use `pnpm content:sync --check` to print a read-only plan. Its
exit status is zero only when the plan is valid and there is no pending work;
pending or invalid plans exit non-zero. Run `pnpm content:sync` to print the
plan and apply valid changes. A newly synchronized page has one incomplete
draft ready for editing; a new collection has no entries until an editor
creates one in Admin or through the API. Open `/admin/content` after sync to
find the page editor or collection list.

For a repeatable content check, synchronize the included `about` and `notes`
examples. In `/admin/content`, edit the `About` draft and create a `Notes`
entry with a title and lowercase slug such as `first-note`. Add a supported
block to each and save. Before publication, check
`GET /api/v1/public/pages/about` and
`GET /api/v1/public/collections/notes/first-note`: draft content is absent.
Publish both entries in Admin, then check those endpoints and
`GET /api/v1/public/build-export` with the read-only build token. Configure
live site mode as in the root README, restart the stack, and open `/about`
and `/notes/first-note` in a browser. Their content must match the published
API output. Save a later draft title or slug without publishing, restart the
site again, and verify the previous published API values and public pages
remain visible. The new draft is visible only in Admin. This sequence reads
local SQLite through the live export; it does not edit the committed fixture.

An invalid plan names the affected model and reason. Stored snapshots can
block structural changes even after a version increase; correct the config
instead of resetting SQLite unless discarding local data is intentional. A
stale-plan message means the persisted models changed between planning and
apply; rerun the command to review the current plan. The command never syncs
automatically during startup or migration, and it operates only on the fixed
root project config and local Compose SQLite volume.

`GET /health/live` only confirms that the HTTP process is serving. `GET
/health/ready` performs one local SQLite `SELECT 1`; bucket reachability is
checked once before startup, not on every readiness request.

## Recoverable media deletion

`DELETE /api/v1/admin/media/:mediaId` only marks an unreferenced active item as
`deleting` and returns `202 Accepted`. After the MinIO startup preflight, the
Node process runs one non-overlapping background pass per second for
`media.delete.requested` work. Each claim has a 60-second lease; a restart or
crash leaves unfinished work available for recovery after that lease expires.

Storage failures retry at most eight times with full-jitter exponential backoff
(one-second base, fifteen-minute cap). The final failure leaves metadata in
`delete_failed` with an internal sanitized diagnostic; it never exposes bucket
details, storage keys, credentials, or raw SDK errors in media JSON. An actor
with `media:write` can request a fresh asynchronous attempt with:

```text
POST /api/v1/admin/media/:mediaId/retry-deletion
```

The retry is accepted only for an unreferenced `delete_failed` item. It clears
the prior internal diagnostic, returns `202 Accepted`, and never performs object
deletion in the HTTP request. A successful or already-absent object deletion is
followed by an atomic removal of its still-unreferenced `deleting` metadata.

## Current boundaries

The cache always misses. Publication writes a coalesced site-build event in the
same transaction as the new public version and returns `build: { "status":
"queued", "targetVersion": N }`; an idempotent replay returns
`not-dispatched`. It does not call a builder in the request. The Node runtime
exposes one callable `buildDispatcher.runOnce()` pass with a 5-second debounce,
60-second lease, and full-jitter retries starting at 5 seconds (15-minute cap,
8 total attempts). A claimed event creates a `site_builds` row. The current
placeholder trigger records a sanitized `trigger_unavailable` retry; Step 21B
supplies the fixed-command builder and Step 21C supplies the independent
recovery loop and Builds UI.

Administrators can enqueue a build with `POST /api/v1/admin/builds` or retry a
failed build with `POST /api/v1/admin/builds/:buildId/retry`. Both accept an empty
JSON object (or no body), reject unknown keys, and return `202 Accepted` with
`{ "eventId": "...", "targetVersion": N, "coalesced": false }`. Retry targets
the current published version even when the failed build targeted an older one.
Editors, viewers, and anonymous callers cannot enqueue either action. These
routes never accept a command, path, environment variable, or arbitrary builder
argument.

The Node runtime streams verified MinIO media through authenticated previews
and stable published-media URLs. The test actor is a Vitest-only adapter and is
never enabled by a request header, query string, or production environment
variable.

## Local operations evidence

See [34C local operations verification](local-operations-verification.md) for coordinated database/object restore, credential rotation, health/log interpretation and the running CMS version in administrator Settings. Remote deployment, D1 capacity/restore and provider permissions remain owner checks; local evidence does not close them.
