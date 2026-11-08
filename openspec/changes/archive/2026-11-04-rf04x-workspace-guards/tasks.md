## 1. Baseline and documentation first

- [x] 1.1 Record in `verification.md` the starting state at the change's base commit:
  - the sorted list of the 143 `@ts-nocheck` files under `packages/*/src` and `apps/*/src`;
  - the per-member strongly connected components from a scratch scan, including `apps/admin`;
  - the 21 missing runner and verification-config paths;
  - the 41 Oxlint warnings by file and rule;
  - sorted `vitest list` names for `@lacecms/contracts`, `@lacecms/db`, `@lacecms/test-utils`, `@lacecms/server`, `@lacecms/app-admin` and `@lacecms/app-builder`;
  - root `pnpm test` file and case counts.

  Verify the lists exist in the session scratchpad and the counts match the design Context.
- [x] 1.2 Document the new enforcement (design decision 8):
  - update architecture §6 *Source layout*, ADR 0020 and `AGENTS.md` *Source layout*;
  - add the RF4X session section under roadmap RF4 before RF4F, a §4 note and the §2 split-session typing rule;
  - verify `pnpm test` still passes the docs link guard and `pnpm spec:validate` passes.

## 2. Typecheck-exception baseline

- [x] 2.1 Remove the directive from `packages/content/src/test-support/content-test-helpers.ts` and `packages/platform-cloudflare/src/test-support/worker-harness.ts`, and type them. Verify:
  - `pnpm --filter @lacecms/content typecheck` and `pnpm --filter @lacecms/platform-cloudflare typecheck` pass;
  - both package `test` suites pass;
  - if typing needs changes outside these files and their local fixture types, stop and revise the change (design decision 1).
- [x] 2.2 Add `scripts/test-typecheck-baseline.json` with the remaining 141 test files, and add the directive scan to `scripts/check-boundaries.mjs` (design decision 1). Verify `node scripts/check-boundaries.mjs` passes on the repository.
- [x] 2.3 Add scratch-repository cases to `tests/boundaries.test.mjs`. Verify each fails or passes with a message naming the file:
  - an unlisted test with the directive fails;
  - a listed test without the directive fails as stale;
  - a listed missing file fails as stale;
  - a test-support module with the directive fails, listed or not;
  - a production module with the directive fails;
  - a listed test with the directive passes.

## 3. Intra-package layout and cycles

- [x] 3.1 Add the per-member file graph and strongly-connected-component cycle check to `scripts/check-boundaries.mjs`, with `scripts/source-cycle-baseline.json` holding the components measured in task 1.1 (design decision 3). Verify `node scripts/check-boundaries.mjs` passes. If `apps/admin` contributes components crossing slices or more than a handful, stop for an owner decision before baselining.
- [x] 3.2 Add `scripts/source-layout.json` for `content`, `application`, `contracts`, `server`, `db` and `config`, transcribed from their entry headers and checked against the measured import graph. Rewrite each entry's first comment into the single `// Directory dependencies:` form (design decision 2). Verify a scratch scan reports no undeclared directory edge, and each package's `typecheck` and `test` pass unchanged.
- [x] 3.3 Add the declared-package checks to `scripts/check-boundaries.mjs`:
  - forbidden directory edge;
  - subdirectory `index` module;
  - root module not mapped from an `exports`/`bin` target;
  - entry header directory set different from the declaration.

  Verify `node scripts/check-boundaries.mjs` passes on the repository.
- [x] 3.4 Add scratch-repository cases to `tests/boundaries.test.mjs`. Verify each fails naming the files, edge or package, and the baselined cases pass:
  - a cycle closed by `import type`;
  - a cycle closed by `export type … from`;
  - a baselined component passes;
  - a grown component fails;
  - a stale component fails;
  - an import against the declared direction fails;
  - a subdirectory barrel fails;
  - an extra root module fails;
  - a header naming an extra or missing directory fails;
  - test files and `test-support` modules forming a cycle stay excluded.

## 4. Verification runners

- [x] 4.1 Add the shared phase helper with root runs and package runs (source or packaged config, per-run JSON report, `assertExecutedTests` on every report), following design decision 4. Cover it in the existing runner tests (`tests/security-resilience-runner.test.mjs`, `tests/operations-verification.test.mjs`, `tests/cross-runtime-runner.test.mjs`). Verify:
  - a run with an empty report fails the phase;
  - a failed run fails the phase;
  - a failed run leaves later phases `not-run`.
- [x] 4.2 Rewrite the `security`, `repositories` and `provider` phases of `scripts/security-resilience-verification.mjs` with the design decision 4 mapping, extending `workspace-build` filters where a packaged run needs them. Verify every named file exists, and that each package run's file list passes when run on its own with `pnpm --filter <member> exec vitest run …`.
- [x] 4.3 Rewrite the `repositories` and `sdk-render-site` phases of `scripts/cross-runtime-verification.mjs`, and make `--baseline` required (remove the deleted default, update the usage text). Verify:
  - each package run passes on its own;
  - `node scripts/cross-runtime-verification.mjs --artifacts x` exits with the usage error before creating a result directory.
