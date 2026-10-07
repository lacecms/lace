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

### Site-build outcome migration

Migration `0003_site_build_outcomes` rebuilds `site_builds` for the seven-status
build lifecycle (architecture §9.8) and adds nullable provider tracking fields.
It reclassifies history in one shared file: former `running` rows become
`accepted` everywhere, because no runtime tracked provider deployments; on D1,
`succeeded` rows without a provider ID also become `accepted`, because a deploy
hook response never proved publication; Node SQLite builder `succeeded` rows are
kept. The file recognises D1 by the absence of the Drizzle migrator ledger
(`__drizzle_migrations`), which the Node migrator always creates before applying
files, so apply Node migrations only with `pnpm db:migrate:node` (or the
generated project's migration command), never by running SQL files by hand.
Stop dispatch and back up the database first; downgrading requires restoring
that backup because older engines reject the new statuses.

## Cloudflare D1

The D1 content repository (`@lacecms/platform-cloudflare`) uses the same
checked-in migrations. D1 has no interactive transactions, so every multi-row
mutation is one atomic `batch()`:

- Publication starts with a guarded `INSERT ... SELECT` of the new snapshot;
  every later statement requires that snapshot, and a zero-row insert is a
  revision conflict (or an idempotent replay).
- Other conditional mutations first insert a batch-unique row into
  `mutation_guards` (migration `0002_mutation_guards`) only when their
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

See [34C local operations verification](local-operations-verification.md) for coordinated database/object restore, credential rotation, health/log interpretation and the running CMS version in administrator Settings. Remote deployment, D1 capacity/restore and provider permissions remain owner checks; local evidence does not close them.
