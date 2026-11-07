## Why

Roadmap Step RF4 (module splits), Session RF4I of
`docs/refactoring-roadmap.md`. RF4E split `@lacecms/db` by domain, but its
Drizzle schema split changed `drizzle-kit export` DDL ordering, so the
specified fallback kept every table in one module:
`packages/db/src/schema/tables.ts` (862 lines, 36 tables plus
`betterAuthSchema`). It is the largest production module left in `db` and
mixes content, media, outbox, builds, security, Better Auth and OAuth tables.

Two smaller leftovers from the same split:

- `builds/outbox.ts` owns `OutboxRow`, the generic claimed-row shape that both
  runtimes' outbox dispatchers read for every event type, next to two
  `site.build.requested` helpers. The outbox has no `outbox/` owner.
- `shared/literal-like.ts` is one line: `export { literalLikePattern } from
  "@lacecms/content"`. It exists only to be re-exported and imported once.

Architecture §6 *Source layout*, ADR 0020 and the RF4X guards apply. RF4I is
independent of RF4H (application and content modules) and may run before it,
as the roadmap allows.

## What Changes

- **Schema by domain.** `schema/tables.ts` is replaced by modules in
  `schema/`, each holding its tables verbatim:

  | Module | Tables |
  | --- | --- |
  | `columns.ts` | `timestamp`, `authTimestamp` column helpers (not re-exported) |
  | `content.ts` | `contentModels`, `contentEntries`, `contentSnapshots`, `contentBlocks` |
  | `publication.ts` | `publishedRoutes`, `publishedState` |
  | `links.ts` | `contentEntryLinkReferences`, `contentLinkState` |
  | `media.ts` | `media`, `mediaTags`, `contentMediaReferences` |
  | `outbox.ts` | `outboxEvents` |
  | `builds.ts` | `siteBuilds` |
  | `operations.ts` | `idempotencyRecords`, `mutationGuards` |
  | `auth.ts` | `authUsers`, `authSessions`, `authAccounts`, `authVerifications` |
  | `security.ts` | `installationState`, `setupTokens`, `apiTokens`, `rateLimitBuckets`, `invitations`, `passwordResetTokens` |
  | `oauth.ts` | the eleven `oauth*` tables |
  | `better-auth.ts` | `betterAuthSchema` |

  `drizzle.config.ts` names the table modules in an explicit `schema` array.
- **New invariant** (roadmap): the split is accepted when `pnpm db:check`
  reports no pending migration and the committed `packages/db/drizzle/`
  directory is unchanged. Byte-identical `drizzle-kit export` text is no
  longer required, because a module split may reorder DDL statements
  without changing the schema. If `drizzle-kit generate` reports a change,
  the config lists the modules in the original table order.
- **Outbox owner.** New `outbox/rows.ts` owns `OutboxRow`. The two
  site-build event helpers (`PENDING_SITE_BUILD_SQL`, `siteBuildPayload`)
  move to `builds/requests.ts`. `builds/outbox.ts` is deleted.
- **`literal-like` re-export.** `shared/literal-like.ts` is deleted.
  `content/collection-list.ts` imports `literalLikePattern` from
  `@lacecms/content`. The entry re-exports it by name, so the public export
  list stays the same. Its test moves beside its user as
  `content/collection-list-like.test.ts`, typed, and leaves the typecheck
  baseline.
- `scripts/source-layout.json` gains the `outbox` directory, and the entry's
  `Directory dependencies` header says the same.
- Non-goals: no table, column, index, constraint or migration change; no
  repository SQL change; no change to the published export list,
  declaration names or `drizzle/` contents; RF4H and RF4J modules.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The requirement *Shared SQL and the declared schema stay consistent
with the checked-in migrations* (`sqlite-schema-and-migrations`) already
states the accepted invariant: `pnpm lint` (through `pnpm db:check`) fails
when the declared schema differs from the latest checked-in snapshot. The
change sets `skip_specs: true`.

## Impact

- Code: `packages/db/src/schema/*`, `outbox/rows.ts`,
  `builds/requests.ts`, `content/collection-list.ts`, the moved test,
  `packages/db/src/index.ts`, `drizzle.config.ts`,
  `scripts/check-drizzle-schema.mjs` (multi-module schema support),
  `scripts/source-layout.json`, `scripts/test-typecheck-baseline.json`.
- Public API: none. `@lacecms/db` keeps its runtime export list and
  declaration names, pinned by its packaged export test.
- Runtimes: none. Node SQLite and D1 read the same migrations; no SQL text
  changes.
- Architecture: §6 is unchanged; the roadmap RF4 section records the
  outcome.
- Dependencies: RF4E (archived), RF4X guards. Independent of RF4H and RF9.