- [x] 4.4 Rewrite the `forward-migration-upgrade` phase of `scripts/operations-verification.mjs`. Remove `apps/builder/src/runner.test.mjs` from the `operations` project in `vitest.verification.config.mjs` and add the builder package run to `health-restore-rotation`. Verify each package run passes on its own and `vitest list --config vitest.verification.config.mjs --project operations` lists only root acceptance files.
- [x] 4.5 Update `docs/verification.md` (required `--baseline`, per-run reports) and `docs/content-import.md:47`. Verify the docs link guard passes.

## 5. Root guards for paths, catalog, type tests and lint scripts

- [x] 5.1 Add the static path scan to `tests/root-scripts.test.mjs` (design decision 5), covering the runner files, `vitest.verification.config.mjs` and Markdown commands in `docs/`, `DEVELOPMENT.md` and `README.md`. Verify:
  - it passes on the repository;
  - a scratch copy with a missing runner path fails naming the runner and path;
  - a scratch copy with an unknown package filter fails naming it;
  - a scratch copy with a stale `--config` in Markdown fails naming the document.
- [x] 5.2 Extend the catalog check so every `node scripts/<file>` target appears in its `DEVELOPMENT.md` row and every named path exists. Fix the `db:migrate:node` and `lint` rows, and replace the `TODO(rf2)` sentence with a pointer to the baseline. Verify the root test passes, and a scratch copy with a missing target fails naming the script and path.
- [x] 5.3 Append `&& tsc -p tsconfig.type-test.json` to the `typecheck` scripts of `packages/config` and `packages/domain`, and add the type-test gating check to the root test. Verify:
  - both `typecheck` scripts pass;
  - removing one `@ts-expect-error` target in a scratch copy of config type tests fails typecheck;
  - a scratch manifest without the project in `typecheck` fails the root test naming the member.

## 6. Lint warnings

- [x] 6.1 Remove the unused destructured names and imports in the eleven contracts test files. Verify:
  - `pnpm --filter @lacecms/contracts lint` reports no warnings;
  - the package `test` and `typecheck` pass;
  - the sorted `vitest list` names equal the task 1.1 contracts baseline.
- [x] 6.2 Fix these warnings in code:
  - `no-new-array` in `packages/db/src/shared/write-errors.test.ts`;
  - `no-useless-spread` in `apps/admin/src/shared/api/admin-client.ts`, `packages/server/src/routes/docs.ts`, `packages/test-utils/src/repository-contract/envelope.ts` and `packages/test-utils/src/index.test.ts`;
  - `no-useless-escape` in `packages/auth/src/mcp-actor.ts`;
  - `no-unsafe-finally` in `apps/builder/src/runner-interruption.packaged.test.mjs`.

  Verify each affected package's `lint`, `typecheck` and `test` pass; for the builder file run its `test:packaged`; `vitest list` names are unchanged for touched test files.
- [x] 6.3 Resolve the two `no-control-regex` sites with explicit code-point checks, or with the file-scoped `.oxlintrc.json` fallback (design decision 6). Verify:
  - `content` and `auth` `lint` report no warnings;
  - their existing tests for control-character rejection pass unchanged.
- [x] 6.4 Change every member `lint` script to `oxlint --deny-warnings <dirs>`, and add the root-test check that every member lint script carries the flag. Verify:
  - `pnpm lint` passes with zero warnings;
  - a temporary unused variable in one package makes `pnpm lint` fail (then restore).

## 7. Turbo inputs

- [x] 7.1 Add the design decision 7 inputs to `test` and `test:packaged` in `turbo.json`. Verify:
  - after a cached `pnpm turbo run test --filter=@lacecms/platform-cloudflare --filter=@lacecms/astro`, touching `lace.config.ts` re-runs platform-cloudflare;
  - touching `apps/site/src/fixtures/published-export.json` re-runs astro (cache miss reported), then restore.

## 8. Roadmap, backlog and final gates

- [x] 8.1 Update the roadmap (design decision 8):
  - remove the blank lines in the §6 progress-log table;
  - add the retrospective RF4B "Proposed" row;
  - record the RF4B `AccountSecurityPort` export deviation;
  - correct the RF8A §15 bullet;
  - add the §3 baseline rows (test typecheck exceptions 143 → 141, intra-package cycle components);
  - add the RF4X progress row.

  Update the `backlog.md` refactoring entry. Verify the progress log renders as one table (every row starts with `|` and no blank line separates rows) and the docs link guard passes.
- [x] 8.2 Run the narrowest affected tests, then root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` and `pnpm exec openspec validate rf04x-workspace-guards --type change --strict`. Verify:
  - all pass;
  - root test file count grows only by the new guard cases;
  - existing listed titles match the task 1.1 baselines.

  Record results and the owner-run `verify:*` status in `verification.md`, and delete raw passed-run output.
