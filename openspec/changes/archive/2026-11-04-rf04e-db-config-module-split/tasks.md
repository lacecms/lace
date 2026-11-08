## 1. Baseline

- [x] 1.1 Clean `packages/db/dist` and `packages/config/dist`, build both packages, and record the design decision 9 baselines in `verification.md`: runtime keys of each `dist/index.js`, value and type export names of each `dist/index.d.ts`, sorted `vitest list` names for `db`, `config` and `platform-cloudflare` with file prefixes stripped (expected 27 in `db` and 50 in `config`, counting expanded `test.each` cases), the SHA-256 of `drizzle-kit export --config drizzle.config.ts` output and of `apps/api/openapi/api-v1.json`; verify the raw lists exist in the session scratchpad and the counts match.

## 2. Schema drift guards

- [x] 2.1 Add `packages/db/src/sql-schema-drift.test.ts` per design decision 8 against the unsplit constants; verify it passes, and that adding a bogus column to a copy of `MEDIA_COLUMNS_SQL` in the test data fails with a message naming the list, table and column (then restore).
- [x] 2.2 Add `scripts/check-drizzle-schema.mjs` per design decision 7, root `db:check` script, and append it to root `lint`; verify `pnpm db:check` passes and leaves `git status packages/db/drizzle` clean, and that a temporary extra nullable column in `schema.ts` makes it fail with a pending-migration message and still leaves `packages/db/drizzle` unchanged (then restore).

## 3. `@lacecms/db` shared, schema and existing modules

- [x] 3.1 Create `shared/limits.ts`, `shared/failures.ts`, `shared/write-errors.ts`, `shared/values.ts`, `shared/base64.ts` (with the four ambient declarations, design decision 4) and `shared/cursors.ts`, and `git mv literal-like.ts shared/literal-like.ts`; import them from `sql-content.ts` and `index.ts`; verify `pnpm --filter @lacecms/db test` and `typecheck` pass.
- [x] 3.2 `git mv` `oauth.ts` and `api-tokens.ts` into `security/`, `sql-internal-links.ts` to `links/statements.ts`, `internal-link-reader.ts` to `links/reader.ts`, `sql-publication.ts` to `publication/projection.ts`, and `collection-list.ts` to `content/collection-list.ts`; update imports; verify the package suite and typecheck pass.
- [x] 3.3 Split `schema.ts` into the design decision 1 `schema/` modules, move the migration inventory from `index.ts` to `schema/migrations.ts`, and point `drizzle.config.ts` at the explicit table-module list (design decision 5); verify `drizzle-kit export` output is byte-identical to the task 1.1 hash and `pnpm db:check` passes. If either fails and cannot be restored, apply the decision 5 fallback (`schema/tables.ts`) and record it in `verification.md`.

## 4. `@lacecms/db` SQL domains

- [x] 4.1 Create `content/entries.ts`, `content/blocks.ts` and `content/snapshots.ts` from the design decision 1 rows; verify the package suite and typecheck pass.
- [x] 4.2 Create `media/tags.ts`, `media/catalog.ts` and `media/usage.ts`; verify the package suite and typecheck pass.
- [x] 4.3 Create `delivery/public.ts`, then `builds/site-builds.ts`, `builds/outbox.ts` and `builds/export.ts`; verify the package suite and typecheck pass, including both build-export cases.
- [x] 4.4 Create `sync/model-state.ts`, `sync/scan.ts`, `sync/writes.ts`, `sync/block-migration-scan.ts`, `sync/block-migration-writes.ts` and `sync/field-rewrite.ts` (with its local `TextEncoder` declaration); delete the emptied `sql-content.ts`; verify the package suite and typecheck pass.
- [x] 4.5 Finalize `db` `index.ts` with the design decision 2 direction on its first line, `export *` for fully public modules and explicit lists for `shared/cursors.ts`, `delivery/public.ts` and `media/catalog.ts` (design decision 3); remove `packages/db/src/sql-content.ts` from `scripts/oversized-source-baseline.json`; verify only `index.ts` remains as a production module at the `db` `src/` root, no `db` module exceeds 1,000 lines, the module graph has no cycle including type imports, and `node scripts/check-boundaries.mjs` passes.

