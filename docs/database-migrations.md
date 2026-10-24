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

### Account-token migration

Migration `0004_account_tokens` adds the `invitations` and
`password_reset_tokens` tables used by invitations and password recovery. It is
additive: existing users, sessions, and content are unchanged, and a partial
unique index allows one active (unaccepted, unrevoked) invitation per
normalized email. Both tables store only SHA-256 token digests. Run it before
starting an engine with invitations, and deploy the API and admin together.
Older engines check only their own migrations, so they still start against a
migrated database.

### Content-model structure migration

Migration `0005_content_model_structure` adds the nullable `structure_json` and
`structure_json_hash` columns to `content_models`. It is additive and leaves
every existing row with both columns `NULL`; older engines keep starting
against the migrated database. After migrating, run `lace content sync` once to
record structure baselines (the first `--check` reports them as pending). See
[configuration synchronization](configuration-synchronization.md#schema-evolution-ce1a).

### Media metadata migration

Migration `0006_media_descriptive_metadata` adds the nullable `alt`,
`caption`, `focal_x` and `focal_y` columns to `media` with database checks:
`alt` at most 1,000 characters, `caption` at most 2,000, each focal coordinate
from 0 to 1, and both coordinates set or both `NULL`. It uses additive
`ALTER TABLE … ADD … CHECK` statements and does not rebuild `media`, which
`content_media_references` references; `schema.ts` declares the same rules as
table checks so the Drizzle snapshot matches. Every existing item starts with
all four columns `NULL`, and there is no backfill. `metadata_json` stays
reserved. Older engines keep starting against the migrated database and
ignore the new columns, so a rollback leaves any stored values unused.

### Global model kind migration

Migration `0007_content_model_global_kind` widens the `content_models.kind`
check to accept `global` ([ADR 0010](adr/0010-global-models.md)). SQLite cannot
alter a check, so the migration rebuilds `content_models`: it creates
`__new_content_models` with the widened check, copies every row with an
explicit column list, drops the old table and renames the new one. Every
model, entry, snapshot, block, route and media reference is unchanged, and the
`content_entries.model_key` foreign key keeps its key-update cascade and
delete restriction. No backfill runs.

`content_entries` references `content_models`, so the file starts with
`PRAGMA defer_foreign_keys = on`. D1 cannot switch foreign keys off, but it
accepts the deferred drop and rename when the file is applied as one batch
(`wrangler d1 migrations apply`). Node SQLite rejects the same deferred drop at
commit, so `migrateNodeDatabase` follows SQLite's documented rebuild
procedure: its own connection runs the pending migrations with
`foreign_keys = OFF`, then runs `PRAGMA foreign_key_check` and fails with a
"foreign-key violation" error unless the check is empty, and restores
enforcement. Application connections always keep foreign keys on.

Back up the database before migrating (copy the stopped SQLite file, or
`wrangler d1 export`). Older engines read a migrated database without globals
normally, but refuse a stored `global` model; rollback after creating a global
means restoring the backup.

### Snapshot SEO migration

Migration `0008_content_snapshot_seo` adds the nullable
`content_snapshots.seo_json` column, which holds a snapshot's SEO group
([ADR 0011](adr/0011-seo-system-group.md)) as canonical JSON. It is one
additive `ALTER TABLE … ADD` on Node SQLite and D1: no table is rebuilt, no
foreign key or index changes, every existing snapshot starts with `NULL` and
there is no backfill. Like `fields_json`, the column has no database check;
the application stores only validated values.

Back up before migrating, as for every migration. An older engine starts
against the migrated database and ignores the column, but a save from it
drops the SEO values of that draft and its media usage reads fail on SEO image
references, so do not run an older engine once SEO values exist; roll back by
restoring the backup.

### Block envelope migration

Migration `0009_content_block_envelope` adds the block envelope
([ADR 0012](adr/0012-block-envelope.md)) to `content_blocks`: nullable
`anchor` and `class_name`, `hidden` (`NOT NULL DEFAULT 0`, checked to `0` or
`1`) and `settings_json` (`NOT NULL DEFAULT '{}'`), plus the partial unique
index `content_blocks_snapshot_anchor_idx` on `(snapshot_id, anchor)` where
`anchor` is set. The statements are additive `ALTER TABLE … ADD` and one
`CREATE UNIQUE INDEX` on Node SQLite and D1: no table is rebuilt, no foreign
key changes and there is no backfill. Existing blocks read as visible, without
an anchor or class name, with `{}` settings; the index starts empty because
every existing anchor is `NULL`.

Back up before migrating. An older engine ignores the columns, but it would
deliver hidden blocks publicly and reset envelopes on save, so do not run an
older engine once envelopes exist; roll back by restoring the backup.

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

## CE10 internal URL links

See [internal URL links](./internal-url-links.md) for canonical ID targets, the
200-occurrence snapshot bound, publication/removal guards, format-2 transport,
installed source adoption, migration 0010 and matching-backup rollback. URL
fields remain content fields; block settings, provider URLs, SEO and rich-text
hrefs retain their existing grammars.
