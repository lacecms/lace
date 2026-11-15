## Why

The 2026-11-14 owner-requested architecture audit found that the Cloudflare
Worker decides whether to run its best-effort post-commit dispatch pass by
matching the request method and URL against a fixed list of admin REST routes
(`DISPATCH_PRODUCING_REQUESTS` in `platform-cloudflare/src/runtime/worker.ts`).
Publication through MCP (`POST /mcp`, tool `publish_entry`) commits the same
`site.build.requested` event but matches no pattern, so its build waits for
the next cron run. Every future write path (new MCP tools, new REST routes,
`/api/v2`) silently inherits the same gap. The list also over-triggers: an
idempotent replay or a metadata update of unpublished media matches a pattern
and runs a pass although nothing was queued. The outbox insert itself is the
only reliable fact that dispatch work exists.

This is not a roadmap session: it is an owner-requested audit follow-up
delivered as one just-in-time change, outside the RF steps, like
`harden-persistence-hygiene` and `align-openapi-contract` before it.

## What Changes

- The Worker registers the post-commit dispatch pass for a request exactly
  when that request committed at least one D1 statement that inserted or
  coalesced an outbox event (`site.build.requested` or
  `media.delete.requested`), whatever the route: admin REST, import-token
  REST, MCP, setup or configuration synchronization.
- D1 repositories register every outbox-enqueuing statement through one batch
  helper; after a successful batch they report committed outbox work when any
  registered statement changed a row.
- A request scope in the Worker runtime receives that report. The first
  report in a scope registers the pass at once, so a response that streams
  before the work commits (an MCP tool call) still gets it. Scheduled
  invocations and direct `runtime.app` calls have no request scope and are
  unaffected.
- **BREAKING (package API):** `producesDispatchWork(request, status)` and the
  URL pattern list are removed from `@lacecms/platform-cloudflare`. No product
  code imports them.
- A request that queued nothing (idempotent replay, rejected mutation,
  metadata update of media no publication uses) no longer runs a pass.
- The pass itself is unchanged: media deletion, debounce wait, site build,
  failures logged and swallowed, scheduled dispatch stays the recovery path.

Non-goals:

- Node: its dispatcher loop already polls the outbox; no immediate wake-up is
  added.
- Running only the dispatchers whose event types were queued.
- A typed outbox event registry or moving enqueue out of `bumpPublicState`
  (wave 2 of the audit).
- Changing debounce, lease, retry or query-budget rules.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `cloudflare-scheduled-dispatch`: the post-commit pass trigger is defined by
  committed outbox work instead of a list of request kinds, and covers MCP.

## Impact

- `packages/platform-cloudflare/src/repository/batch.ts` and `base.ts`
  (outbox statement registration, post-commit report), `media.ts` (media
  deletion enqueue through the helper).
- `packages/platform-cloudflare/src/runtime/worker.ts` (trigger),
  a new request-scope module in `runtime/`, runtime composition passing the
  report hook into repository options.
- Tests: `worker.test.ts` (route-list test replaced),
  `scripts/fixtures/oauth-mcp/worker-production.test.mjs` (MCP publication
  registers a pass), D1 repository tests for the report.
- Docs: `docs/architecture/publication.md` (outbox paragraph names the
  Worker's post-commit trigger), `docs/architecture/runtimes.md` Runtime
  deltas (Node polls, the Worker wakes on committed outbox work).
- No schema, migration, HTTP contract or OpenAPI change. Relies on the
  already mandatory `nodejs_compat` flag for `AsyncLocalStorage`.
