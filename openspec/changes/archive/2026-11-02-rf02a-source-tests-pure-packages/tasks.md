## 1. Shared infrastructure

- [x] 1.1 Record the baseline: run `pnpm exec vitest list | grep -c " > "` in `content`, `config`, `domain`, `contracts`, `render`, `sdk` and `astro` and note the counts (expected 97, 50, 22, 90, 41, 86, 60) in the change's verification note.
- [x] 1.2 Add root `vitest.shared.mjs` exporting `workspaceAliases`, `sharedTestConfig(extra)` (aliases, `include: ["src/**/*.test.ts"]`) and `packagedTestConfig(extra)` (`include: ["src/**/*.packaged.test.mjs"]`, no aliases) per design decisions 1 and 2; verify `node --input-type=module -e "import('./vitest.shared.mjs').then(m => console.log(m.workspaceAliases.length))"` prints the member count plus three subpath entries.
- [x] 1.3 Update `turbo.json` (`test` depends on nothing; new `test:packaged` depends on `build` and `^build`) and the root `test` script to `turbo run test test:packaged --concurrency=2 -- --maxWorkers=2 && vitest run tests …`; verify `pnpm exec turbo run test --dry-run=json --filter @lacecms/content` lists no build dependency.
- [x] 1.4 Add the interim `pnpm run build &&` prefix to the `test` script of every package outside this session's scope whose tests import `dist/` (`application`, `db`, `auth`, `server`, `mcp`, `test-utils`, `platform-node`, `platform-cloudflare`, `cli`, `apps/builder`, `apps/site`; `create-lace` and `apps/api` already have it); verify `pnpm test` passes end to end.

## 2. Boundary checker

- [x] 2.1 Implement the exclusion in `scripts/check-boundaries.mjs` per design decision 4: skip `*.test.ts`, `*.test.tsx` and member-local `src/test-support/**` before import/re-export checks and graph construction; keep every production import rule and cycle check, and keep admin source-structure checks unchanged. Verify `node scripts/check-boundaries.mjs` passes on the current tree.
- [x] 2.2 Add fixtures `tests/fixtures/boundaries/test-imports` and `test-source-path` plus cases in `tests/boundaries.test.mjs`: verify excluded `.test.ts`, `.test.tsx` and test-support files can import the runner, Node builtins, Lace packages outside the runtime graph and relative source/fixture paths without adding cycle edges. Verify equivalent forbidden imports and cycles in production modules still fail naming the violation. Include the Astro test patterns (`@lacecms/content`, `registry/`, `test-fixtures/`) without relocating existing tests.

## 3. Pure packages

- [x] 3.1 `content`: rename `src/index.test.mjs` and `src/conditional-fields.test.mjs` to `.test.ts` importing `./index.js` (and the sibling module under test), add `vitest.config.mjs` (`sharedTestConfig()`), `vitest.packaged.config.mjs`, `tsconfig.test.json`, `packaged-exports.packaged.test.mjs` with the literal export list, and scripts `test`, `test:watch`, `test:packaged`, `typecheck` (both configs); verify `rm -rf packages/*/dist && pnpm --filter @lacecms/content test` passes with 97 cases and `pnpm --filter @lacecms/content typecheck` passes.
- [x] 3.2 `config` (`index.test.mjs`): same conversion; verify 50 cases from source without `dist/` and typecheck passes.
- [x] 3.3 `domain` (`index.test.mjs`): same conversion; verify 22 cases and typecheck.
- [x] 3.4 `contracts` (`index.test.mjs`, `tolerant.test.mjs`): same conversion; verify 90 cases and typecheck.
- [x] 3.5 `render` (`src` tests): same conversion, keeping `tsconfig.type-test.json`; verify 41 cases and typecheck.
- [x] 3.6 `sdk` (four test files): same conversion; verify 86 cases and typecheck.
- [x] 3.7 `astro` (six test files, `vitest.config.mjs` with `getViteConfig` + `workspaceAliases` + `@lacecms/astro` → `./src/index.ts`, `.astro` subpaths → `./src/`): same conversion; packaged test also asserts the four `.astro` files exist in `dist/`; verify 60 cases from source with `packages/render/dist` absent, and typecheck.
- [x] 3.8 Replace the three relative `dist/` cross-package imports (`../../content/dist/index.js`, `../../config/dist/index.js`, `../../../packages/test-utils/dist/index.js`) with package specifiers wherever they occur in this session's packages, and note the remaining ones for RF2C; verify `grep -rn "\.\./\.\./[a-z-]*/dist" packages/{content,config,domain,contracts,render,sdk,astro}` returns nothing.
- [x] 3.9 Count `// @ts-nocheck` headers added in this session; verify the count is zero or each carries a `TODO(rf2)` comment listed in the verification note.

## 4. Documentation and gates

- [x] 4.1 Update `docs/mvp-architecture.md` §6 rules (full test/test-support import-check exclusion, unchanged production rules and admin structure checks) and §20 (source tests, packaged tests, watch), `DEVELOPMENT.md` Verification section (per-package `test`, `test:watch`, `test:packaged`) and `docs/verification.md` Commands section; verify `pnpm test` (root link guard and script catalog) passes.
- [x] 4.2 Run `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm build`, `pnpm test` and `pnpm spec:validate`; verify all pass and the seven packages report their baseline case counts plus one packaged case each.
- [x] 4.3 Measure and record in the verification note: wall time of `pnpm --filter @lacecms/content test` before (with build) and after, and of `pnpm test` before and after; add the progress-log row to `docs/refactoring-roadmap.md`.
