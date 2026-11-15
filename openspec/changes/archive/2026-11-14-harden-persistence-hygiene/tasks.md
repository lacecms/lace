## 1. Schema and migration

- [x] 1.1 Declare these indexes in the Drizzle schema (design D4):
  - in `content_entries`: `content_entries_draft_snapshot_idx` and
    `content_entries_published_snapshot_idx`;
  - in `published_routes`: `published_routes_snapshot_idx`;
  - in `site_builds`: `site_builds_published_snapshot_idx`;
  - in `idempotency_records`: `idempotency_records_expiry_idx`;
  - in `security.ts`: the three baseline security indexes, with their
    baseline names and the partial predicate on `api_tokens`.

  Verify: `pnpm --filter @lacecms/db typecheck` passes.
- [x] 1.2 Generate migration `0001` with `pnpm db:generate`, then change the
  three security index statements to `CREATE INDEX IF NOT EXISTS`. Verify:
  `pnpm db:check` passes, and `git diff packages/db/drizzle` shows only the
  new SQL, the new snapshot and the journal entry.
- [x] 1.3 Extend the db migration tests:
  - a baseline database migrates to `0001`;
  - every new index exists exactly once;
  - the rows seeded before the migration are unchanged.

  Verify: `pnpm --filter @lacecms/db test` passes.

## 2. Shared statements

- [x] 2.1 Add these builders to `@lacecms/db`, with unit tests that prepare
  each statement against a migrated in-memory database:
  - `purgeExpiredIdempotencyRecordsStatement(now, limit)`, with the limit
    capped at 20;
  - `deleteExpiredIdempotencyRecordStatement(scope, key, now)`;
  - `deleteSupersededSnapshotsStatement(entryId, draftId, publishedId)`.

  Verify: `pnpm --filter @lacecms/db test` passes.
- [x] 2.2 Move the inline `publication:` scope into a db `publicationScope`
  helper next to `unpublicationScope`, and use it in both repositories.
  Verify: `rg "publication:\\$\\{" packages/platform-*/src` finds no match.

## 3. Repository behaviour

- [x] 3.1 Node repository:
  - the publication and unpublication replay reads require `expires_at >
    now`;
  - committed mutations delete the expired record for their own scope and key
    before inserting;
  - publication uses `deleteSupersededSnapshotsStatement`.

  Verify: `pnpm --filter @lacecms/platform-node test` passes.
- [x] 3.2 D1 repository:
  - the replay reads and the `not exists` batch guards require `expires_at >
    now`;
  - the guarded batch deletes the expired record before its insert;
  - publication uses the shared superseded-snapshot statement with its guard
    fragment.

  Verify: `pnpm --filter @lacecms/platform-cloudflare test` passes.
- [x] 3.3 Add `OperationsMaintenancePort.purgeExpiredIdempotencyRecords`.
  - Implement it in both repositories with the shared purge statement.
  - Expose `maintainOperations()` on the Node and Cloudflare runtimes.
  - Call it next to `maintainOAuth()` in `apps/api/src/dispatcher.ts` and the
    Node server start.
  - In the Worker `scheduled` handler, call it as its own
    `operations-cleanup` phase, only on the minute of OAuth phase 2, so a
    scheduled run stays within 50 D1 queries (design D2).

  Verify: the runtime and Worker tests assert that the call happens and that
  a failing phase is logged without stopping later phases.

## 4. Contract cases

- [x] 4.1 Add these contract cases to `@lacecms/test-utils`
  `repository-contract` for idempotency expiry:
  - an unexpired key replays;
  - an expired key is processed as a new request and leaves one record;
  - an expired key with stale input changes nothing;
  - an expired unpublication key behaves the same way.

  Verify: the cases pass on Node SQLite (file and memory) and local D1.
- [x] 4.2 Add a purge contract case: limit +1 expired records plus live
  records. The first run deletes exactly the limit and keeps the live records;
  the second run deletes the rest. Verify: the case passes on both runtimes.
- [x] 4.3 Add superseded-snapshot cases:
  - after republication, only the draft and the new publication remain, with
    no orphaned block, media-reference or link-reference rows;
  - a refused publication deletes nothing.

  Verify: the cases pass on both runtimes.
- [x] 4.4 Add query-plan cases:
  - deleting a snapshot uses index searches on `content_entries`,
    `published_routes` and `site_builds`;
  - `PUBLIC_MEDIA_SQL` and `MEDIA_PUBLISHED_REFERENCE_SQL` do not scan
    `content_entries`.

  Verify: the cases pass on both runtimes.

## 5. Documentation and gates

- [x] 5.1 Update the architecture docs. Verify:
  `tests/architecture-document.test.mjs` passes.
  - `docs/architecture/data-model.md` §9.8: idempotency expiry semantics and
    maintenance purge.
  - `docs/architecture/runtimes.md` §16 "Runtime deltas": a row stating that
    superseded-snapshot cleanup and idempotency expiry are aligned, pinned by
    the new contract cases.
- [x] 5.2 Update `docs/database-migrations.md`: the security indexes are now
  declared in the schema, and `0001` is the first forward migration. Verify:
  `pnpm docs:check` passes.
- [x] 5.3 Run the root gates: `pnpm typecheck`, `pnpm lint`, `pnpm
  format:check` and `pnpm exec openspec validate harden-persistence-hygiene
  --type change --strict`. Verify: all succeed.