## 5. `@lacecms/db` tests

- [x] 5.1 Split `db` `index.test.ts` into the design decision 10 companions, moving `syncWriteDatabase` and the block-migration helpers with their only users, and `git mv` `collection-list-sql.test.ts` with its `__snapshots__/` into `content/`; verify `index.test.ts` keeps only the package identity case, the stripped sorted `vitest list` names equal the task 1.1 baseline plus the drift cases, the collection-list snapshot is reused without being rewritten, and `pnpm --filter @lacecms/db typecheck` passes.
- [x] 5.2 Make the `platform-cloudflare` Worker-safety case read every production `.ts` file under `packages/db/src` recursively (design decision 10); verify it passes, and that a temporary `import "node:fs"` in one moved `db` module makes it fail (then restore).

## 6. `@lacecms/config`

- [x] 6.1 Create `shared/errors.ts`, `shared/assertions.ts` and `models/types.ts`, then `models/routes.ts`, `models/fields.ts`, `models/common.ts`, `models/seo.ts`, `models/list-options.ts` and `models/define.ts` (design decision 6); verify `pnpm --filter @lacecms/config test`, `typecheck` and `type-test` pass.
- [x] 6.2 Create `structure/hash-input.ts`, `structure/canonical.ts` and `configuration/define-config.ts`; reduce `index.ts` to `packageName`, the direction line, explicit runtime and public type re-exports from `models/types.ts`, excluding internal `CommonModelInput`; verify the package suite passes with `config.projection.fixture.json` hashes unchanged.
- [x] 6.3 `git mv` `config.fixture.ts` and `config.projection.fixture.json` to `src/test-support/`, update the test URLs and imports, and reduce `tsconfig.json` `include` to `src/index.ts`; remove `packages/config/src/index.ts` from `scripts/oversized-source-baseline.json`; verify only `index.ts`, `index.test.ts`, `index.type-test.ts` and `packaged-exports.packaged.test.mjs` remain at the `config` `src/` root, no module exceeds 1,000 lines, the module graph is acyclic, and `node scripts/check-boundaries.mjs` passes.

## 7. Equivalence

- [x] 7.1 Clean both `dist/` directories, rebuild, and run the design decision 9 comparisons: runtime keys, declaration names, `vitest list` names, `drizzle-kit export` hash and `api-v1.json` hash; verify every comparison matches (with only the drift cases added), no stale module remains in either `dist/`, and record the results in `verification.md`. Delete the raw scratch outputs.

## 8. Documentation

- [x] 8.1 Update `docs/refactoring-roadmap.md`: the RF4E text records the `db` and `config` layouts, the three corrections and the `schema.ts` outcome; add Session RF4F (`test-utils` contract, store and security-contract split, owning the seven remaining `test-utils` baseline entries) to the RF4 step and the §4 overview; change the RF5A target to `packages/db/src/security/rows.ts`; update the §3 `sql-content.ts` and oversized-files rows (13 → 11) and add a `config/src/index.ts` row; add the RF4E proposal and implementation progress rows; verify `pnpm exec vitest run tests/docs-links.test.mjs` and `pnpm format:check` pass.
- [x] 8.2 Update architecture §16 to name the column-list drift test and `pnpm db:check`, and the `pnpm lint` row of `docs/verification.md` to mention the schema check; verify `pnpm exec vitest run tests/docs-links.test.mjs` and `pnpm format:check` pass.

## 9. Gates

- [x] 9.1 Run `pnpm typecheck`, `pnpm lint` (includes `db:check`), `pnpm format:check`, `pnpm build`, `pnpm test` (includes `test:packaged`), `pnpm openapi:check`, `pnpm spec:validate` and `pnpm exec openspec validate rf04e-db-config-module-split --type change --strict`; verify all pass, with root and per-package case counts equal to the baseline plus the drift cases.
