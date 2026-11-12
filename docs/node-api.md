# Node API runtime

Internal note on the Node composition: its runtime boundaries, the engine
repository's local stack and the background work it runs. Operator setup,
uploads, caches, email, proxy trust and upgrades are public:
[Deploy on Docker or a VPS](../apps/docs/src/content/docs/en/latest/deployment/node.md).
Every runtime setting is listed in
[CLI and environment](../apps/docs/src/content/docs/en/latest/reference/cli-environment.md).

The Node composition uses SQLite, Better Auth and a private MinIO bucket. It
checks that the configured bucket exists before binding the listener.
Startup errors name invalid variables, never their values. The runtime never
derives public URLs from `Host`, `Forwarded` or `X-Forwarded-*`;
`LACE_PUBLIC_BASE_URL` is the only source for public media and account links.

`GET /health/live` only confirms that the HTTP process is serving.
`GET /health/ready` performs one local SQLite `SELECT 1` against the migration
ledger; bucket reachability is checked once before startup, not on every
readiness request.

## Engine repository local stack

For the full local browser stack, follow [DEVELOPMENT.md](../DEVELOPMENT.md).
`pnpm dev:node` owns the Compose lifecycle and starts six roles: private MinIO,
its bucket initializer, a migration job, the Node gateway, Admin Vite and
Astro. It applies already-committed migrations before the API becomes ready and
never runs configuration synchronization. It is the only supported local start
command; do not start an API, frontend or MinIO process alongside it.

The browser uses `http://127.0.0.1:3000`. `/api/*` and `/health/*` stay local
to Node; `/admin/*` reaches Vite and every other path reaches Astro through the
same origin. Upgrade connections of the frontend development servers are
forwarded to their upstream; an unavailable upstream returns a sanitized `502`.

Outgoing email goes to a local Mailpit service: the API uses the `smtp`
provider against `mailpit:1025` with development-only plaintext transport, and
the inbox is at `http://127.0.0.1:8025/` (`LACE_MAILPIT_PORT` changes the
port). Invitation and password-reset links therefore appear in Mailpit and
open the local Admin. The full local environment list is in
[`.env.example`](../.env.example); use `pnpm dev:env` rather than placing
credentials in shell history.

