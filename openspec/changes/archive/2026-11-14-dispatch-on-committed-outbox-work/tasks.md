## 1. Committed outbox report in D1 repositories

- [x] 1.1 Add `MutationBatch.addOutbox(sql, ...params)`. It records the
  statement index as outbox-enqueuing. Add `onOutboxWork?: () => void` to
  `D1RepositoryOptions`. Make `D1RepositoryBase.execute()` call it once after
  a successful batch in which any recorded statement has `meta.changes > 0`.
  Verify: a new focused test in `platform-cloudflare` shows
  - a batch whose outbox statement changes a row reports once;
  - a batch whose guard fails reports nothing;
  - a thrown batch reports nothing.
- [x] 1.2 Register the `insert or ignore` and the coalescing `update` in
  `addSiteBuildEnqueue()`, and the `media.delete.requested` insert in
  `requestMediaDeletion()`, through `addOutbox`. Verify: D1 repository tests
  report work for each of these:
  - publication;
  - unpublication;
  - deletion of a published entry;
  - metadata update of media used by a publication;
  - build request and build retry;
  - media deletion and deletion retry.

  They report none for:
  - an idempotent publication replay;
  - a revision conflict;
  - a metadata update of unused media.
- [x] 1.3 Add a source test asserting that every `into outbox_events` insert
  under `packages/platform-cloudflare/src/repository/` is passed to `addOutbox(`.
  Verify:
  - the test passes;
  - temporarily changing one call to `add(` makes it fail and name the file.
    Revert the change after checking.

## 2. Worker trigger

- [x] 2.1 Create `runtime/post-commit-scope.ts` with an
  `AsyncLocalStorage`-backed `run(onFirstWork, fn)` and `markOutboxWork`.
  The first mark in a scope calls `onFirstWork`; later marks and marks
  outside a scope do nothing. Pass `onOutboxWork: markOutboxWork` into the
  `D1ContentRepository` options in `createCloudflareRuntime`. Verify:
  - a unit test shows a mark outside `run` does nothing;
  - several marks in one scope call `onFirstWork` once;
  - two concurrent `run` scopes are attributed separately.
- [x] 2.2 Wrap `runtime.app.fetch` in `fetch` with
  `run(() => ctx.waitUntil(postCommit(runtime)), …)`. Delete
  `producesDispatchWork`, `DISPATCH_PRODUCING_REQUESTS` and their unit test.
  Verify: `worker.test.ts` Worker-fixture cases count registered
  `waitUntil` passes:
  - one each for REST publication, unpublication and media deletion;
  - none for a draft save, a publication replay and a read;
  - one only for the publishing request when a publication and a read run
    concurrently.
- [x] 2.3 Extend `scripts/fixtures/oauth-mcp/worker-production.test.mjs` so
  that the committed `publish_entry` call registers exactly one post-commit
  pass and its replay registers none. Verify: the fixture test passes, and it
  fails on the code before 2.2.

## 3. Documentation and gates

- [x] 3.1 State the Worker trigger in `docs/architecture/publication.md`: a
  request that committed outbox work gets a best-effort pass, and scheduled
  dispatch remains the recovery path. Add a `docs/architecture/runtimes.md`
  Runtime deltas row: Node polls through its dispatcher loop, the Worker wakes
  on committed outbox work. Verify: `pnpm lint`, including its boundary
  checker, passes.
- [x] 3.2 Run the gates:
  - the focused `platform-cloudflare` tests;
  - `pnpm typecheck`;
  - `pnpm lint`;
  - `pnpm format:check`;
  - `pnpm exec openspec validate dispatch-on-committed-outbox-work --type change --strict`.

  Verify: all succeed.
