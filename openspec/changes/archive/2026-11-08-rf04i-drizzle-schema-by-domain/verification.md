# Verification — rf04i-drizzle-schema-by-domain

## 1. Baseline (commit `3db0ec89`)

Raw lists were kept in the session scratchpad (`keys-before.txt`,
`decl-before.txt`, `export-before.sql`, `drizzle-before.sha`,
`titles-before.txt`).

- `@lacecms/db` built from a clean `dist/`: 204 runtime keys, 244 exported
  declaration names.
- `drizzle-kit export --config drizzle.config.ts`: 582 lines.
- `packages/db/drizzle/` file inventory hashed.
- `vitest list`: 30 tests in 22 files.
- `scripts/test-typecheck-baseline.json`: 19 `packages/db` entries.

## 2. Implementation checks

- 2.1 `schema/tables.ts` is replaced by `columns.ts`, ten table modules
  (`content` 121 lines, `publication` 33, `links` 52, `media` 94, `outbox` 29,
  `builds` 36, `operations` 25, `auth` 83, `security` 87, `oauth` 324) and
  `better-auth.ts` (18). Bodies and JSDoc moved verbatim (a scripted split
  asserted that every non-blank line of the 36 table blocks and
  `betterAuthSchema` landed in exactly one module). Schema imports follow D1:
  `content`, `outbox`, `operations` and `auth` import no other table module;
  `publication`, `links`, `media` and `builds` import `content`; `security`
  and `oauth` import `auth`; `better-auth` imports `auth` and `oauth`.
  `pnpm --filter @lacecms/db typecheck` passes.
- 2.2 `drizzle.config.ts` lists the ten table modules. `pnpm db:check`
  passes and `git status packages/db/drizzle` is clean. The
  `drizzle-kit export` output after the split has the same 582 lines and the
  same statement set as before; only statement order differs (hash
  `42bcf860…` → `22c0a1d2…`). Negative checks: a temporary column added to
  `content.ts` (first module) and to `oauth.ts` (last module) each made
  `pnpm db:check` report a pending migration; both were reverted.
- 3.1 `builds/outbox.ts` moved with `git mv` to `builds/requests.ts`
  (`PENDING_SITE_BUILD_SQL`, `siteBuildPayload`); `OutboxRow` lives in
  `outbox/rows.ts`. `scripts/source-layout.json` and the entry header list
  `outbox` with no dependencies. `node scripts/check-boundaries.mjs` passes.
- 3.2 `shared/literal-like.ts` is deleted; `content/collection-list.ts`
  imports `literalLikePattern` from `@lacecms/content` and the entry
  re-exports it by name. The test moved with `git mv` to
  `content/collection-list-like.test.ts`, typed, and left the typecheck
  baseline (19 → 18 `packages/db` entries). The boundary checker accepts the
  shrunk baseline.
- 4.1 Rebuilt from a clean `dist/`: runtime keys and declaration names equal
  the baseline. `vitest list` titles are equal except the moved test's path.

## 3. Final checks (4.2)

- Root `pnpm typecheck`: exit 0.
- `pnpm lint`: first run failed on five unused `primaryKey` imports (the
  scripted split took `.primaryKey()` column calls for the table-level
  helper); after removing them, exit 0 (Oxlint, boundaries, admin colors,
  `db:check` in sync).
- `pnpm format:check`: exit 0.
- `pnpm openapi:check`: exit 0.
- `pnpm test`: 64 Turbo tasks successful; root suite 36 files, 340 tests.
  db 30 (+ 1 packaged), platform-node 313 (+ 5 packaged),
  platform-cloudflare 219 (+ 3 packaged). The import cleanup after this run
  touched only unused imports; db source and packaged tests were rerun after
  it (30 and 1 passed).
- `pnpm exec openspec validate rf04i-drizzle-schema-by-domain --type change --strict`: valid.

## 4. Deviations

- `scripts/check-drizzle-schema.mjs` passed `--schema` with a comma-joined
  list, which Drizzle Kit reads as one missing path; repeating `--schema`
  keeps only the last module. The check now writes a copy of the
  configuration with only `out` redirected into its disposable directory and
  runs `drizzle-kit generate --config` on it. This path was never exercised
  before because RF4E kept a single schema file.
