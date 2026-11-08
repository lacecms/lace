# Verification — rf09a-source-export-condition

## 1. Baseline (before implementation, commit `9bc6b220`)

Raw lists were kept in the session scratchpad (`baseline-exports.json`,
`baseline-admin-test.log`, `baseline-tsc.log`, `baseline-typecheck.log`,
`baseline-test.log`, `admin-dist-base.sha`).

- Export maps of the 17 package manifests (compact):

  | Package | Exports |
  | --- | --- |
  | `@lacecms/astro` | `.` `{types,import}`; `./LaceBlocks.astro`, `./LaceImage.astro`, `./LaceSeo.astro`, `./RichText.astro` as `./dist/*.astro` strings |
  | `@lacecms/cli` | `.` `{types,import}`; `./lace-import.schema.json` → `./schema/lace-import.schema.json` |
  | `@lacecms/platform-node` | `.` `{types,import}`; `./test` → `./dist/test-actors.{d.ts,js}` |
  | `@lacecms/test-utils` | `.`, `./visibility-parity`, `./filter-parity` as `{types,import}` into `dist/` |
  | the other 13 | `.` → `{ types: ./dist/index.d.ts, import: ./dist/index.js }` |

  The full JSON is pinned as `tests/fixtures/release-export-maps.json`.
- `vitest.shared.mjs` aliases: one `^<name>$` → `packages/<dir>/src/index.ts`
  per package (17), plus `@lacecms/test-utils/visibility-parity`,
  `@lacecms/platform-node/test` → `src/test-actors.ts`,
  `/^@lacecms\/astro\/(\w+\.astro)$/` → `packages/astro/src/$1` and
  `@lacecms/cli/lace-import.schema.json` → `packages/cli/schema/…`.
  `@lacecms/test-utils/filter-parity` was missing.
- Clean detached worktree of `9bc6b220`, `pnpm install`, no `dist/`:
  - `pnpm --filter @lacecms/app-admin test` failed: 141 of 198 files failed
    (`Failed to resolve import "@lacecms/content"`), 57 passed.
  - `tsc -p packages/server/tsconfig.test.json` failed with TS2307 for
    `@lacecms/application` and `@lacecms/contracts` (70 lines).
- Root `turbo run typecheck --force` (warm machine, no task cache): 4.52 s
  wall, exit 0.
- Member `test` counts (files/tests): application 18/139, app-api 5/22,
  app-builder 4/54, app-docs 1/3, astro 6/79, auth 4/4, cli 27/172,
  config 7/76, content 18/246, contracts 31/168, create-lace 2/43, db 22/30,
  domain 10/28, mcp 1/6, platform-cloudflare 14/219, platform-node 15/311,
  render 1/106, sdk 4/104, server 17/152, test-utils 15/148; admin (main
  checkout, with `dist/`) 198/1008.
- Admin production build: `apps/admin/dist` file hashes recorded.

## 2. Implementation checks

- 2.1 Every `dist/` export of the 17 manifests lists `@lacecms/source` first
  (`./src/<same name>.ts` or `.astro`); the four `.astro` strings became
  `{ "@lacecms/source", default }`. The CLI schema export stays a string.
  Every source path exists (the boundary checker verifies it). `pnpm build`
  and every `test:packaged` passed inside root `pnpm test` (5.3).
- 2.2 `vitest.shared.mjs` exports `sourceCondition()`, a Vite plugin built
  from the manifests' declared conditions, and `sharedTestConfig` adds it;
  `workspaceAliases` is deleted (`git grep workspaceAliases` finds only the
  roadmap log row and archived changes). `vitest.shared.d.mts` types it for
  the admin config. Member counts equal the baseline, plus the new
  `packages/astro/src/source-resolution.test.ts` (astro 7/80), which shows
  `@lacecms/astro/LaceBlocks.astro` and `@lacecms/astro` load the same module
  instances as `./LaceBlocks.astro` and `./index.js`.
- 2.3 The admin config is a function of `mode` and adds the plugin only when
  `mode === "test"`. Admin unit tests 199/1009 (new
  `src/test/source-resolution.test.ts`: `@lacecms/contracts` is the same
  module as `packages/contracts/src/index.ts`; it fails with
  `--mode development`). `vite build` output is byte-identical to the
  baseline (all `apps/admin/dist` hashes equal).
