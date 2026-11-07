## Context

- `vitest.shared.mjs` exports `workspaceAliases`. It maps each
  `packages/*/package.json` name to `src/index.ts`, plus four subpath entries:
  `test-utils/visibility-parity`, `platform-node/test`, `astro/*.astro` and
  `cli/lace-import.schema.json`. `sharedTestConfig` applies it and every
  package and app Vitest config (21) uses `sharedTestConfig`. The astro config
  wraps it in `getViteConfig`.
- `apps/admin/vite.config.ts` has its own `test` block without aliases, so 49
  of its 198 test files and the app code they load import
  `@lacecms/contracts`, `@lacecms/content` and `@lacecms/test-utils` (main
  entry, `filter-parity`, `visibility-parity`) from `dist/`.
- Exports: 17 packages. Each `.` export is `{ types, import }` into `dist/`.
  Subpaths: `platform-node/test`, three `test-utils` entries, four `astro`
  `.astro` strings and the CLI schema JSON (a data file outside `dist/`).
- Every `tsconfig.test.json` (19) and `tsconfig.type-test.json` (4) extends
  the production project or a base config. It resolves sibling packages to
  `dist/*.d.ts` under `NodeNext`. The `typecheck` Turbo task depends on
  `^build`. `@lacecms/app-admin#typecheck` also depends on the application,
  config, domain and platform-node builds, because `e2e/block-order.e2e.ts`
  imports their `dist/` output by relative path to run the real Node
  composition, and the admin may not depend on those packages.
- Release preparation (`scripts/release-artifacts.mjs` `preparePackages`)
  copies each manifest into a staging workspace. There it deletes
  `devDependencies` and `scripts`, then packs it. `inspectPackage` refuses an
  export target outside `./dist/`, except the CLI schema.
- `scripts/check-boundaries.mjs` `manifestEntrySources` reads `dist/*.js`
  export targets to find package entry sources.

Prototype (session scratchpad, TypeScript 7.0.2 and the repository's
Vitest, deleted afterwards):

- `customConditions: ["@lacecms/source"]` in a `noEmit` project that extends a
  `rootDir: "src"` project resolves a symlinked package's `./src/index.ts`
  with no `dist/` and no rootDir error. Without the condition it reports
  TS2307.
- In Vitest, a Node-environment test resolves the condition only through
  `ssr.resolve.conditions`. A jsdom test resolves it only through
  `resolve.conditions`. Source behind a workspace symlink is transformed
  without extra `server.deps` settings. Implementation later found that
  Vitest forwards server conditions to its workers (design D2).

## Goals / Non-Goals

**Goals:** one declared resolution mechanism, owned by each package manifest;
admin tests and all test typecheck without a build; published manifests
byte-identical in their export maps; a guard against a missing condition.

**Non-Goals:** typing baselined tests (RF9D–RF9F); fixture consolidation and
Turbo input narrowing (RF9B); root `tests/*.mjs` that import `dist/` on
purpose; Astro site and docs builds; the admin production bundle.

## Decisions

### D1. Manifest shape

Each `dist/` export becomes:

```json
".": { "@lacecms/source": "./src/index.ts", "types": "./dist/index.d.ts", "import": "./dist/index.js" }
```

Subpaths follow the same rule. The `@lacecms/source` target is the module the
`dist/` file is built from, so `dist/test-actors.js` maps to
`src/test-actors.ts`. A string `.astro` export becomes
`{ "@lacecms/source": "./src/LaceBlocks.astro", "default": "./dist/LaceBlocks.astro" }`.
The CLI schema export points at a data file outside `dist/` and stays a
string. `@lacecms/source` comes first, because condition matching follows object
order and `types` is always active in TypeScript.

Rejected: keeping the alias table and adding it to admin. That leaves test
typecheck on `dist/` and a hand-maintained table that already misses a
subpath. Also rejected: `publishConfig.exports`. It duplicates every export
map in the manifest and lets the two copies drift.

### D2. Test runners

`vitest.shared.mjs` exports a `sourceCondition()` Vite plugin and
`sharedTestConfig` adds it. The plugin reads every `packages/*` manifest
once. For each export that declares `@lacecms/source`, it maps the export
specifier (`@lacecms/astro`, `@lacecms/astro/LaceBlocks.astro`, …) to that
source path and resolves it in `resolveId` with `enforce: "pre"`. The map is
derived from the declared conditions, so it needs no hand-written entries.

