## 1. Baseline

- [x] 1.1 Record in `verification.md`:
  - the export map of every package manifest (JSON, sorted by package);
  - the `vitest.shared.mjs` alias entries;
  - the failing result of `pnpm --filter @lacecms/app-admin test` and of
    `tsc -p` for one `tsconfig.test.json` in a clean detached worktree with no
    `dist/` (design D6);
  - wall time of root `pnpm typecheck` with a warm Turbo cache disabled
    (`--force`);
  - test counts per member from `pnpm test`.

  Verify the raw lists exist in the session scratchpad and the worktree is
  removed.

## 2. Source condition and test runners

- [x] 2.1 Add the first `@lacecms/source` condition to every `dist/` export of the 17
  package manifests, and convert the four `.astro` strings to
  `{ source, default }` (design D1). Verify:
  - every `@lacecms/source` path exists;
  - `pnpm build` and every `test:packaged` pass unchanged.
- [x] 2.2 Replace `workspaceAliases` in `vitest.shared.mjs` with the
  `sourceCondition()` plugin that resolves workspace specifiers through their
  declared `@lacecms/source` condition (design D2), add its
  `vitest.shared.d.mts` declaration, and delete the alias table. Verify:
  - every member `test` passes with the same counts as the baseline;
  - the astro config still resolves `@lacecms/astro/*.astro` to `src/` (a
    test asserts the resolved path);
  - `grep workspaceAliases` finds nothing outside archived changes.
- [x] 2.3 Make `apps/admin/vite.config.ts` add the `sourceCondition()`
  plugin only in test mode. Verify:
  - admin unit tests pass;
  - `vite build` output for admin is byte-identical to the baseline build
    (hash of `apps/admin/dist`);
  - one test asserts that `@lacecms/contracts` resolves to `src/`.

## 3. Type-checking

- [x] 3.1 Add `customConditions: ["@lacecms/source"]` to the 19 `tsconfig.test.json`,
  the 4 `tsconfig.type-test.json` and `apps/admin/tsconfig.json` (design D3).
  Keep the extra build dependencies of `@lacecms/app-admin#typecheck` in
  `turbo.json` for the `block-order` end-to-end test. Fix any source type
  error surfaced in a dependency, without excluding files or loosening
  options. Verify:
  - root `pnpm typecheck` passes;
  - the `scripts/test-typecheck-baseline.json` entries are unchanged.

## 4. Release and guard

- [x] 4.1 Add `withoutSourceCondition` to `scripts/release-artifacts.mjs` and
  apply it in `preparePackages` (design D4). Verify that
  `tests/release-artifacts.test.mjs`:
  - shows that each real manifest's stripped export map equals its baseline
    map from 1.1;
  - collapses a single-`default` object;
  - shows `inspectPackage` refusing a `./src/` export with
    `Invalid export path`.
- [x] 4.2 Add the `@lacecms/source` condition rule to `scripts/check-boundaries.mjs`
  (design D5). Verify that `tests/boundaries.test.mjs` fixtures fail for:
  - a missing condition;
  - a condition that is not first;
  - a missing source file;
  - a source file whose name does not match the `dist/` target.

  The real workspace must pass `node scripts/check-boundaries.mjs`, which
  root `pnpm lint` runs.

## 5. Documentation and verification

- [x] 5.1 Update architecture *Source tests and packaged output* and §6
  *Source layout*, and `DEVELOPMENT.md`: the `@lacecms/source` condition replaces the
  shared aliases, and test typecheck needs no build. Verify that the docs link
  test and the root-scripts catalog test pass.
- [x] 5.2 In a clean detached worktree with no `dist/`, run:
  - `pnpm --filter @lacecms/app-admin test`;
  - `pnpm --filter @lacecms/content test`;
  - `tsc -p` for every test and type-test project.

  All must pass. Record the results and remove the worktree.
- [x] 5.3 Run root `pnpm typecheck` (record wall time against the
  baseline), `pnpm lint`, `pnpm format:check`, `pnpm test` and
  `pnpm openapi:check`, then run
  `pnpm exec openspec validate rf09a-source-export-condition --type change
  --strict`. Record the results and deviations in `verification.md`, and
  update the roadmap progress row.
