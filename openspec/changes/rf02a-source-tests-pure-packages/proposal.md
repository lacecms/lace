## Why

Every package test imports `../dist/*.js`, `turbo.json` makes `test` depend
on `build` and `^build`, and no package has a watch script: a one-line change
in `packages/content` rebuilds content, application, both platforms and the
CLI before a single CLI unit test runs, and `.test.mjs` files get no type
checking, so a DTO shape error in a test is silent. This is Session RF2A of
[`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md), first
of Step RF2 (tests against source). It lands the shared infrastructure and
proves it on the seven packages with no copy steps and no native
dependencies, so RF2B and RF2C only repeat the pattern.

## What Changes

- **Shared Vitest configuration.** A root `vitest.shared.mjs` exports the
  workspace aliases (`@lacecms/<name>` → `packages/<name>/src/index.ts`,
  plus the subpath exports `@lacecms/platform-node/test`,
  `@lacecms/astro/*.astro` and `@lacecms/cli/lace-import.schema.json`) and a
  base config; each package's `vitest.config.mjs` extends it. Tests of one
  package therefore run the source of every Lace package they import, with
  no build.
- **Source tests become `.test.ts`.** In `content`, `config`, `domain`,
  `contracts`, `render`, `sdk` and `astro`, every `*.test.mjs` becomes
  `*.test.ts` importing the module under test (`./index.js` and siblings)
  and is type-checked by a per-package `tsconfig.test.json` that
  `pnpm typecheck` runs.
- **Packaged output keeps one smoke test per package.** A
  `packaged-exports.packaged.test.mjs` imports `../dist/index.js` (and the
  `.astro` subpath copies for `astro`) and asserts the exact public export
  list, so a packaging regression still fails. Packaged tests are the only
  tests that depend on a build.
- **Turbo pipeline.** `test` depends on nothing; a new `test:packaged`
  task depends on `build` and `^build`; root `pnpm test` runs both before
  the root `tests/` suite. Every package in scope gains `test:watch`.
- **Boundary checker exemption for test files.** `scripts/check-boundaries.mjs`
  excludes `*.test.ts`, `*.test.tsx` and `src/test-support/**` modules from
  import-boundary checks and from the dependency graph used for cycle
  detection. Production modules keep all existing import and cycle rules;
  admin source-structure checks stay unchanged. This lets Astro tests use
  `@lacecms/content`, `registry/` components and local `test-fixtures/`
  without changing the runtime package graph. Fixtures cover skipped test
  imports and equivalent imports still rejected in production modules.
- **Documentation.** Architecture §6 (rules) and §20 (testing strategy),
  `DEVELOPMENT.md` (verification section: how to run one package's tests
  and watch them) and `docs/verification.md` (commands) describe the two
  test kinds.

Non-goals: converting `application`, `db`, `auth`, `server`, `mcp` (RF2B);
platforms, CLI, generator, apps and `test-utils` (RF2C); splitting any test
file; changing any assertion; the root `tests/` suite, which keeps running
after the Turbo tasks and may use built output.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-governance`: a new requirement states that package tests run
  from source through the declared package specifiers and that packaged
  output is verified by a separate build-dependent gate; the dependency
  enforcement requirement gains the full test-file exclusion and scenarios.
  Package-specifier imports remain the test convention; the boundary checker
  does not enforce that convention inside excluded files.

## Impact

- Architecture: §6 rules gain the test-file exemption; §20 describes source
  and packaged tests. No dependency-direction change.
- Code: root `vitest.shared.mjs`, `turbo.json`, root `package.json` `test`
  script, `scripts/check-boundaries.mjs`, `tests/fixtures/boundaries/*`,
  `tests/boundaries.test.mjs`; in the seven packages: `package.json`
  scripts, `vitest.config.mjs`, `tsconfig.test.json`, every test file
  renamed and re-pointed, one packaged smoke test each.
- Baseline to preserve (from `vitest list` on commit `8e47b9b6`): content 97,
  config 50, domain 22, contracts 90, render 41, sdk 86, astro 60 cases
  (446 in total).
- Dependencies: none added. Vitest 5 and Vite 8 already resolve `.js`
  specifiers to `.ts` sources for TypeScript importers.
- CI: `pnpm test` keeps one entry point; wall time drops because the source
  tasks no longer wait for builds.
