## Context

See proposal.md. Facts (commit `8e47b9b6`):

- `packages/test-utils/src/repository-contract.ts`: shared types and ports
  1–170, seed helpers 172–360, then `contract(name, run)` registrations
  grouped by area with seed helpers interleaved: builds 363–1824, lifecycle
  1825–2808 (`seedPublishedLifecycle`), schema evolution/sync 2809–4027
  (`seedEvolvingEntries`, `seedHintedEntries`, `seedNoteEntries`), media
  4028–4266 (`MEDIA_METADATA_CHECKPOINTS`), globals and SEO 4267–4854
  (`seedPublishedGlobal`, `seedSeoNotes`), block envelope 4855–6003, export
  6004–9086 (`seedExportSite`), conditional fields 9087–9398; the array is
  exported at 9399. Consumers: `platform-node/src/repository-contract.test.mjs`
  (runs every case against a file-backed and an in-memory SQLite database)
  and `platform-cloudflare/src/repository-contract.test.mjs` (one Miniflare
  per case, 60 s timeout).
- `packages/test-utils/src/index.ts`: helpers 137–332, adapters 333–514,
  `InMemoryContentStore` and its helpers 515–1781, re-exports 1782–1785
  (`build-export`, `repository-contract`, `security-contract`, `gif`).
- `platform-node` and `platform-cloudflare` regenerate
  `src/release-version.ts` during `build`, but the file is committed, so
  source tests need no generation step.
- `platform-cloudflare/src/worker.test.mjs` tests `/admin/…` through a mock
  assets binding backed by a `Map`; it never reads the copied `admin/` bundle.
  Owner confirmed on 2026-11-02: retain this case in source tests and check
  the copied admin bundle in the packaged smoke test.
- CLI: 38 test files; 11 spawn `dist/bin.js` or other processes
  (`blocks-command`, `doctor-report`, `doctor-sqlite`, `doctor`,
  `import-command`, `environment`, `operational-errors`, `upgrade-command`,
  `upgrade-process`, `migrate`, `upgrade`); 27 import modules directly.
  `create-lace`: `onboarding`, `quickstart` and `index` (which asserts the
  generated `env:prepare` script path) spawn or inspect packed output; the
  generator resolves its `templates/` relative to the module, identically
  from `src/` and `dist/`. `apps/api`: `worker-bundle` and `worker-smoke`
  run Wrangler; `node-server` imports `test-utils` through a relative
  `dist/` path. `apps/site`: `fixture-build` runs `pnpm run build`.

## Goals / Non-Goals

**Goals:**

- No package or app test script builds anything; `test:packaged` is the
  only build-dependent task.
- `test-utils` files map to one concern each; the contract array is
  identical before and after (same cases, same order).

**Non-Goals:**

- Parallelizing the D1 contract harness or reducing its per-case boot.
- Changing which cases run twice on Node.

## Decisions

1. **Contract split preserves order.** `repository-contract/index.ts`
   exports `contentRepositoryContractCases = [...builds, ...lifecycle,
   ...sync, ...media, ...globalsSeo, ...envelope, ...exportCases,
   ...conditional]` in the original order; each area file keeps its own
   seed helpers and imports shared ones from `shared.ts`. A test in
   `test-utils` asserts the concatenated case names equal a literal list
   captured before the split (105 names), so a dropped or reordered case
   fails. The `contract()` registration helper moves to `shared.ts`.
2. **`index.ts` split by concern**, re-exporting with `export *` so the
   public surface is unchanged; the RF2A packaged smoke test for
   `test-utils` is the guard (it is private but still built, because
   `check-boundaries.mjs` and root scripts import its `dist/`).
3. **Packaged cases are separated by file, not by `describe`.** The Worker asset-routing case stays in `worker.test.ts` because it uses
   mock files; `worker-assets.packaged.test.mjs` checks the copied admin bundle.
   Files that are entirely packaged are renamed `*.packaged.test.mjs` and keep
   importing `dist/`. Rationale: `test:packaged` must be selectable by
   include pattern and must see consumer-style resolution.
4. **Platform harnesses import source.** `repository-contract.test.ts` in
   each platform imports `@lacecms/test-utils` (aliased to source) and the
   platform's `./index.js`; the D1 harness keeps its per-case Miniflare and
   timeouts in `vitest.config.mjs` (`fileParallelism: false`, 30 s hooks,
   60 s per contract case) merged over `sharedTestConfig`.
5. **CLI split rule.** A test file that calls `execFile`/`spawn` on
   `dist/bin.js` is packaged; a file that spawns only external tools
   (`pnpm`, `wrangler`) against a temporary project is packaged too,
   because the project installs packed packages. All others import source.
   The `cli` packaged smoke test also asserts `dist/registry` bundle
   presence (built by `bundle-registry.mjs`).
6. **Apps follow the same rule**; the builder process-kill recovery case is
   packaged because its child imports built output. Source and packaged builder
   cases share a test-support fixture with the Builder constructor injected,
   preserving assertions and avoiding a source runtime import from packaged tests. `apps/api` and `apps/builder` gain
   `tsconfig.test.json` extending their Node config; `apps/site`'s single
   test is packaged.

## Risks / Trade-offs

- [D1 harness duration unchanged] Source resolution does not reduce
  Miniflare boots → out of scope; recorded.
- [Hidden dependence on build order] A source test may have relied on a
  sibling package's fresh `dist/` (for example the CLI reading
  `platform-cloudflare/admin/`) → tasks run each package's `test` with all
  `dist/` and `admin/` directories deleted.
- [Split helper visibility] Seed helpers shared across areas must be
  exported from `shared.ts` → the type-checker reports any missing export.

## Migration Plan

One change on a branch after RF2B is archived; revert to roll back.

## Apply-time classification corrections (owner confirmed 2026-11-02)

- Node: move the migration executable case to a packaged file and rename the
  single-case internal-links and rich-text product files to packaged, preserving all 74 titles.
- Worker: move the internal-links Astro-build journey to a packaged file. Share
  its Worker fixture through test-support, injecting the runtime constructor so
  packaged tests use dist and source tests use source. Original 218 cases remain.
- CLI: retain registry unit tests from source, move its bundled-registry case
  and the schema-generation test file to packaged. Together with the original
  eleven process files, both tasks retain all 233 original titles.
- Measured contract registrations are 105 (the proposal baseline of 103 was
  stale); the literal ordering guard captures all 105 unchanged registrations.

The two platform packaged tasks explicitly depend on `@lacecms/astro#build`
(and its SDK/render dependencies), because their internal-link journeys build
an Astro consumer through the site fixture's node_modules. This prevents a
clean-checkout race with unrelated package builds. Source task dependencies
remain empty.
