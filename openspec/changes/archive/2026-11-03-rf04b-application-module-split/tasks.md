## 1. Baseline

- [x] 1.1 Build `@lacecms/application` and record, in `verification.md`, the design decision 8 export-surface list (names with value/type meaning from `dist/index.d.ts`, `Object.keys` of `dist/index.js`) and `pnpm --filter @lacecms/application exec vitest list` titles per file (expected 131 in 18 files); verify the recorded lists exist in the session scratchpad and the counts match.

## 2. Shared and ports

- [x] 2.1 Create `shared/brands.ts`, `shared/pagination.ts`, `shared/limits.ts`, `shared/actors.ts`, `shared/text.ts` and `shared/permissions.ts` from the `index.ts` ranges of design decision 1, re-exported from `index.ts`; verify the package suite and `tsc -p packages/application/tsconfig.json --noEmit` pass.
- [x] 2.2 Create `ports/infrastructure.ts`, `ports/links.ts` (link vocabulary moved from `internal-links.ts`), `ports/content.ts` (including the collection-query shape moved from `collection-queries.ts`), `ports/media.ts` and `ports/builds.ts`; update the modules that lost types to import them back; verify the package suite and package typecheck pass.
- [x] 2.3 Create `ports/security.ts` with the account record and result types and `AccountSecurityPort` moved from `accounts.ts`, `UserProfileReader` moved from `email.ts`, and the decision 4 split into `AccountSecurityPort`, `SessionSecurityPort`, `TokenSecurityPort` and the composed `SecurityService`; narrow `AccountUseCasesInput.security` to `UserProfileReader & AccountSecurityPort & SessionSecurityPort`; verify the package suite passes and root `pnpm typecheck` passes for `platform-node`, `platform-cloudflare`, `server`, `auth` and `test-utils` with no edits outside `application`.
- [x] 2.4 Add `src/ports/security.type-test.ts` (decision 9) and include `src/**/*.type-test.ts` in `tsconfig.test.json`; verify `pnpm --filter @lacecms/application typecheck` passes, and that moving `deleteSession` into `AccountSecurityPort` as well, or typing the `AccountUseCases` fixture without the session port, makes it fail (then restore).
- [x] 2.5 Confirm `index.ts` now holds only `packageName`, the pass-through and module re-exports, and the helper functions that step 3 moves (`withPublishedProjection`, `publishedProjectionBlockData`, the build-export page helpers, the import-token helpers and the retry policies), and remove its entry from `scripts/oversized-source-baseline.json`; verify it is under 1,000 lines and `node scripts/check-boundaries.mjs` passes.

## 3. Content, media, accounts, builds and outbox

- [x] 3.1 Move the content modules: `git mv` `content-authority.ts` → `content/authority.ts`, `collection-queries.ts` → `content/collection-queries.ts`, `internal-links.ts` → `content/internal-links.ts`; create `content/published-projection.ts` from the `index.ts` helpers; split `content-use-cases.ts` into `content/use-case-inputs.ts`, `content/draft-normalization.ts` and `content/use-cases.ts` (`git mv` to the last); move the six content test files per decision 7; remove the `content-use-cases.ts` baseline entry; verify the package suite passes and `check-boundaries` passes.
- [x] 3.2 `git mv` `media-use-cases.ts` → `media/use-cases.ts` and `image-container.ts` → `media/image-container.ts` with their tests per decision 7; verify the package suite passes.
- [x] 3.3 `git mv` `accounts.ts` → `accounts/use-cases.ts`, `email.ts` → `accounts/email.ts`, `oauth.ts` → `accounts/oauth.ts`; create `accounts/import-tokens.ts` from the `index.ts` helpers; move the three account test files per decision 7; verify the package suite passes.
- [x] 3.4 Create `builds/export-pages.ts` from the `index.ts` helpers, `git mv` `site-build-use-cases.ts` → `builds/use-cases.ts` and `site-build-tracker.ts` → `builds/tracker.ts`, create `outbox/retry-policy.ts` from the `index.ts` policies and `dispatcherRetryDelay`, and `git mv` `dispatchers.ts` → `outbox/dispatchers.ts`; move `site-build.test.ts` and `build-export.test.ts` per decision 7; verify the package suite passes.

## 4. Configuration cluster

- [x] 4.1 Create `configuration/limits.ts` and `configuration/types.ts` from the evolution, migration and sync type ranges of decision 1 (with `ConfigurationSyncLinkRewrite`); point the five `configuration-*` modules at them; verify the package suite and package typecheck pass.
- [x] 4.2 `git mv` `configuration-evolution.ts`, `configuration-migration.ts`, `configuration-fields.ts` and `configuration-links.ts` to `configuration/evolution.ts`, `migration.ts`, `fields.ts` and `links.ts`, with the evolution, migration and visibility tests per decision 7; verify the package suite passes.
- [x] 4.3 Split the rest of `configuration-sync.ts` verbatim into `configuration/plan-support.ts`, `configuration/decisions.ts`, `configuration/plan.ts` (`git mv` target), `configuration/report.ts` and `configuration/apply.ts`, move `configuration-sync.test.ts` to `configuration/plan.test.ts`, and remove the `configuration-sync.ts` baseline entry; verify the package suite and `check-boundaries` pass.
- [x] 4.4 Rewrite `decideEvolution` in `configuration/decisions.ts` as the decision 5 precedence prelude plus the `StructuralChangeKind`-keyed table, without changing diagnostics, order or result shape; verify all 59 configuration cases pass unchanged and that deleting the `field-removed` table entry makes a `configuration/plan.test.ts` or `configuration/evolution.test.ts` case fail (then restore).

## 5. Entry and checks

- [x] 5.1 Finalize `index.ts` as explicit per-directory re-export groups headed by the decision 3 direction comment, with `export *` only for modules whose whole content is public; verify `ls packages/application/src/*.ts` shows only `index.ts` and `index.test.ts`, `index.ts` declares nothing but `packageName`, and no non-test module exceeds 1,000 lines.
- [x] 5.2 Run the decision 8 export-surface script and acyclicity/direction script; verify the export list equals the baseline plus exactly the types `SessionSecurityPort` and `TokenSecurityPort`, no internal helper is exported, and no module cycle, upward edge or edge between use-case directories exists; record both results in `verification.md`.
- [x] 5.3 Run `pnpm --filter @lacecms/application build`, `test:packaged` and `vitest list`; verify the packaged export case passes unchanged and the sorted title list equals the task 1.1 baseline (131 cases).

## 6. Documentation

- [x] 6.1 Rewrite `docs/mvp-architecture.md` §15 *Infrastructure ports* from the real interfaces per decision 10; verify each shown signature matches its declaration in `packages/application/src/ports/*` and the root documentation link guard passes.
- [x] 6.2 Update `docs/refactoring-roadmap.md`: RF4B text records the content-use-cases split, the port membership and the decision table; the §3 baseline row for `configuration-sync.ts` and the oversized-files row show the RF4B result (18 → 15 baselined); add the RF4B progress-log row; verify `pnpm format:check` passes.

## 7. Gates

- [x] 7.1 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test`, `pnpm exec vitest run --config vitest.verification.config.mjs --project cross-runtime` and `pnpm exec openspec validate rf04b-application-module-split --type change --strict`; verify all pass with root and per-package case counts equal to the baseline.
