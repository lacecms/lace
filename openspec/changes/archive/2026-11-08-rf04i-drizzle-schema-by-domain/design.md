## Context

- `packages/db/src/schema/tables.ts` (862 lines) defines 36 tables in this
  order: content models, entries, snapshots, blocks, published routes; media,
  media tags, content-media references; link references, link state,
  published state; outbox events, site builds, idempotency records,
  installation state, setup tokens, API tokens, rate-limit buckets, mutation
  guards; Better Auth users, sessions, accounts, verifications; invitations,
  password-reset tokens; eleven OAuth tables; then `betterAuthSchema`. Two
  local column helpers (`timestamp`, `authTimestamp`) are not exported.
- Cross-table references: entries → models; blocks, routes, media and link
  references, published state → snapshots/entries; tags → media; site builds
  → snapshots; auth sessions, accounts, invitations, password resets → users;
  OAuth tables → users, sessions, OAuth clients, resources, grants and
  issuances. Entries and snapshots reference each other.
- `drizzle.config.ts` names `schema/tables.ts`. `pnpm db:check`
  (`scripts/check-drizzle-schema.mjs`, part of `pnpm lint`) runs
  `drizzle-kit check`, then `drizzle-kit generate` into a disposable copy of
  `packages/db/drizzle/` with every module the config names, and fails when
  the copy's file inventory changes.
- RF4E's split attempt failed only its byte-identical `drizzle-kit export`
  gate (DDL order); the roadmap now replaces that gate (proposal).
- `@lacecms/db` re-exports `schema/tables.ts` with `export *`; its packaged
  export test pins the runtime key list. `OutboxRow` is used by both
  repositories' outbox claims; `PENDING_SITE_BUILD_SQL` and
  `siteBuildPayload` only by site-build dispatch.

## Goals / Non-Goals

**Goals:** table definitions grouped by the `db` domains, each module far
below the ceiling; unchanged migrations and snapshots; unchanged public
exports and declarations; the outbox claim row owned by `outbox/`; no
re-export-only module.

**Non-Goals:** schema or SQL changes; renaming tables or exports; splitting
repository SQL; RF4H/RF4J modules.

## Decisions

### D1. Schema modules and their direction

The modules in the proposal table hold verbatim table bodies and JSDoc.
`columns.ts` exports the two helpers for the other schema modules; the entry
does not re-export it. Imports inside `schema/`:

`columns ← content ← {publication, links, media, builds}` ;
`columns ← {outbox, operations, auth}` ; `auth ← {security, oauth}` ;
`{auth, oauth} ← better-auth`.

Entries and snapshots stay in `content.ts` because they reference each other.
`schema/` still imports nothing outside `schema/` and `drizzle-orm`, so the
`db` directory rule (`schema ← shared` allowed, unused) is unchanged.

Rejected: placing each table under its `db` domain directory (for example
`content/tables.ts`). Every repository-SQL directory would then import
Drizzle, and `schema` would no longer be one place that Drizzle Kit reads.
Rejected: RF4E's coarser `operations.ts` holding outbox and site builds. The
outbox gets its own owner in this session, and site builds belong with
builds.

### D2. Entry re-exports

`index.ts` replaces `export * from "./schema/tables.js"` with `export *`
lines for every table module and `better-auth.ts`, in table order. Proof of
unchanged API: the packaged export test (runtime keys) and the
`dist/index.d.ts` exported declaration-name set compared before and after.

### D3. Drizzle configuration and the acceptance gate

`drizzle.config.ts` sets `schema` to an explicit array of the ten modules
that define tables; `columns.ts` and `better-auth.ts` define none and are
left out. The array follows the order in which each module's first table
appears in the old file:
`content`, `publication`, `media`, `links`, `outbox`, `builds`,
`operations`, `security`, `auth`, `oauth`. A glob is not used, because it
would load tests and `migrations.ts`.

`scripts/check-drizzle-schema.mjs` passed the array to the CLI as one
comma-joined `--schema` value, which Drizzle Kit cannot read (and a repeated
`--schema` keeps only the last). It writes the configuration, with only `out`
redirected, into its disposable directory and runs `generate --config` on it
(found during apply).

Acceptance: `pnpm db:check` passes, so `drizzle-kit generate` adds no
migration or snapshot, and `git status packages/db/drizzle` is clean.
`drizzle-kit export` output is recorded before and after for the record
only. If `generate` reports a change that is only ordering, the order of the
array is adjusted; if it reports a schema change, the split is wrong and is
fixed, never accepted with a migration.

### D4. Outbox owner

`outbox/rows.ts` holds `OutboxRow` with its JSDoc. `builds/requests.ts`
holds `PENDING_SITE_BUILD_SQL` and `siteBuildPayload` (they read
`site.build.requested` payloads), importing `parseObject` from
`shared/values.ts`. `builds/outbox.ts` is removed with `git mv` to
`builds/requests.ts` so history follows the larger part. Directory
direction: `outbox` depends on nothing; `scripts/source-layout.json` adds
`"outbox": []` and the entry header names it.

### D5. `literal-like`

`content/collection-list.ts` imports `literalLikePattern` from
`@lacecms/content`. `index.ts` keeps the public name with
`export { literalLikePattern } from "@lacecms/content";`. The behavior test
moves to `content/collection-list-like.test.ts`, imports the function from
`@lacecms/content`, drops `@ts-nocheck` (typed rows), and its entry leaves
`scripts/test-typecheck-baseline.json` (the baseline shrinks by one).

## Risks / Trade-offs

- [Drizzle Kit treats a reordered schema as a change] → D3 gate; ordering is
  adjustable without touching tables.
- [A table body changes while moving] → bodies move verbatim; `db:check`,
  the column-drift test and both runtimes' repository contract suites cover
  them.
- [A declaration name disappears] → packaged export test and the `d.ts`
  name-set comparison.