The condition is not added to Vite's `resolve.conditions` or
`ssr.resolve.conditions`. Vitest replaces Vite's defaults with its own
(server conditions without `module`) and forwards the server conditions to
its workers as Node `--conditions`. A global condition would therefore reach
Node's resolution of third-party packages as well. The plugin keeps the
resolution to workspace specifiers, whatever the importer's location. So
`registry/` components outside any package resolve `@lacecms/astro` and
`@lacecms/render` without root dependencies, and the root manifest needs no
`vite` dependency.

`workspaceAliases` is deleted. `apps/admin/vite.config.ts` becomes a
function of `mode` and adds the plugin only when `mode === "test"` (Vitest's
mode). The admin dev server and `vite build` keep `dist/`. The astro config
keeps `getViteConfig(sharedTestConfig())`. A `vitest.shared.d.mts`
declaration types the import from the admin config.

Owner decision (2026-11-07): the condition is named `@lacecms/source`, not
`source`. `eventsource` and `eventsource-parser` (dependencies of the MCP
client) declare their own `source` condition pointing at raw TypeScript.
TypeScript `customConditions` applies to every package, so a bare `source`
made the MCP test project type-check their sources and fail (TS5097,
TS2345). Vitest's forwarded `--conditions source` made Node load their
`.ts` from `node_modules` and fail. A scoped name cannot collide.

### D3. Type-checking

Every `tsconfig.test.json`, `tsconfig.type-test.json` and
`apps/admin/tsconfig.json` (`noEmit`, covers app and tests) adds
`"customConditions": ["@lacecms/source"]`. Production `tsconfig.json` files stay
unchanged: they emit with `rootDir: "src"`, and their consumers must see
declarations. The member `typecheck` scripts still run the production
project first, so the Turbo `typecheck` task keeps `^build`. The extra admin
build dependencies stay. The admin unit tests and app source no longer read
declarations, but the `block-order` end-to-end test still imports built
output on purpose, like the root `tests/` suite. (The proposal first assumed
the builds served `test-utils` declarations; implementation found they serve
that end-to-end test.)

### D4. Release preparation strips the condition

`scripts/release-artifacts.mjs` exports `withoutSourceCondition(exports)`.
It deep-copies the map, removes every `@lacecms/source` key, and replaces any
condition object left with only `default` by its string. `preparePackages`
applies it to the staged manifest next to the `devDependencies` and `scripts`
removal. `inspectPackage` keeps refusing `src/` targets, as the backstop for
a manifest that skipped staging. Unit tests in `tests/release-artifacts.test.mjs`
cover the function on every real package manifest: the result equals the
pre-change export map recorded in the baseline. They also cover the
inspection failure for a `./src/` export.

Rejected: publishing the condition. Its targets would name files the archive
does not contain, and `inspectPackage` would have to allow `src/` paths.

### D5. Boundary guard

`check-boundaries.mjs` checks every workspace package manifest. For each
export target under `./dist/`, the enclosing condition object (or the
string, for `.astro`) must have `@lacecms/source` as its first key. Its path must
exist and must be the module that target is built from (same relative name,
`.ts`, `.tsx` or `.astro`). Failures name the package and export key.
`manifestEntrySources` keeps working from `dist/` targets. Fixture cases go
in `tests/boundaries.test.mjs`.

### D6. Verification on a clean checkout

The no-build claims are verified in a detached `git worktree` of the
implementation commit candidate, after `pnpm install` and with no `dist/`
directory. There the task runs `pnpm --filter @lacecms/app-admin test`, one
package `test`, and `tsc -p` for every test and type-test project. The
worktree is removed afterwards. The working checkout's `dist/` is never
deleted.

## Risks / Trade-offs

- [A package's source may not type-check under a consumer's compiler
  options, for example `lib` differences] → fix the source types. Never
  exclude files or loosen options. If a fix changes production code beyond
  types, stop and update this design.
- [Test typecheck now checks dependency sources, which is slower] → record
  the wall time before and after in `verification.md`. Accepted, because it
  removes the build dependency.
- [Vite or Vitest condition defaults differ between versions] → the plugin
  leaves the default conditions untouched and resolves only workspace
  specifiers.
- [A third-party package declares the same condition] → the scoped name
  `@lacecms/source` (D2).
- [Packed manifests change by accident] → the baseline export maps and the
  strip test pin them.
