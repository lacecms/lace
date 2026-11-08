# Database migrations

Lace database changes are explicit, ordered, forward-only migrations shared by
Node SQLite and Cloudflare D1. Backward/down migrations are not supported.

Generate a migration after changing the shared Drizzle schema:

```bash
pnpm db:generate
```

Apply all checked-in migrations to a Node SQLite file and print its installed
migration records:

```bash
LACE_DATABASE_PATH=./lace.sqlite pnpm db:migrate:node
```

Run this command as a deployment step before starting the Node runtime. If a
production migration needs correction, restore a verified database backup or
ship a reviewed later forward migration; do not edit an already-applied
migration file.

For local development, do not run a separate migration process. `pnpm dev:node`
starts the Compose migration role against its named SQLite volume before the
API is allowed to become ready. Ordinary `pnpm dev:stop` and subsequent starts
preserve that volume; only `pnpm dev:reset -- --confirm` deletes the named
local development database and MinIO data.

Node content repositories require this migration before they are constructed.
They provide bounded reads, draft lifecycle writes, guarded publication, and
entry deletion. Public-projection mutations atomically enqueue durable build
work; build dispatch occurs later. Media deletion only marks unreferenced media
for asynchronous cleanup, never deleting an object in the database transaction.

## Baseline and older databases

The checked-in chain starts with one baseline migration, `0000_baseline.sql`,
generated from the declared Drizzle schema (owner decision 11,
[ADR 0029](adr/0029-rc1-baseline.md)). It replaced the 16 migrations that
existed up to rc1 and creates the same tables, columns, checks, indexes and
seed row; three hand-written security indexes and the `content_link_state`
seed row are appended to the generated SQL because the declared schema does
not express them. Later schema changes are ordinary forward migrations after
the baseline.

A database migrated by an engine before the baseline records migrations that
are no longer checked in. It is refused, not upgraded:

- `lace db migrate` stops before any write with `SCHEMA_UNSUPPORTED` (exit 5)
  on Node, local D1 and remote D1;
- `lace doctor` reports the migration check as `SCHEMA_UNSUPPORTED` in setup
  and ready;
- the Node API and the Worker report not ready, because the baseline is not
  in their ledger.

Recreate such a database: keep the content you need, back up the old file or
D1 export, then delete the local database files (`.lace/data/lace.sqlite` with
its `-wal`/`-shm` files in a generated Node project, `.lace/data/cloudflare`
for local Cloudflare, `packages/platform-node/lace.sqlite` or the
`dev-data/` state in this repository) or create a new remote D1 database, and
run the migration, content sync and bootstrap again.

## Cloudflare D1

The D1 content repository (`@lacecms/platform-cloudflare`) uses the same
checked-in migrations. D1 has no interactive transactions, so every multi-row
mutation is one atomic `batch()`:

- Publication starts with a guarded `INSERT ... SELECT` of the new snapshot;
  every later statement requires that snapshot, and a zero-row insert is a
  revision conflict (or an idempotent replay).
- Other conditional mutations first insert a batch-unique row into
  `mutation_guards` only when their
  precondition holds, require that row in every later statement, and delete it
  as the batch's final statement. The table is therefore always empty outside a
  running batch; Node SQLite transactions never use it.
- Draft block and media-reference inserts are chunked to D1's 100 bound
  parameters per statement inside the same batch. Drafts are capped at 200
  blocks and 200 media references, keeping a maximal save within the
  50-query-per-invocation free-plan budget.

Apply D1 migrations with `pnpm db:migrate:cloudflare -- --local` (the persisted
`dev-data/cloudflare` state that `pnpm dev:cloudflare` uses) or
`pnpm db:migrate:cloudflare -- --remote`; see
[Cloudflare Worker runtime](cloudflare-worker.md#d1-migrations). Adapter tests
apply the SQL files to Miniflare directly.

## Repository contract suite

`@lacecms/test-utils` exports `contentRepositoryContractCases`, one shared set of
lifecycle cases. The same cases run against file-backed SQLite, in-memory
SQLite, and local D1 through Miniflare; each runtime only supplies a factory for
a freshly migrated database, and every run also asserts that no
`mutation_guards` row remains.

## Local operations evidence

See [owner checks on real infrastructure](verification.md#owner-checks-on-real-infrastructure) for deployment, restore, rotation and provider evidence beyond local verification.

## CE10 internal URL links

See [internal URL links](./internal-url-links.md) for canonical ID targets, the
200-occurrence snapshot bound, publication/removal guards, format-2 transport,
installed source adoption and matching-backup rollback. URL
fields remain content fields; block settings, provider URLs, SEO and rich-text
hrefs retain their existing grammars.
