## Context

See proposal.md for motivation. Facts (commit `8e47b9b6`):

- 159 package-level `*.test.mjs` files; 112 import `../dist/*.js`; the rest
  import other packages by name (`@lacecms/content` ×24, `@lacecms/config`
  ×21, `@lacecms/domain` ×17, `@lacecms/test-utils` ×12…), which resolve
  through `node_modules` symlinks to each package's `dist/index.js`. Three
  tests import another package's `dist/` by relative path
  (`../../content/dist/index.js`, `../../config/dist/index.js`,
  `../../../packages/test-utils/dist/index.js`).
- Package `tsconfig.json` files include only `src/index.ts` (compiled
  transitively), so test files are outside `pnpm typecheck` today.
- `tsconfig.base.json` is strict (`strict`, `exactOptionalPropertyTypes`,
  `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `NodeNext`); library
  packages set `types: []`.
- `scripts/check-boundaries.mjs` scans `.ts/.tsx/.mts/.cts/.astro` under each
  package's `src/` and applies `externalImportAllowlist` (mcp, application,
  render, sdk), the Node-builtin ban for content/config and
  `allowedDependencies` to every file; `.mjs` tests are invisible to it.
  `@lacecms/test-utils` is not in any runtime package's allowed set.
- `packages/astro/vitest.config.mjs` uses Astro's `getViteConfig` and aliases
  `@lacecms/render` and `@lacecms/astro` to `dist/`; `.astro` components live
  in `src/` and are copied to `dist/` by `copy-components.mjs`.
- `tests/root-scripts.test.mjs` requires every root script to have one row
  in the `DEVELOPMENT.md` catalog.
- Root `pnpm test` = `turbo run test … && vitest run tests …`; root `tests/`
  files use built output and packed artifacts and are out of scope.
- Vite resolves an import ending in `.js` to a sibling `.ts` when the
  importer is a TypeScript file, so source modules' NodeNext-style
  `./x.js` imports work under Vitest unchanged.

## Goals / Non-Goals

**Goals:**

- `pnpm --filter @lacecms/content test` passes on a clean checkout without
  any `dist/` in seconds; `test:watch` re-runs on save.
- Type errors in tests fail `pnpm typecheck`.
- The pattern is defined once (root config, boundary rule, naming) so RF2B
  and RF2C are mechanical.

**Non-Goals:**

- Faster `pnpm build` or `pnpm typecheck` (both still build dependencies).
- Changing test assertions or splitting test files.

## Decisions

1. **Aliases resolve package specifiers to source; tests never use source
   paths.** `vitest.shared.mjs` exports `workspaceAliases` (array of
   `{ find, replacement }`): `/^@lacecms\/([a-z-]+)$/` →
   `packages/$1/src/index.ts` for every `packages/*` member (apps excluded),
   `@lacecms/platform-node/test` → `packages/platform-node/src/test-actors.ts`,
   `/^@lacecms\/astro\/(\w+\.astro)$/` → `packages/astro/src/$1`,
   `@lacecms/cli/lace-import.schema.json` →
   `packages/cli/schema/lace-import.schema.json`; and `sharedTestConfig(extra)`
   returning `defineConfig` output with those aliases and `test.include:
   ["src/**/*.test.ts"]`. The three relative `dist/` imports become package
   specifiers. Alternative rejected: `vitest.workspace` with projects at the
   root, because `pnpm --filter <pkg> test` and Turbo caching work per
   package.
2. **File naming encodes the kind.** Source tests are `*.test.ts`
   (type-checked); packaged tests are `*.packaged.test.mjs` (plain ESM,
   import `../dist/`). Scripts: `test` = `vitest run`, `test:packaged` =
   `vitest run --config vitest.packaged.config.mjs` where the shared helper
   also exports `packagedTestConfig()` with `include:
   ["src/**/*.packaged.test.mjs"]` and no aliases (packaged tests must see
   `node_modules` resolution exactly as a consumer would). `test:watch` =
   `vitest`. Alternative rejected: a `test/` directory split, because
   colocated tests are the repository convention.
3. **Per-package `tsconfig.test.json`** extends the package `tsconfig.json`
   with `include: ["src/**/*.test.ts", "src/test-support/**/*.ts"]`,
   `compilerOptions: { noEmit: true, types: ["node"] }` (tests use `Buffer`,
   `process`), and `typecheck` runs both configs. Tests resolve
   `@lacecms/*` types through `dist/*.d.ts` (Turbo's `typecheck` already
   depends on `^build`); only `test` is build-free. Strict settings stay; a
   test file that cannot be typed within the session gets a file-level
   `// @ts-nocheck` with a `TODO(rf2)` comment and the count is reported in
   the progress log (target for RF2A: zero).
4. **Boundary exemption is narrow.** In `checkBoundaries`, a file matching
   `testFilePattern` or under `src/test-support/` skips the
   `externalImportAllowlist` check and the content/config Node-builtin ban
   only for specifiers `vitest`, `node:*` and `@lacecms/test-utils`;
   `allowedDependencies` is checked for every other `@lacecms/*` target;
   source-path imports stay forbidden. `@lacecms/test-utils` does not enter
   the dependency graph used for cycle detection. Fixtures: `test-imports`
   (allowed) and `test-source-path` (rejected) under
   `tests/fixtures/boundaries`.
5. **Packaged smoke test shape.** `packaged-exports.packaged.test.mjs`:
   `expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([...])`
   with the literal list; for `astro` it also reads each declared `.astro`
   subpath from `dist/`. The literal list is the contract; snapshot files
   were rejected because they hide the export list from review.
6. **`turbo.json`**: `test: { dependsOn: [] }`, `test:packaged: {
   dependsOn: ["build", "^build"] }`; root `test` script becomes
   `turbo run test test:packaged --concurrency=2 -- --maxWorkers=2 && vitest run tests …`.
   Packages not yet converted (RF2B/RF2C scope) keep importing `dist/` in
   their `test` task; until their session, their `package.json` `test`
   script gains an explicit `pnpm run build &&` prefix only where Turbo no
   longer builds for them. Checked in tasks: with `test` build-free, those
   packages' tests must still pass in `pnpm test` because `test:packaged`
   of upstream packages runs in the same invocation; Turbo orders by task
   graph, not by script name, so the prefix is required for correctness in
   the interim.
7. **Astro package.** `vitest.config.mjs` keeps `getViteConfig` and takes
   `workspaceAliases` plus `@lacecms/astro` → `./src/index.ts`; `.astro`
   tests compile components from `src/`.

## Risks / Trade-offs

- [Interim double build for unconverted packages] RF2B/RF2C packages build
  inside their `test` script until converted → accepted for two sessions;
  removed in RF2C.
- [Type-check cost] `tsconfig.test.json` adds a second `tsc` per package →
  tests are small relative to sources; measured in tasks.
- [Alias masks a broken package entry] Source aliases bypass `exports`
  maps → the packaged smoke test imports through `node_modules` and the
  root `tests/` suite still uses built output.
- [Vite `.js`→`.ts` resolution for `.mjs` importers] Not supported → all
  source tests are `.ts`; packaged tests import `dist/*.js` only.

## Migration Plan

One change on a branch; revert to roll back. No runtime effect.
