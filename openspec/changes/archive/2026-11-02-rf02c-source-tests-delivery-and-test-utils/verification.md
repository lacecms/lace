# RF2C verification

## Toolchain and baseline

Node 24.12.0 / pnpm 12.3.4, project-pinned tools. Before edits, `vitest list`
reported the title counts below. The Cloudflare baseline run passed all 218
expanded cases in 13 files (96.74 s). Local Worker/socket tests ran outside the
sandbox. Baseline title rows count parameterized tests and registration loops
before expansion; they differ from executed case counts.

| Member | Original titles | Source titles | Packaged titles | Added guards |
| --- | ---: | ---: | ---: | ---: |
| test-utils | 54 | 55 | 1 | 2 |
| platform-node | 74 | 71 | 5 | 2 |
| cli | 233 | 109 | 126 | 2 |
| create-lace | 39 | 21 | 19 | 1 |
| apps/api | 25 | 21 | 4 | 0 |
| apps/builder | 32 | 31 | 1 | 0 |
| apps/site | 4 | 0 | 4 | 0 |

A multiset comparison of original titles against final source + packaged titles
finds no lost title. Extras are only the ordered-contract guard and packaged
export/subpath/asset smoke tests. Cloudflare preserves its original 218 expanded
cases as 217 source + one packaged Astro-build case, plus two new packaged
export/admin-asset guards.

## Contract and export preservation

The literal case-name guard passed against the original monolith before the
split and again after it. There are 105 registrations; the proposal's original
103 was stale. Every case, order, per-runtime assertion and harness timeout is
preserved. Node still runs each contract against file-backed and memory SQLite;
D1 still opens a separate Miniflare per case.

Recursive public declaration export lists before/after are identical (37 names,
including types; diff empty). Runtime exports are identical (23 names), pinned
by the packaged export smoke. Internal helpers are not exported by the public
barrel. The original index is now eight lines; the contract index is 33 lines.
The largest area is export.ts (3,139 lines), versus the 9,400-line monolith.

## Owner-confirmed classification corrections

The owner confirmed these refinements on 2026-11-02; proposal, design and tasks
were revised before applying them:

- Worker asset routing uses a Map-backed mock and remains source-based; a new
  packaged check reads the copied admin bundle.
- Node migration executable and Node/Worker internal-link Astro-build journeys
  are packaged. The Node rich-text Astro-build journey belongs to the same
  confirmed category. Its output goes to its own temporary directory so it
  cannot race the site fixture's output.
- The CLI bundled-registry case and schema-generation file are packaged; all
  other registry unit cases remain source-based.
- The builder process-kill recovery case is packaged. Its constructor-injected
  shared test-support fixture is strictly checked; all 32 titles remain (31
  source / one packaged).

Worker fixtures share one test-support helper with the runtime constructor
injected, so source and packaged suites construct the appropriate runtime.
The two platform packaged tasks explicitly depend on the Astro build, including
SDK/render prerequisites. All 22 source tasks have no dependencies in Turbo's
dry-run graph, and no workspace test script has an interim build prefix.

The upgrade fixture computes seed SHA-256 through Node crypto, avoiding a built
implementation import in a shared fixture. Two existing admin E2E imports now
use the declared test-utils package specifier and devDependency. The audit finds
no relative test-utils/dist import in apps or packages. These E2E test bodies
are unchanged; their imports pass the admin typecheck.

## Clean-output source verification

All eight members passed with every package/app dist and copied Cloudflare admin
bundle temporarily moved to an owned backup and restored afterward. The final
Node recheck after moving the rich-text build created no build output. Other
suites retain their successful clean-output results.

| Member | Source expanded cases | Packaged expanded cases |
| --- | ---: | ---: |
| test-utils | 56 | 1 |
| platform-node | 307 | 5 |
| platform-cloudflare | 217 | 3 |
| cli | 170 | 152 |
| create-lace | 43 | 22 |
| apps/api | 21 | 4 |
| apps/builder | 54 | 1 |
| apps/site | 0 | 4 |

The site source task intentionally succeeds with no test files; only its packaged
task selects the fixture-build file. Root test selection contains that file once.

## Final gates

- Root `pnpm build`: passed, 22 tasks (13 cached).
- Root `pnpm typecheck`: passed, 38 tasks (29 cached), plus project config.
- Root `pnpm lint`: passed, 22 tasks plus boundaries and admin colors. The final
  CLI cleanup also passes its focused lint; existing test-body warnings remain.
- Root `pnpm test`: passed, 64 Turbo tasks (25 cached), then 33 root files /
  250 cases. Wall time 255.47 s, compared with RF2A's 328.49 s without cache;
  cache conditions differ, so this is not a controlled speed comparison.
- Packaged CLI schema and Node test subpaths were additionally verified through
  their actual package specifiers (two cases each); both passed.
- Root format check, internal link/index guard and strict change/all-spec
  validation pass (86 accepted/active items, no failures).
- `git diff --check`: passed. Archived on 2026-11-02 at the owner's explicit request. No spec
  synchronization was needed because the change has no delta specs.

## RF2 typechecking exceptions

