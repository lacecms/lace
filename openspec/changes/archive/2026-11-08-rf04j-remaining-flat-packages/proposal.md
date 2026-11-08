## Why

Roadmap Step RF4 (module splits), Session RF4J of
`docs/refactoring-roadmap.md`, the last RF4 session. Architecture §6 *Source
layout* says a package adopts domain directories "as soon as a package has a
second concern", but five members are still flat and undecided:
`@lacecms/sdk` (HTTP client and published-site loader), `@lacecms/render`,
`create-lace` (CLI, project generator, template rendering, site modes),
`@lacecms/app-api` (Node server, configuration loading, dispatch loop and six
process entry points) and `@lacecms/app-builder` (HTTP handler and build
runner). The boundary checker cannot express either outcome today: it rejects
every root module that is not a manifest entry, so an app whose processes Node
starts directly (`node apps/api/dist/production.js`) cannot join
`scripts/source-layout.json`, and there is no place to record that a package
is deliberately flat.

Four leftovers from earlier sessions ride along:

- 28 of 30 `@lacecms/contracts` module tests import `../index.js` instead of
  the module under test, so a test does not show which module it covers.
- The `@lacecms/config` packaged test pins only runtime keys. Most of the
  package's public surface is type-only (`NormalizedConfig`,
  `ContentModelDefinition`, …), and a dropped type export goes unnoticed.
- `apps/api/vitest.config.mjs` keeps `fileParallelism: false` "for the Worker
  bundle and smoke files", which moved to `test:packaged` in RF2. The source
  suite runs serially for no reason.
- `apps/docs/src/catalog.test.mjs` is the only non-packaged JavaScript test.
  The boundary checker skips every `*.test.mjs` file silently, so the
  "test files are TypeScript" rule has an unrecorded exception.

## What Changes

- **Layout adoption** (verbatim moves, no renamed exports):
  - `sdk`: `client/` (`client.ts`, `errors.ts` with the `LaceSdkError`
    family) and `site/` (`published-site.ts`, `seo.ts`, `internal-links.ts`,
    `site-files.ts`); `site → client`.
  - `create-lace`: `site/` (`modes.ts`, `existing.ts`), `template/`
    (`inventory.ts`, `render.ts`), `generator/` (`project.ts`) and `cli/`
    (`arguments.ts`, `prompt.ts`, `run.ts`); `index.ts` becomes a re-export
    entry; `bin.ts` stays.
  - `apps/api`: `server/` (`node-server.ts`, `admin-assets.ts`), `config/`
    (`project-config.ts`, now owning `NodeApiConfig`) and `dispatch/`
    (`dispatcher-loop.ts`); the process entries stay at `src/` root.
  - `apps/builder`: `runner/` (`runner.ts`, `cache.ts`, `source.ts`,
    `diagnostics.ts`, `settings.ts`) and `server/` (`handler.ts`);
    `main.ts` stays at root.
  - All four join `scripts/source-layout.json` with an entry
    `Directory dependencies:` header.
- **`render` exemption.** `@lacecms/render` is the single-concern render core
  of architecture §13.3 (six modules, about 630 production lines, one
  dependency). It stays flat and is recorded with its reason.
- **Root process entries.** New `scripts/source-root-entries.json` lists, with
  a reason, root modules that Node, Docker or Compose start directly. For a
  declared package the checker accepts such a module as a root entry; a stale
  entry, or one outside a declared package's `src/` root, fails. Operator
  command paths (`apps/api/dist/production.js`, `dispatcher.js`,
  `content-sync-cli.js`, `cloudflare-local.js`, `src/dev-bootstrap.mjs`,
  `apps/builder/dist/main.js`) do not change, so generated projects, the
  Compose files and template fixtures are unaffected.
- **Layout exemptions.** New `scripts/source-layout-exemptions.json` maps a
  package to its single-concern reason. The checker fails when an exempt
  package is also declared in `source-layout.json`, is not a workspace member,
  or has a `src/` subdirectory other than `test-support/`.
- **JavaScript tests.** The checker stops skipping `*.test.(c|m)js` files:
  outside `*.packaged.test.mjs`, such a test needs a reasoned entry in
  `scripts/javascript-source-allowlist.json`. `apps/docs/src/catalog.test.mjs`
  gets that entry.
- **Leftovers.** Contracts module tests import their own module (or concrete
  sibling modules); the entry test keeps `../index.js`. The `config`
  packaged test also pins the sorted exported declaration names of
  `dist/index.d.ts`. `apps/api` drops `fileParallelism: false` from its source
  test configuration.
- Tests whose subject is one moved module move beside it; tests of a root
  entry or of a whole package stay at `src/` root. Moved `@ts-nocheck` tests
  keep their directive and are renamed in the typecheck baseline (132 entries
  before and after).
- Non-goals: no public export or declaration change in any package; no
  operator command, Dockerfile, Compose or template change; no splitting of
  oversized test files (RF9C); no typing of baselined tests (RF9D–RF9F); no
  layout for `platform-node`, `platform-cloudflare` (RF5B), `cli` (RF7C),
  `astro`, `mcp`, `apps/site` or `apps/docs`; no full-coverage rule that every
  member be declared or exempt.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-governance`: *Module graphs inside workspace members are acyclic
  and follow declared layouts* gains listed root process entries and recorded
  single-concern exemptions; *Test helpers are typed, shared and unpublished*
  extends the JavaScript list to non-packaged JavaScript test files and
  requires a reason for every entry.

## Impact

- Code: `packages/sdk/src/**`, `packages/create-lace/src/**`,
  `apps/api/src/**`, `apps/builder/src/**`, 28 contracts tests,
  `packages/config/src/packaged-exports.packaged.test.mjs`,
  `apps/api/vitest.config.mjs`, `scripts/check-boundaries.mjs` and
  `tests/boundaries.test.mjs`, the new and touched `scripts/*.json`
  inventories.
- Consumers of moved built files: `scripts/release-model.mjs` and
  `tests/release-artifacts.test.mjs` (read `create-lace` `inventory.ts`),
  `scripts/release-images.mjs`, `scripts/fixtures/oauth-mcp/ui-server.mjs`,
  `tests/support/cross-runtime-fixture.mjs`, `scripts/generate-openapi.mjs`
  (`apps/api` dist modules), `tests/builder-diagnostics.test.mjs`, and the
  verification runners naming `apps/builder/src/runner.test.ts`
  (`scripts/operations-verification.mjs`,
  `scripts/security-resilience-verification.mjs`).
- Public API: none. Runtime keys and declaration names of `sdk`,
  `create-lace`, `app-api`, `app-builder` and `config` are pinned before and
  after.
- Architecture: §6 names the root-entry list and the exemption list; ADR 0020
  gains an RF4J amendment; the roadmap RF4 section records the outcome.
- Dependencies: RF4X guards, RF9A source resolution. Independent of RF5–RF9
  sessions still planned.
