# Implementation verification

Verified on 2026-10-21. The existing local site layout/routes and backlog edits
were preserved. No spec synchronization, archive, release or SQL migration was
performed.

## Passing checks

- `pnpm exec vitest run packages/content/src/index.test.mjs packages/config/src/index.test.mjs packages/contracts/src/index.test.mjs packages/contracts/src/tolerant.test.mjs packages/application/src/configuration-evolution.test.mjs packages/application/src/configuration-migration.test.mjs packages/cli/src/blocks-registry.test.mjs packages/cli/src/blocks-command.test.mjs packages/create-lace/src/index.test.mjs tests/block-sources.test.mjs --maxWorkers=2`: 389 tests across 10 files.
- `pnpm --filter @lacecms/content type-test` and `pnpm --filter @lacecms/config type-test`: passed.
- `pnpm --filter @lacecms/app-admin exec vitest run --maxWorkers=2`: 796 tests across 174 files, including card keyboard interaction, field integration, nested summary focus, saved scalars, conflict/reload, viewer text, and existing lifecycle/duplicate/move/revert locks.
- `pnpm --filter @lacecms/app-admin exec playwright test list-layouts.e2e.ts list-layout-css.e2e.ts --workers=2`: 6 tests. Light/dark at 320/1280px, accessibility, scalar saves, no thumbnail media requests, no horizontal overflow, every preset below/at/above 32/48/64rem, flex wrap with/without explicit vertical height, empty/single/odd lists, untouched nested lists and unlayered display/gap/column overrides.
- `pnpm exec vitest run packages/platform-node/src/repository-contract.test.mjs packages/platform-cloudflare/src/repository-contract.test.mjs -t 'LIST1|resumes block migration|stops block migration as stale'`: 12 tests, covering file/in-memory SQLite and local D1. Gallery v3 draft/published/hidden migration retains content, links, order, lightbox and envelopes; metadata-only sync preserves snapshots and stale guards; invalid settings retain matching paths and cause no writes; existing resumability/stale migration checks pass.
- `pnpm --filter @lacecms/astro test`: 69 tests across 6 files, including all Gallery layout hooks, image/link/lightbox regressions and an unrelated card-list renderer adopting the same settings/CSS.
- `pnpm --filter @lacecms/app-site test`: 4 fixture-build tests, preserving default Gallery media/theme output. Assertions accept Astro's linked CSS output as well as inline CSS.
- `pnpm --filter create-lace test`: 64 tests across 5 files, including fresh generated Astro builds and inventory ownership for the CSS companion.
- `pnpm exec vitest run packages/platform-node/src/list-layout-product.test.mjs tests/existing-astro-site.test.mjs --maxWorkers=2`: 3 tests. Real upload/save/publish/public/export/duplicate validation and independently connected Astro installation/build.
- `pnpm docs:check`: documentation build, links/output checks, typecheck and 3 documentation tests pass.
- `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, and `git diff --check`: passed. Oxlint retains existing warnings in unrelated files; no new warning remains.
- `pnpm exec openspec validate add-reusable-list-layouts --type change --strict`: passed.

## OpenAPI artifact

`pnpm openapi:generate` regenerated `apps/api/openapi/api-v1.json` with recursive
select-card documentation. A second root-script generation was byte-identical
(SHA-256 `db6fc435f44648c0ebf18f5e2b566bb9c67e3cff1298727c4fb447a9342c97af`).
`pnpm openapi:check` passes its regeneration comparison, then exits nonzero at
its final `git diff --exit-code` because the intended generated artifact changes
are uncommitted. The index was left untouched.

## Delivery and upgrade

Gallery definition/source revision is 4, with migrations 2/3 retained and identity
migration 4 appended. Maintained model versions advance where Gallery is allowed.
The starter template advances to 0.36.0 with coordinated upgrade/rollback guidance.
The registry and all maintained copies/locks contain byte-identical component/CSS
sources under manifest/lock schemaVersion 1. Installer tests cover v3-to-v4
upgrades, edited v3 source, edited CSS, missing-file restoration, dry runs,
idempotence, case-insensitive cross-owner collisions and complete `.new` recovery.

Local sandbox loopback restrictions required running browser, API-media and D1
acceptance outside the filesystem sandbox. Earlier fixture assertions and CSS
hashes were corrected after the intended markup/format changes; final checks
above are the passing runs. An initial concurrent generated-version write caused
a transient root typecheck failure; rerunning with settled build artifacts passed.
