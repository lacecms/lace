## 1. Baseline

- [ ] 1.1 Record `pnpm exec vitest list | grep -c " > "` for `test-utils`, `platform-node`, `cli`, `create-lace`, `apps/api`, `apps/builder`, `apps/site` (expected 54, 74, 233, 39, 25, 32, 4) and run `pnpm --filter @lacecms/platform-cloudflare test` once to record its case count; store all in the verification note.
- [ ] 1.2 Capture the 103 contract case names in order (`contentRepositoryContractCases.map(c => c.name)`) into `packages/test-utils/src/repository-contract/case-names.test.ts` as a literal list; verify the test passes before any split.

## 2. test-utils

- [ ] 2.1 Split `src/repository-contract.ts` into `src/repository-contract/{shared,builds,lifecycle,sync,media,globals-seo,envelope,export,conditional,index}.ts` per design decision 1, moving each area's seed helpers with it; verify `case-names.test.ts` passes and `pnpm --filter @lacecms/test-utils typecheck` passes.
- [ ] 2.2 Split `src/index.ts` into `assertions.ts`, `adapters.ts`, `in-memory-content-store.ts` and a re-exporting `index.ts`; verify the built `dist/index.d.ts` export list equals the pre-split list (diff recorded in the verification note).
- [ ] 2.3 Convert `src/index.test.mjs` to `.test.ts`, add configs, `tsconfig.test.json`, packaged smoke test and scripts, remove the interim prefix; verify 54 cases from source and typecheck.

## 3. Platforms

- [ ] 3.1 `platform-node`: convert all 15 test files to `.test.ts` (contract harness imports `@lacecms/test-utils` and `./index.js`), add configs and scripts, remove the interim prefix; verify 74 cases pass with every `packages/*/dist` deleted and typecheck passes.
- [ ] 3.2 `platform-cloudflare`: split `worker.test.mjs` into `worker.test.ts` and `worker-assets.packaged.test.mjs`; convert the other 12 files to `.test.ts`; keep Miniflare serial settings and the 60 s contract-case timeout in `vitest.config.mjs`; add packaged config and scripts; remove the interim prefix; verify the recorded case count from source with `admin/` deleted, `pnpm --filter @lacecms/platform-cloudflare test:packaged` passes after `pnpm build`, and typecheck passes.

## 4. CLI and generator

- [ ] 4.1 `cli`: rename the eleven process-spawning files to `*.packaged.test.mjs`, convert the other 27 to `.test.ts`, add configs, `tsconfig.test.json`, packaged smoke test (export list and `dist/registry` presence) and scripts, remove the interim prefix; verify source cases pass without `dist/`, `test:packaged` passes after build, and the two counts sum to 233.
- [ ] 4.2 `create-lace`: `onboarding`, `quickstart` and `index` → `*.packaged.test.mjs`; `scenario-guides` and `site-modes` → `.test.ts` importing `./index.js`; configs, scripts, remove `pnpm run build &&`; verify source cases pass without `dist/` and the counts sum to 39.

## 5. Apps

- [ ] 5.1 `apps/api`: `worker-bundle` and `worker-smoke` → `*.packaged.test.mjs`; `content-sync`, `index`, `node-server`, `production`, `project-config` → `.test.ts` importing source and `@lacecms/test-utils`; configs, `tsconfig.test.json`, scripts, remove `pnpm run build &&`; verify counts sum to 25 and `grep -rn "packages/test-utils/dist" apps packages` returns nothing.
- [ ] 5.2 `apps/builder`: convert four files to `.test.ts`; configs, scripts, remove the interim prefix; verify 32 cases from source and typecheck.
- [ ] 5.3 `apps/site`: `fixture-build.test.mjs` → `fixture-build.packaged.test.mjs` with `test` running no files and `test:packaged` running it; verify `pnpm test` still runs the fixture build once.

## 6. Gates

- [ ] 6.1 Verify no `package.json` in `packages/` or `apps/` contains `pnpm run build &&` in a `test` script and `turbo run test --dry-run=json` shows no build dependency for any `test` task.
- [ ] 6.2 Update `docs/mvp-architecture.md` §20 (repository contract directory layout), `docs/verification.md` Commands (which tests need a build) and `DEVELOPMENT.md`; count `// @ts-nocheck` headers added in RF2 overall and list them; verify the root link guard passes.
- [ ] 6.3 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test` and `pnpm spec:validate`; verify all pass, every member reports its baseline count split between `test` and `test:packaged`, and record `pnpm test` wall time against the RF2A measurement; add the progress-log row and update the §3 baseline rows (dist-importing tests, `test.dependsOn`, `test:watch` count, `repository-contract.ts` size, `app.test.mjs` size) in `docs/refactoring-roadmap.md`.