Astro starts in fixture mode. After an administrator issues a read-only build
token and publishes `home`, set `LACE_SITE_DATA_MODE=live` and
`LACE_BUILD_TOKEN` in the ignored `.env` and restart the stack. The site reads
the export through `LACE_API_BASE_URL=http://api:3000` inside Compose while
`LACE_PUBLIC_BASE_URL` supplies browser-reachable media URLs. See
[DEVELOPMENT.md](../DEVELOPMENT.md#show-published-content-on-the-local-site).

For isolated acceptance use `pnpm acceptance:start`,
`pnpm --filter @lacecms/app-admin test:acceptance` and `pnpm acceptance:stop`;
[DEVELOPMENT.md](../DEVELOPMENT.md#local-product-acceptance) lists the browser
observations and cleanup.

## Editing content models

The repository-root [`lace.config.ts`](../lace.config.ts) drives the engine's
reference site. It defines singleton `home` (`/`) and `about` (`/about`) pages
and `posts` (`/blog/:slug`) and `notes` (`/notes/:slug`) collections; modeling
rules are public in
[content modeling](../apps/docs/src/content/docs/en/latest/content-modeling/index.md).
Their routes are
[`apps/site/src/pages/index.astro`](../apps/site/src/pages/index.astro),
[`apps/site/src/pages/blog/[slug].astro`](../apps/site/src/pages/blog/[slug].astro),
[`apps/site/src/pages/about/index.astro`](../apps/site/src/pages/about/index.astro)
and
[`apps/site/src/pages/notes/[slug].astro`](../apps/site/src/pages/notes/[slug].astro);
they read [`src/lib/lace.ts`](../apps/site/src/lib/lace.ts) and render with
the block map [`src/lace/blocks.ts`](../apps/site/src/lace/blocks.ts). The
reference stylesheet is
[`apps/site/src/styles/site.css`](../apps/site/src/styles/site.css), which
follows the public
[styling contract](../apps/docs/src/content/docs/en/latest/astro-integration/styling.md).

The API imports and normalizes the root config once before listening; a
missing, unloadable or invalid file fails startup, and no request or
environment value selects another file. After editing it, run `pnpm dev:stop`
and `pnpm dev:node`. Restarting and migrating never synchronize models: run
`pnpm content:sync --check` and `pnpm content:sync`, which execute the built
CLI inside the API container against the same database.

To check the draft/published boundary repeatably, synchronize the `about` and
`notes` examples, edit the About draft and create a Notes entry with slug
`first-note`, and confirm `GET /api/v1/public/pages/about` and
`GET /api/v1/public/collections/notes/first-note` omit the drafts. Publish
both, confirm those endpoints and the paged `GET /api/v1/public/build-export`
(follow `nextCursor` through `?after=`), switch Astro to live mode and open
`/about` and `/notes/first-note`. A later unpublished draft must leave the API
and pages unchanged until the next publication.

## Email delivery boundary

Every send reports `sent` (accepted by the provider) or `failed` with
`not_configured`, `invalid_message`, `rejected`, `rate_limited` or
`unavailable`. Failures are logged as `{ "component": "email", "provider",
"reason" }` without recipients, subjects or provider text. The `log` provider
is refused when `NODE_ENV=production`. The Settings test message always goes
to the administrator's own address and is limited to five requests per hour.

Invitations, password-reset links and password-changed notices use the same
sender. Without a working provider, invitation and administrator reset
responses carry their link once (see
[Authentication operations](auth-operations.md#invitations)); public reset
requests still answer `202` and send nothing. Public reset emails and
password-changed notices are scheduled after the response with a caught
promise, so a slow provider never delays the request; their failures use the
same sanitized log fields. Links are built from `LACE_PUBLIC_BASE_URL`.

Only Better Auth's sign-in, sign-out and get-session routes are forwarded;
every other `/api/auth/*` path returns `404` unless MCP enables its OAuth
routes. Deploy the API and Admin together.

## Build dispatch

Publication writes a coalesced site-build event in the same transaction as the
new public version and returns `build: { "status": "queued", "targetVersion": N }`;
an idempotent replay returns `not-dispatched`. No builder is called in the
request. The dispatcher claims events with a 5-second debounce and a 60-second
lease and retries with full jitter from 5 seconds up to 15 minutes, eight
attempts in total; a claimed event creates a `site_builds` row and triggers
the configured fixed-command builder. Enqueue and retry routes accept no
command, path, environment or builder argument; retry targets the current
published version even when the failed build targeted an older one.

## Recoverable media deletion

`DELETE /api/v1/admin/media/:mediaId` only marks an unreferenced active item as
`deleting` and returns `202 Accepted`. After the MinIO startup preflight, the
Node process runs one non-overlapping background pass per second for
`media.delete.requested` work. Each claim has a 60-second lease; a restart or
crash leaves unfinished work recoverable after the lease expires.

Storage failures retry at most eight times with full-jitter exponential backoff
(one-second base, fifteen-minute cap). The final failure leaves the item
`delete_failed` with an internal sanitized diagnostic that never exposes
bucket details, storage keys, credentials or raw SDK errors. `POST
/api/v1/admin/media/:mediaId/retry-deletion` accepts only an unreferenced
`delete_failed` item, clears the diagnostic and returns `202 Accepted` without
deleting in the request. A successful or already-absent object deletion is
followed by an atomic removal of the still-unreferenced metadata.

## Media metadata

Media carry optional `alt` text (at most 1,000 characters), a `caption` (at
most 2,000 characters, line breaks allowed) and a `focalPoint` `{x, y}` with
both coordinates from 0 to 1. `GET /api/v1/admin/media/:mediaId` returns an
`ETag` holding the item's `updatedAt` in quoted Unix milliseconds, and
`PATCH /api/v1/admin/media/:mediaId` requires it as a strong `If-Match`:

```text
PATCH /api/v1/admin/media/:mediaId
If-Match: "1791647444998"
Content-Type: application/json

{ "alt": "Red bicycle", "caption": null, "focalPoint": { "x": 0.5, "y": 0.3 } }
```

An omitted key stays unchanged; `null` or text that is empty after trimming
clears it. The body must contain at least one known key. Control characters
other than caption line breaks are refused. The response is
`{ "media": {...}, "build": {...} }` with a new `ETag`. When a current
publication uses the item, the same transaction advances the published version
and queues a coalesced build with reason `media_metadata`; otherwise `build` is
`not-dispatched`. A request that changes nothing writes nothing.

A missing, weak, `*` or malformed `If-Match` and an invalid body return
`422 VALIDATION_FAILED`; a stale tag returns `409 MEDIA_UPDATE_CONFLICT`; a
`deleting` or `delete_failed` item returns `422 CONTENT_INVALID_STATE`; an
unknown ID returns `404 NOT_FOUND`.

## Configured collection query reads

The Admin model list advertises runtime `listQueryLimits` (Node 200/null,
Cloudflare 48/50). Ordinary literal `LIKE` ignores ASCII case and keeps
non-ASCII case; text equality uses `= COLLATE NOCASE`. Public order and content
stay independent of Admin queries. See [collection queries](collection-queries.md)
for contracts, cursor recovery and measurements.

## Optional content assistant

The public guide is
[Connect an AI assistant](../apps/docs/src/content/docs/en/latest/operations/mcp.md);
local repository setup is in
[DEVELOPMENT.md](../DEVELOPMENT.md#connect-a-local-content-assistant). The
tested baseline is MCP `2025-11-25`, the official TypeScript client and server
`2.4.0`, and Better Auth with its OAuth Provider `1.7.3`.

REST and MCP call the same application operations and use the same content
contracts, defaults, metadata, limits, attribution and error paths. Lace binds
pending authorization parameters to a short-lived opaque browser handle, so a
caller cannot supply an arbitrary post-login redirect. Tokens are hashed at
rest; issuance bindings, family generations and the current enabled account
and role are checked on every request.

Local verification runs `pnpm compat:mcp`, the production bundle, the
equivalence and lifecycle fixtures under `scripts/fixtures/oauth-mcp/`, the
Admin UI and the existing auth and security suites. Real-browser login, consent
approval and denial, SDK calls and Account revocation are checked against
disposable local Node and D1 runtimes. These results do not accept a deployed
VPS or Cloudflare installation or a third-party client release.

## Local operations evidence

See [owner checks on real infrastructure](verification.md#owner-checks-on-real-infrastructure)
for deployment, restore, rotation and provider evidence beyond local
verification. Media tag behavior is public in
[rich text and media](../apps/docs/src/content/docs/en/latest/editing-content/rich-text-media.md).
