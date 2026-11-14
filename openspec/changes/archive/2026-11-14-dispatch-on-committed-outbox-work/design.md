## Context

See proposal.md for the motivation. Current state:

- `createCloudflareWorker().fetch` calls `runtime.app.fetch`, then
  `producesDispatchWork(request, response.status)` matches eight
  method/path patterns. When one matches a 2xx response, it calls
  `ctx.waitUntil(postCommit(runtime))`.
- Each D1 mutation is one guarded batch built with `MutationBatch` and
  committed by `D1RepositoryBase.execute()`. A guard that does not hold turns
  every statement into a no-op, and the batch still commits.
- Outbox events are written in exactly two D1 places:
  - `D1RepositoryBase.addSiteBuildEnqueue()` runs `insert or ignore`, then a
    coalescing `update` of the pending `site.build.requested` event.
    `addPublicStateBump()` calls it for publication, unpublication, deletion,
    media metadata and configuration synchronization; `D1SiteBuilds` calls it
    for build requests and retries.
  - `D1MediaCommands.requestMediaDeletion()` runs `insert into outbox_events …
    'media.delete.requested'`, for both deletion and retry.
- `createCloudflareRuntime` builds one `D1ContentRepository` per isolate.
  Every repository area shares its `D1RepositoryOptions`.
- The Worker always runs with `nodejs_compat`, because Better Auth needs
  `AsyncLocalStorage` (architecture `security.md`).

## Goals / Non-Goals

**Goals:**

- One choke point decides whether committed outbox work exists. Repository
  code paths need no knowledge of HTTP.
- Attribution per request, deterministic under concurrent requests in one
  isolate.

**Non-Goals:**

- Changing what `postCommit` runs or its order.
- Any Node change.
- Exposing the signal outside `@lacecms/platform-cloudflare`.

## Decisions

### D1. The signal comes from the committed batch, not from the route or the use case

`MutationBatch` gains `addOutbox(sql, ...params): number`. It adds the
statement and records its index as outbox-enqueuing. `addSiteBuildEnqueue()`
registers both its `insert or ignore` and its coalescing `update` through
`addOutbox`. The media deletion insert does the same. After a successful
`database.batch()`, `execute()` checks whether any recorded index has
`meta.changes > 0`. If so, it calls `options.onOutboxWork?.()` once.

`meta.changes` is checked rather than the trailing `pending_id` select. When
the guard fails, that select can still see a pending event that another
request queued, which would be a false positive.

A source test asserts that every `insert … into outbox_events` in
`platform-cloudflare/src/repository/**` sits inside an `addOutbox(` call.
Without that test, a future enqueue added with plain `add` would silently miss
the pass.

Alternatives rejected:

- **Application-level signal.** Port results such as `targetVersion` or a
  build receipt would report the work. That needs a per-request sink in every
  use case input and in the MCP handler, which is composed once with the
  content use cases. It changes ports for a Worker-only latency optimization.
- **Route metadata.** This is the current defect in another form. MCP tool
  calls share one route.
- **An outbox read after every mutating response.** It costs one D1 query per
  draft autosave. It also turns into a false positive whenever a debounced
  build is already pending, and every such pass then waits for the full
  debounce inside `waitUntil`.

### D2. Per-request scope through `AsyncLocalStorage`; the first mark registers the pass

A new `runtime/post-commit-scope.ts` owns an
`AsyncLocalStorage<{ onFirstWork, registered }>`. It exposes two functions:

- `run(onFirstWork, fn)` runs `fn` in a fresh store;
- `markOutboxWork()` calls the store's `onFirstWork` the first time it runs
  in that store and does nothing on later marks or outside any store.

`createCloudflareRuntime` passes `onOutboxWork: markOutboxWork` in the
`D1ContentRepository` options. `fetch` wraps `runtime.app.fetch` in
`run(() => ctx.waitUntil(postCommit(runtime)), …)`, so the request registers
its pass the moment its first outbox batch commits.

The pass is not registered after the response. The MCP SDK returns a
streamed `POST /mcp` response before the tool call commits its batch, so a
flag read after `app.fetch` resolves misses the publication. `waitUntil` is
valid while the response body is still streaming, because the request
context is still live.

The response status does not matter. A committed enqueue followed by a
response failure still deserves a pass, and the pass is harmless.

Scheduled handlers and direct `runtime.app.fetch` calls run outside any
scope, so the mark does nothing there.

Alternatives rejected:

- **Read a flag after the response.** It misses streamed MCP responses, as
  described above.
- **Read the flag when the response body ends.** Wrapping the body in a
  `TransformStream` and checking in `flush` works but ties the trigger to the
  stream lifecycle and to bodies that a client may never finish reading.
- **An isolate-wide "pending wake-up" flag that any request consumes.** It
  works, because any live `waitUntil` can run the pass. But it attributes work
  to whichever unrelated request ends first, and it makes the concurrency
  scenario untestable.

### D3. Removal of `producesDispatchWork`

The function, `DISPATCH_PRODUCING_REQUESTS` and its unit test are deleted.
The package's public `export *` loses the function. A repository search shows
no consumer outside the test.

## Risks / Trade-offs

- [Async context lost across the D1 binding] → workerd propagates
  `AsyncLocalStorage` through awaited bindings under `nodejs_compat`, and
  Better Auth already depends on that. The Worker fixture test exercises a
  real publication through the composed runtime.
- [A future enqueue added with plain `add`] → the source test from D1 fails.
- [Fewer passes than before for replays and unused-media updates] → this is
  intended. Those requests queued nothing.
- [The pass starts before the request ends] → if a request commits outbox
  work in a later batch too, the media deletion step may run before that
  commit. The site build step still waits for the debounce, and scheduled
  dispatch recovers anything the pass misses.
- [A configuration synchronization run inside a request now triggers a pass]
  → this is correct, because it queued a build.

## Migration Plan

Code-only change. No data, schema or configuration migration. To roll back,
revert the change; scheduled dispatch covers any pass that was missed in
between.