- 3.1 `customConditions: ["@lacecms/source"]` in 19 `tsconfig.test.json`,
  4 `tsconfig.type-test.json` and `apps/admin/tsconfig.json`. Dependency
  sources then surfaced two type errors under consumer options, fixed in
  types only:
  - `packages/server/src/shared/{http,protocol}.ts` used the DOM name
    `HeadersInit`, absent from Node-only test projects; a local
    `ResponseHeaders = ConstructorParameters<typeof Headers>[0]` replaces it.
  - `packages/auth/src/session/better-auth.ts`: under
    `exactOptionalPropertyTypes` (which auth disables for itself) the OAuth
    provider's endpoint metadata is not a `BetterAuthPlugin`; the plugin
    element is asserted `as BetterAuthPlugin` at that boundary.

  Root `pnpm typecheck` passes; `scripts/test-typecheck-baseline.json` is
  unchanged. The extra `@lacecms/app-admin#typecheck` builds stay (see
  deviations).
- 4.1 `withoutSourceCondition` strips the condition at any depth and
  collapses a single-`default` object; `preparePackages` applies it to the
  staged manifest. `tests/release-artifacts.test.mjs` (11 tests): every real
  manifest's stripped map equals `tests/fixtures/release-export-maps.json`;
  `./Box.astro` collapses to its string; `inspectPackage` refuses
  `./src/index.ts` with `Invalid export path: @lacecms/content: ./src/index.ts`.
- 4.2 `checkSourceConditions` in `scripts/check-boundaries.mjs` covers
  `packages/*` manifests. `tests/boundaries.test.mjs` (105 tests) accepts a
  valid map and rejects a missing condition, a string compiled export, a
  condition that is not first, a missing source file and a mismatched source
  name, each naming the package and export. The declared-layout fixture now
  carries the condition. `node scripts/check-boundaries.mjs` passes.
- 5.1 Architecture §6 *Source layout* and *Source tests and packaged output*
  and `DEVELOPMENT.md` describe the condition, the plugin and test
  typecheck without a build. `tests/docs-links.test.mjs` and
  `tests/root-scripts.test.mjs` pass (24 tests).
- 5.2 Clean detached worktree of the candidate (HEAD plus the working-tree
  diff), `pnpm install --frozen-lockfile`, no `dist/` before or after:
  - `pnpm --filter @lacecms/app-admin test`: 199 files, 1009 tests passed;
  - `pnpm --filter @lacecms/content test`: 18 files, 246 tests passed;
  - `tsc -p` passed for all 19 `tsconfig.test.json` and 4
    `tsconfig.type-test.json`. `apps/admin/tsconfig.json` reports only the
    six TS2307 errors of `e2e/block-order.e2e.ts`, which imports built
    output by relative path on purpose.

  The worktree was removed.

## 3. Final checks (5.3)

- `pnpm exec turbo run typecheck --force`: 6.64 s wall (baseline 4.52 s),
  exit 0; root `pnpm typecheck` (with `typecheck:config`) exit 0.
- `pnpm lint` (Oxlint, boundaries, admin colors, Drizzle schema): exit 0.
- `pnpm format:check`: exit 0.
- `pnpm test`: 64 Turbo tasks successful (all member `test`, `build` and
  `test:packaged`), root suite 36 files, 335 tests passed.
- `pnpm openapi:check`: exit 0.
- `pnpm exec openspec validate rf09a-source-export-condition --type change --strict`: valid.

## 4. Deviations

- **Condition name** (owner decision 2026-11-07). `eventsource` and
  `eventsource-parser` declare their own `source` condition pointing at raw
  TypeScript. TypeScript `customConditions` applies to every package, so the
  MCP test project type-checked their sources (TS5097, TS2345), and Vitest
  forwards server conditions to its workers as Node `--conditions`, so Node
  loaded their `.ts` from `node_modules` ("Stripping types is currently
  unsupported for files under node_modules"). The condition is
  `@lacecms/source`; spec, design, proposal and tasks were revised.
- **Vitest resolution through a plugin** instead of `resolve.conditions`.
  Vitest replaces Vite's defaults with server conditions without `module`;
  prepending to Vite's defaults reintroduced `module`, and Node workers then
  loaded `@aws-sdk/*` `dist-es` builds and failed. The plugin leaves default
  conditions untouched, resolves only workspace specifiers, and also serves
  `registry/` components outside any package, so the root manifest and
  lockfile are unchanged (no `vite` or workspace dev dependencies).
- **Admin typecheck builds kept.** The proposal assumed they served
  `test-utils` declarations. They serve `e2e/block-order.e2e.ts`, which
  imports built application, config, domain and platform-node output by
  relative path (commit `7346993a`). Removing them would break a clean CI
  admin typecheck, so `turbo.json` is unchanged.
- Boundary rule scope: `packages/*` manifests. App manifests (`apps/api`,
  `apps/builder`, `apps/site`) export `dist/` targets but are not
  published packages and are not imported by specifier.
