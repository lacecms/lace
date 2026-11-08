## 1. Baseline

- [x] 1.1 Record the runtime export keys and sorted `dist/index.d.ts` declaration names of `@lacecms/platform-node`, `@lacecms/platform-cloudflare` and `@lacecms/db`, the test-title multisets of both `repository-contract.test.ts` files, `d1-content-repository.test.ts` and `tests/d1-http-budgets.acceptance.mjs`, and the line counts of both repository files; run `repository-contract` on SQLite file, SQLite memory and D1 plus the D1 budget tests green as the comparison point.

## 2. Shared reader

- [x] 2.1 Create `packages/db/src/reads/content-reader.ts` with `SqlReadStatement`, `ContentReadSql` and an empty `SqlContentReader(sql, resolveModel)` that delegates the three link reads to an internal `SqlContentLinkReader` (design D1); add the `reads` directory to the `db` entry header and `scripts/source-layout.json`, export it from the entry and add the names to the db packaged export pin. Add `repository/sql.ts` to both platforms (`nodeContentReadSql` with `bindChunk` 200 and a transactional `readGroups`; `d1ContentReadSql` with `D1_MAX_BOUND_PARAMETERS` and two `batch()` calls) and make each repository construct one reader and delegate `resolveLinkTargets`, `listLinkTargets` and `readLinkImpact` to it. Verify db tests, the boundary checker and `repository-contract` on all three databases.

## 3. Move reads (roadmap order; after each task run `repository-contract` on SQLite file, SQLite memory and D1)

- [x] 3.1 Move `listMedia` with the single-row media reads it shares helpers with (`loadMedia`, `loadMediaMany`, `loadMediaCatalogItem`, `loadPublicMedia`, `loadDeletingMedia`) into the reader; both repositories delegate, and write paths that call `this.loadMedia` reach the reader.
- [x] 3.2 Move `loadSnapshots`, `hydrate` and `loadEntry` (with a private entry-row read) into the reader; D1 write paths call the reader's `loadEntry`, both repositories keep `entryRow` for write guards, and Node keeps its synchronous loader for write paths only (design D3).
- [x] 3.3 Move `publicMedia`, `loadPublic`, `loadPublicGlobal` and `publishedContentVersion`.
- [x] 3.4 Move `describeActors`, using `bindChunk` for its identifier groups.
- [x] 3.5 Move `listPublic`.
- [x] 3.6 Move `loadMediaUsage` and `listMediaTags`.
- [x] 3.7 Move `exportBuildContentPage` on the two-group protocol (design D2); add a typed `reads/content-reader.test.ts` with a fake `ContentReadSql` covering one `readGroups` call per page, cursor-version mismatch before group two, re-read mismatch after group two, and chunking by `bindChunk`. Also run the D1 budget tests and `d1-content-repository.test.ts`.
- [x] 3.8 Move `listSiteBuilds`, `getSiteBuild` and the thin delegations `load`, `loadDraft`, `loadPublished`; confirm with `rg` that no repository read body other than `list`, the configuration-sync reads and Node's synchronous write-path loader remains in either platform.

## 4. Node package layout

- [x] 4.1 Move `NodeDatabase`, `openNodeDatabase`, `AppliedMigration`, `listAppliedMigrations` and `migrateNodeDatabase` from `index.ts` to `database/connection.ts` and `host-database-safety.ts` to `database/`; point `migrate.ts`, `runtime.ts` and the repository at them. Verify the boundary checker reports no `platform-node` cycle and `migrate.test.ts` plus `migration-executable.packaged.test.mjs` pass.
- [x] 4.2 Split `content-repository.ts` into `repository/{base,configuration-sync,entries,media,dispatch,site-builds,repository}.ts` (design D3) with verbatim method moves; check with `git diff --color-moved`; run Node `repository-contract` (file and memory), `index.test.ts` and the product tests.
- [x] 4.3 Move the remaining modules into `security/`, `media/`, `builds/` and `runtime/` (design D4), move `image-inspector-pass-through.test.ts` to `media/`, change `scripts/platform-release-version.mjs` and its two root tests to `src/runtime/release-version.ts`, update `scripts/fixtures/oauth-mcp/compat.test.mjs` to `dist/security/{oauth,service}.js`, write the entry header, declare the package in `scripts/source-layout.json`, list `src/migrate.ts` in `scripts/source-root-entries.json` and remove the `platform-node` component from `scripts/source-cycle-baseline.json`. Verify the boundary checker, package typecheck, Node tests and the packaged export pin.

## 5. Cloudflare package layout

- [x] 5.1 Split `d1-content-repository.ts` into `repository/{batch,base,configuration-sync,entries,media,dispatch,site-builds,repository}.ts` (design D3) with verbatim method moves; check with `git diff --color-moved`; run D1 `repository-contract`, `d1-content-repository.test.ts`, `d1-sync-batch.test.ts` and the D1 budget tests.
- [x] 5.2 Move the remaining modules into `d1/`, `security/`, `media/`, `deploy/` and `runtime/` (design D4), update `scripts/fixtures/oauth-mcp/compat.test.mjs` and `baseline.mjs` to `dist/security/{oauth,service}.js`, write the entry header and declare the package in `scripts/source-layout.json`. Verify the boundary checker, package typecheck, Cloudflare tests including `worker.test.ts`, the packaged tests and the OAuth MCP compatibility test.

## 6. Verification and documentation

- [x] 6.1 Remove both repository entries from `scripts/oversized-source-baseline.json` and compare against task 1.1: platform runtime keys and declaration names identical; db differs only by the reader names; contract and budget test titles identical; every production module of both platforms under 1,000 lines; no size, cycle or typecheck baseline grows. Run `pnpm build`, `pnpm test` and the boundary checker.
- [x] 6.2 Update the RF5B section, the §3 size and duplication rows, the RF4X layout row and the progress log in `docs/refactoring-roadmap.md` with module ownership, line counts and the residual Node synchronous loader; run `pnpm exec vitest run tests/docs-links.test.mjs`.
- [x] 6.3 Run root `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm exec openspec validate rf05b-shared-content-reader --type change --strict`; record the results in `verification.md` and resolve failures before completion.