The RF2A migration escape hatch remains explicit: each legacy fixture exception
has an @ts-nocheck header and TODO(rf2) describing its typing work. Production,
the contract areas, ordering guard, builder fixture, and tests without headers
remain strictly checked. Five simple fixtures were typed during RF2C rather
than retaining exceptions.

Total: 88 files across RF2 (33 from RF2A/RF2B; 55 in RF2C,
including the shared Worker test-support helper). Current inventory:

- `apps/api/src/content-sync.test.ts`
- `apps/api/src/node-server.test.ts`
- `apps/api/src/production.test.ts`
- `apps/api/src/project-config.test.ts`
- `apps/builder/src/runner.test.ts`
- `apps/builder/src/server.test.ts`
- `packages/application/src/accounts.test.ts`
- `packages/application/src/collection-queries.test.ts`
- `packages/application/src/conditional-publication.test.ts`
- `packages/application/src/configuration-evolution.test.ts`
- `packages/application/src/configuration-migration.test.ts`
- `packages/application/src/configuration-sync.test.ts`
- `packages/application/src/configuration-visibility.test.ts`
- `packages/application/src/content-authority.test.ts`
- `packages/application/src/draft-normalization.test.ts`
- `packages/application/src/internal-links.test.ts`
- `packages/application/src/media-use-cases.test.ts`
- `packages/application/src/site-build.test.ts`
- `packages/astro/src/index.test.ts`
- `packages/auth/src/index.test.ts`
- `packages/cli/src/blocks-registry.test.ts`
- `packages/cli/src/blocks-site.test.ts`
- `packages/cli/src/commands.test.ts`
- `packages/cli/src/d1-transport.test.ts`
- `packages/cli/src/import-apply.test.ts`
- `packages/cli/src/import-client.test.ts`
- `packages/cli/src/import-files.test.ts`
- `packages/cli/src/import-format.test.ts`
- `packages/cli/src/import-plan.test.ts`
- `packages/cli/src/import-references.test.ts`
- `packages/cli/src/import-validate.test.ts`
- `packages/cli/src/index.test.ts`
- `packages/cli/src/operator-environment.test.ts`
- `packages/cli/src/preflight.test.ts`
- `packages/cli/src/upgrade-apply.test.ts`
- `packages/cli/src/upgrade-conflicts.test.ts`
- `packages/cli/src/upgrade-files.test.ts`
- `packages/cli/src/upgrade-lock.test.ts`
- `packages/cli/src/upgrade-record.test.ts`
- `packages/cli/src/upgrade-resume.test.ts`
- `packages/cli/src/upgrade-rollback.test.ts`
- `packages/config/src/index.test.ts`
- `packages/content/src/index.test.ts`
- `packages/contracts/src/index.test.ts`
- `packages/contracts/src/tolerant.test.ts`
- `packages/create-lace/src/scenario-guides.test.ts`
- `packages/create-lace/src/site-modes.test.ts`
- `packages/db/src/index.test.ts`
- `packages/domain/src/index.test.ts`
- `packages/mcp/src/index.test.ts`
- `packages/platform-cloudflare/src/cache.test.ts`
- `packages/platform-cloudflare/src/d1-content-repository.test.ts`
- `packages/platform-cloudflare/src/d1-migration.test.ts`
- `packages/platform-cloudflare/src/d1-sync-batch.test.ts`
- `packages/platform-cloudflare/src/deploy-hook.test.ts`
- `packages/platform-cloudflare/src/email.test.ts`
- `packages/platform-cloudflare/src/image-inspector.test.ts`
- `packages/platform-cloudflare/src/pages-deployments.test.ts`
- `packages/platform-cloudflare/src/r2-storage.test.ts`
- `packages/platform-cloudflare/src/repository-contract.test.ts`
- `packages/platform-cloudflare/src/security-contract.test.ts`
- `packages/platform-cloudflare/src/test-support/worker-harness.ts`
- `packages/platform-cloudflare/src/worker.test.ts`
- `packages/platform-node/src/builder-trigger.test.ts`
- `packages/platform-node/src/field-guidance-product.test.ts`
- `packages/platform-node/src/form-layout-product.test.ts`
- `packages/platform-node/src/host-database-safety.test.ts`
- `packages/platform-node/src/image-inspector.test.ts`
- `packages/platform-node/src/index.test.ts`
- `packages/platform-node/src/list-layout-product.test.ts`
- `packages/platform-node/src/media-gif-product.test.ts`
- `packages/platform-node/src/migrate.test.ts`
- `packages/platform-node/src/repository-contract.test.ts`
- `packages/platform-node/src/security-contract.test.ts`
- `packages/platform-node/src/smtp-email.test.ts`
- `packages/render/src/index.test.ts`
- `packages/sdk/src/index.test.ts`
- `packages/sdk/src/published-site.test.ts`
- `packages/server/src/email.test.ts`
- `packages/server/src/routes-accounts.test.ts`
- `packages/server/src/routes-builds.test.ts`
- `packages/server/src/routes-content.test.ts`
- `packages/server/src/routes-import.test.ts`
- `packages/server/src/routes-mcp.test.ts`
- `packages/server/src/routes-media.test.ts`
- `packages/server/src/routes-public-export.test.ts`
- `packages/server/src/routes-session-settings.test.ts`
- `packages/test-utils/src/index.test.ts`
