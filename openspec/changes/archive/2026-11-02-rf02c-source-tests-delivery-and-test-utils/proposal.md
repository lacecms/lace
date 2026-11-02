## Why

The remaining packages are the ones whose tests mix pure unit cases with
cases that need built output: the CLI spawns `dist/bin.js`, the generator
installs the packed CLI into generated projects, `apps/api` bundles a
Worker with Wrangler, `platform-cloudflare` serves the copied admin bundle,
and `apps/site` builds a fixture. `test-utils`, which every platform test
imports, is two monoliths: `repository-contract.ts` (9,400 lines, 105 cases
in one array) and `index.ts` (1,785 lines mixing assertions, in-memory
adapters and a 1,200-line in-memory content store). This is Session RF2C of
[`docs/refactoring-roadmap.md`](../../../../docs/refactoring-roadmap.md), the
last of Step RF2: it finishes the conversion, separates the packaged cases
explicitly, and splits `test-utils` along its existing seams. The roadmap
named platforms, CLI and `test-utils`; `create-lace`, `apps/api`,
`apps/builder` and `apps/site` are included because they are the only
other members with `dist`-importing tests and the interim build prefix
must disappear everywhere in the same session.

## What Changes

- **`test-utils` splits.** `src/repository-contract.ts` becomes
  `src/repository-contract/{shared,builds,lifecycle,sync,media,globals-seo,envelope,export,conditional}.ts`
  (shared types, checkpoints and seed helpers in `shared.ts`; each area
  exports its `cases`) with `repository-contract/index.ts` concatenating
  them into the unchanged `contentRepositoryContractCases` export.
  `src/index.ts` becomes `assertions.ts` (atomic checkpoints, query-plan
  assertions, byte helpers), `adapters.ts` (deterministic clock, ids,
  token hasher, in-memory storage, cache, trigger, lease port),
  `in-memory-content-store.ts` and a thin `index.ts` re-exporting
  everything. Public exports are unchanged.
- **Source tests** for `test-utils`, `platform-node`, `platform-cloudflare`,
  `cli`, `create-lace`, `apps/api`, `apps/builder` and `apps/site` under
  the RF2A conventions, with the interim `pnpm run build &&` prefix removed
  from every package.
- **Packaged tests are named.** Tests that need built output move to
  `*.packaged.test.mjs` under `test:packaged`: the eleven CLI tests that
  spawn `dist/bin.js`, the three generator tests that install the packed
  CLI into a generated project, `apps/api` Worker bundle and smoke tests,
  `apps/site` fixture build, the builder process-kill recovery case, and a platform-cloudflare packaged smoke check for the copied `admin/`
  bundle. The existing Worker asset-routing case uses mock files and stays
  source-based. Everything else runs from source, including both
  repository contract harnesses.
- **The last relative `dist/` cross-package imports** (`apps/api` →
  `test-utils`) become package specifiers.

Non-goals: changing any contract case, harness, journey or assertion;
converting the root `tests/` suite; reducing Miniflare boot cost; moving
`security-contract.ts`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The contract suites keep identical cases on both runtimes as
`content-repository-contracts` requires; only file layout changes.
`.openspec.yaml` sets `skip_specs: true`.

## Impact

- Code: `packages/test-utils/src` reorganized into 13 files; eight members'
  test files, configs and scripts; `turbo.json` retains build-free source tasks and adds the Astro build
  prerequisite to the two platform packaged journeys.
- Baseline to preserve: test-utils 54, platform-node 74, cli 233,
  create-lace 39, apps/api 25, apps/builder 32, apps/site 4;
  `platform-cloudflare` is counted at apply time because `vitest list`
  boots Miniflare.
- Architecture §20: the repository contract paragraph names the directory
  layout. `docs/verification.md` Commands: which tests need a build.
- Dependencies: none.

Owner-confirmed classification correction (2026-11-02): the Node migration
executable case and Node/Worker internal-link and Node rich-text Astro-build journeys are packaged.
The CLI bundled-registry case and schema-generation file are also packaged.
All original cases and assertions remain; source tests run without built output.
