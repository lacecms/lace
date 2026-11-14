## Context

See proposal.md for the motivation. Today's state:

- **Idempotency records.** Node (`platform-node/src/repository/entries.ts`)
  and D1 (`platform-cloudflare/src/repository/entries.ts`) read
  `idempotency_records` by `(scope, key)` and ignore `expires_at`. D1 also
  guards its batch with `not exists (select 1 from idempotency_records where
  scope = ? and key = ?)`, so an expired row would block a new mutation if
  expiry were honoured only in the read.
- **Maintenance.** It already runs on both runtimes: `maintainOAuth()` runs on
  every Node dispatcher media cycle (`apps/api/src/dispatcher.ts`) and at Node
  API start, and in the Worker `scheduled` handler as the `oauth-cleanup`
  phase. Bounded `delete … where id in (select … limit ?)` statements are the
  established pattern (`db/src/security/oauth.ts` `cleanup`).
- **Superseded snapshots.** Node deletes `entry.published.id` after the
  publication insert. D1 deletes `where entry_id = ? and id <> draft and id
  <> new` inside the guarded batch.
- **Migrations.** The chain is `0000_baseline.sql` plus the drizzle-kit
  snapshot. `scripts/check-drizzle-schema.mjs` compares the declared schema
  with the latest snapshot. The three security indexes were appended to the
  baseline by hand and are absent from the snapshot.

## Goals / Non-Goals

**Goals:**

- One rule for expiry and cleanup, written once in `@lacecms/db` and executed
  by both runtimes.
- Additive migration only: indexes, no table rebuild, no data rewrite.

**Non-Goals:**

- Moving publication writes to shared statement plans beyond the two
  statements named below. The general write-path convergence stays in the
  backlog.

## Decisions

### D1. Expiry is checked in the replay read and in the D1 guard

1. Both replay reads add `and expires_at > ?`, bound to the command's
   publication or unpublication time.
2. The D1 `not exists` guard gains the same predicate, so an expired record
   no longer blocks the batch.
3. Each committed mutation first deletes the expired record for its own
   `(scope, key)`, then inserts the new record:
   - on Node, inside the transaction;
   - on D1, as a guarded statement in the batch before the insert.
4. Both runtimes take the delete statement from one `@lacecms/db` builder.

*Alternative rejected:* `insert or replace`. It would overwrite an unexpired
record in a concurrent race that the guard is meant to reject, and it hides
the expired-versus-live distinction.

### D2. Purge through an operations maintenance port

- `@lacecms/db` exports `purgeExpiredIdempotencyRecordsStatement(now, limit)`:
  `delete from idempotency_records where (scope, key) in (select scope, key
  from idempotency_records where expires_at <= ? limit ?)`, with the limit
  capped at 20, as in the OAuth cleanup.
- A new application port `OperationsMaintenancePort`, in
  `application/src/ports/infrastructure.ts`, declares
  `purgeExpiredIdempotencyRecords(now, limit): Promise<number>`. Both
  repositories implement it.
- Each runtime returns a `maintainOperations()` next to `maintainOAuth()`:
  - Node calls it wherever `maintainOAuth()` is called.
  - The Worker `scheduled` handler runs it as its own `operations-cleanup`
    phase, so a failure is reported separately. It runs only on the minute
    when OAuth maintenance takes its two-statement phase 2 (every third
    minute). The other OAuth phases have three statements and already bring
    a full scheduled run to the 50-query Workers Free limit; with phase 2 the
    purge keeps the maximum at exactly 50. Owner decision 2026-11-14, found
    during apply: an every-minute phase measured 51 queries.

`maintainOAuth` keeps its name and public signature, because the published
runtime types expose it.

*Alternative rejected:* purging inside publication mutations. That adds write
cost to the hot path and changes D1 batch budgets.

*Alternative rejected:* purging every minute with four instead of five media
deletion claims. That narrows an accepted scheduled-dispatch limit.

*Alternative rejected:* a ninth statement in the OAuth cleanup batch. It
loses the separate failure isolation of the operations phase.

### D3. Shared superseded-snapshot statement

`@lacecms/db` exports `deleteSupersededSnapshotsStatement(entryId, draftId,
publishedId)`, which carries the D1 predicate today. Node uses it in place of
`delete … where id = entry.published.id`, and D1 appends its guard fragment,
following the `links/statements.ts` pattern.

When an entry holds only a draft and a published snapshot, the result is the
same as today. The shared statement also removes any stray snapshot left by a
concurrent same-revision publication. Architecture §16 "Runtime deltas"
records that this area is aligned.

### D4. One migration `0001`, generated then reviewed

1. Declare these indexes in the schema:
   - `content_entries_draft_snapshot_idx`;
   - `content_entries_published_snapshot_idx`;
   - `published_routes_snapshot_idx`;
   - `site_builds_published_snapshot_idx`;
   - `idempotency_records_expiry_idx`;
   - the three security indexes, with the same names and the same partial
     predicate.
2. Run `pnpm db:generate`.
3. Edit the generated SQL so the three security indexes use `CREATE INDEX IF
   NOT EXISTS`, because the baseline already creates them. The other
   statements stay as generated.
4. The snapshot then matches the declared schema, so `pnpm db:check` passes.

*Alternative rejected:* editing `0000_baseline.sql`. Applied migrations are
never edited (database-migrations.md).

*Alternative rejected:* joining through `s.entry_id` instead of indexing.
`PUBLIC_MEDIA_SQL` and `MEDIA_PUBLISHED_REFERENCE_SQL` could be rewritten, but
the foreign-key checks on snapshot deletion still need the indexes.

### D5. Contract coverage

The new cases live in `@lacecms/test-utils` `repository-contract`:

- expiry and replacement, under entries/publication;
- purge;
- superseded-snapshot cleanup;
- query plans, under delivery/queries.

They use the clock the factories already inject, so Node SQLite (file and
memory) and local D1 run identical cases.

## Risks / Trade-offs

- **[Risk]** An expired key replays a *new* publication: the client meant a
  retry, but more than 24 hours passed. → This is the documented §9.8
  contract. The admin generates a fresh key per action, so only direct API
  clients can hit it.
- **[Risk]** Index creation on a large D1 database takes time inside `lace db
  migrate`. → Index builds on these tables are linear and single-statement.
  The operator path is unchanged.
- **[Trade-off]** Six more indexes add a little write cost on publication and
  build-request inserts. This is small next to the scans they remove.
- **[Risk]** `CREATE INDEX IF NOT EXISTS` hides a renamed index. → The names
  are copied from the baseline. The migration test asserts each index exists
  exactly once.

## Migration Plan

1. Ship `0001` with the engine release. Operators run the existing `lace db
   migrate` (Node, local and remote D1).
2. No data backfill is needed. Expired rows are removed gradually by
   maintenance.
3. To roll back, restore a backup as documented. Older engines ignore the
   extra indexes, but a database migrated to `0001` is refused by an engine
   whose ledger lacks it, as with any forward migration.
