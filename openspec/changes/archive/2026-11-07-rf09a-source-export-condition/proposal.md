## Why

Roadmap step RF9 (test foundation), session RF9A. It must land before RF5,
which rewrites ports and security errors under tests that must already
resolve from source.

Today source resolution for tests is uneven:

- Package Vitest configs resolve `@lacecms/*` through an alias table in
  `vitest.shared.mjs`. The table maps each package name to `src/index.ts` and
  adds four hand-written subpath entries. It already misses
  `@lacecms/test-utils/filter-parity`.
- The admin application (`apps/admin`, 198 unit test files) does not use that
  table. Its tests import `@lacecms/content`, `@lacecms/contracts` and
  `@lacecms/test-utils` (including two subpaths) from `dist/`. So
  `pnpm --filter @lacecms/app-admin test` fails on a clean checkout.
- Every `tsconfig.test.json` (19) and `tsconfig.type-test.json` (4) resolves
  sibling packages through their `exports` to `dist/*.d.ts`. Test
  typecheck therefore needs a full dependency build.

Owner decision (2026-11-05): a source export condition replaces the alias
table. The roadmap left one question for the specification: does release
preparation strip the condition? This change settles it. Release preparation
strips it, so published manifests stay exactly as they are today. Owner
decision (2026-11-07): the condition is named `@lacecms/source`, because
third-party packages (`eventsource`, `eventsource-parser`) already declare a
bare `source` condition that TypeScript and Node would then follow.

## What Changes

- Every Lace package export that points into `dist/` gains a first `@lacecms/source`
  condition naming its source module, including the subpaths
  (`platform-node/test`, `test-utils/visibility-parity` and `filter-parity`,
  the `astro` `.astro` components).
- `vitest.shared.mjs` drops `workspaceAliases` and adds a plugin that
  resolves workspace package specifiers through their declared
  `@lacecms/source` condition. Vite and Vitest default conditions stay
  untouched. The admin Vite config applies the plugin in test mode only. The
  admin dev server and production build keep resolving `dist/`.
- Every `tsconfig.test.json`, every `tsconfig.type-test.json` and the admin
  `tsconfig.json` set `customConditions: ["@lacecms/source"]`. Production
  `tsconfig.json` files keep resolving `dist/`, because they emit and their
  `rootDir` is `src`.
- The four extra admin typecheck builds stay in `turbo.json`: the
  `block-order` end-to-end test imports built application, config, domain and
  platform-node output by relative path on purpose.
- Release preparation removes every `@lacecms/source` condition from the staged
  manifests before packing. A condition object left with only `default`
  collapses back to its string. Packed manifests therefore equal today's.
  Archive inspection keeps refusing any export that points outside compiled
  output.
- The boundary checker requires the `@lacecms/source` condition on every
  `dist/`-targeted export. The condition must come first and must name the
  existing source module the target is built from.
- Non-goals: no change to packaged-output tests, root `tests/` imports of
  `dist/`, Astro site or docs builds, Turbo test inputs (RF9B) or published
  package contents.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-governance`: *Package tests run from source and packaged output
  separately*. Resolution goes through a declared `@lacecms/source` export condition
  instead of a shared alias table. It covers the admin application and test
  typecheck, and the boundary checker enforces the condition.
- `alpha-release-artifacts`: *Packed artifacts are complete external
  packages*. Packed manifests carry no `@lacecms/source` condition and no export
  outside compiled output.

## Impact

- Architecture §6 *Source layout* and §4.8 (spec-driven delivery). No
  runtime invariant changes. Architecture §6 gains one sentence on the
  `@lacecms/source` condition.
- Code and configuration: 17 package manifests, `vitest.shared.mjs`,
  `apps/admin/vite.config.ts`, 19 `tsconfig.test.json`, 4
  `tsconfig.type-test.json`, `apps/admin/tsconfig.json`,
  `scripts/release-artifacts.mjs`, `scripts/check-boundaries.mjs`, a
  `vitest.shared.d.mts` declaration, and tests
  `tests/release-artifacts.test.mjs` and `tests/boundaries.test.mjs`. The
  root manifest is unchanged.
- Contributors: test and test typecheck no longer need a build. Production
  typecheck and packaged tests still build.
- Dependencies: RF4X guards (archived). Followed by RF9B.
