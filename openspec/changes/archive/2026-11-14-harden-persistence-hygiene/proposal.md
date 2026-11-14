## Why

The 2026-11-14 owner-requested architecture audit found persistence defects
where the code contradicts architecture §9.8 or scales worse than the schema
intends. Publication and unpublication idempotency records never expire and are
never removed, although §9.8 promises a 24-hour lifetime and maintenance
cleanup. Every republication deletes a snapshot whose inbound foreign keys
(`content_entries` draft/published pointers, `published_routes.snapshot_id`,
`site_builds.published_snapshot_id`) have no index, so each delete scans those
tables, and `site_builds` grows without retention. Two public and admin media
queries join on the unindexed `content_entries.published_snapshot_id`. Three
security indexes exist only as hand-written baseline SQL, so a future
generated migration could silently drop them. Node and D1 also clean up
superseded snapshots on publication with different statements, a delta missing
from architecture §16.

## What Changes

- An idempotency record past its `expires_at` no longer replays: a retry with
  an expired key is processed as a new request on both runtimes, and the
  committed mutation replaces the expired record atomically.
- Maintenance purges expired idempotency records in bounded batches on the
  existing schedule (Node dispatcher loop, Worker cron), through one shared
  statement; `expires_at` gains an index.
- One forward migration adds indexes for every foreign key that references
  `content_snapshots` and for `idempotency_records.expires_at`.
- The three hand-written security indexes are declared in the Drizzle schema
  so the schema snapshot knows them; the migration does not recreate them.
- Publication removes superseded snapshots with one shared statement on both
  runtimes (every snapshot of the entry except the current draft and the new
  publication), and architecture §16 records the rule.
- Repository contract cases pin expiry, purge, cleanup and the new query plans
  on Node SQLite and local D1.

No public API, DTO or configuration changes. Not **BREAKING**.

## Non-goals

- Shrinking `response_json`: replays must return the original result
  (content-use-cases), so storing a compact reply needs its own decision. The
  D1 row-size risk for very large entries stays a known limitation.
- Changing `site_builds.published_snapshot_id` semantics (`SET NULL` after
  republication) or adding build-history retention.
- Running the repository contract suite against the in-memory store in
  `@lacecms/test-utils`: its factory needs SQL seeding and inspection.
- Unifying Node and D1 write paths beyond the shared statements above
  (deferred in the roadmap).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sqlite-schema-and-migrations`: index every foreign key that references
  snapshots and the idempotency expiry, and declare every index in the schema.
- `content-repository-contracts`: idempotency expiry and purge, shared
  superseded-snapshot cleanup, and the query plans for snapshot deletion and
  published media lookups.

## Impact

This change comes from the owner-requested audit and sits outside the RF
roadmap, so it has no roadmap step or session. It is one cohesive session:
every item lands in the same forward migration or the same repository
contract suite. Architecture §9.7, §9.8, §15 and §16 apply, along with
ADR 0002 and ADR 0029.

Affected code:

- `packages/db`: the schema, a new migration `0001`, and shared statements.
- `packages/platform-node` and `packages/platform-cloudflare`: the
  repositories and the maintenance wiring.
- `packages/application`: the maintenance port.
- `apps/api`: the dispatcher maintenance call.
- `packages/test-utils`: the contract cases.

Documentation updates: `docs/architecture/data-model.md`,
`docs/architecture/runtimes.md` and `docs/database-migrations.md`.

Operators apply one additive migration. It only creates indexes and needs no
data rewrite on either runtime.
