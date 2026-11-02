# RF2B verification

## Baseline (2026-11-02)

Pinned Node 24.12.0 / pnpm 12.3.4. `pnpm exec vitest list` title rows:

| Package | Listed titles |
| --- | ---: |
| application | 130 |
| db | 26 |
| auth | 4 |
| server | 85 |
| mcp | 5 |

Original title inventories were captured before conversion for comparison.

## Source migration

The five source suites use the RF2A shared configuration, with separate packaged
configs and one exact public export inventory per package. Each package exposes
`test:watch`; its `test` script has no build prefix. Test configs run under the
root typecheck and retain strict compiler settings; `exclude: []` overrides the
production test exclusions in `db`.

Application's 31 monolith tests were moved into eight use-case files. Server's
68 monolith tests were moved into ten route-group files; its helpers now live in
`src/test-support/app-harness.ts`. Full before/after `vitest list` title
multisets match, including nested describe names and parameterized title rows:
130 application, 26 db, 4 auth, 85 server and 5 mcp (250 total).

The design/task audit called the server monolith 65 tests; the actual starting
file has 68 top-level test registrations. All 68 were preserved. The package
baseline of 85 listed titles remains correct; this is a planning count
correction, with no dropped cases or scope change.

Observed expanded source cases: application 138, db 26, auth 4, server 104,
mcp 5 (277 total). Listed titles and expanded cases are distinct metrics.
Five packaged cases are additional.

All assertions were retained. Dynamic imports of the package under test now
resolve source; MCP's relative config/content/test-utils imports now use public
package names, with those existing workspace packages declared as test-only
manifest dependencies. The only external dev dependency declarations added are
already catalog-pinned `@types/node`. No runtime implementation changed.

The harness derives options from `LaceAppInput`, config input and application
constructors. Deliberately partial security stubs use explicit casts at the test
composition seam. Every test file creates fresh stores/apps. Shared profile and
media definitions are read-only in the tests, as in the original monolith.

## Explicit typechecking exceptions

RF2A recorded nine `@ts-nocheck` files. RF2B adds 24, for 33 across these two
sessions. Every exception retains a specific `TODO(rf2)`; nine RF2B source test
files and the shared server harness are strictly checked without that escape
hatch. Runtime assertions remain active in every file. The new exceptions are:

- `packages/application/src/accounts.test.ts`: Type partial security/email adapters, recorded calls and account outcome fixtures.
- `packages/application/src/collection-queries.test.ts`: Type mutable query/model fixtures, branded actors and deliberately invalid query operands.
- `packages/application/src/conditional-publication.test.ts`: Type branded content snapshots and conditional publication fixture mutations.
- `packages/application/src/configuration-evolution.test.ts`: Type heterogeneous schema evolution tables, stored model evidence and malformed descriptors.
- `packages/application/src/configuration-migration.test.ts`: Type partial synchronization adapters, migration batches and branded snapshot fixtures.
- `packages/application/src/configuration-sync.test.ts`: Type legacy model evidence, partial synchronization ports and detached plan fixtures.
- `packages/application/src/configuration-visibility.test.ts`: Type visibility evolution tables, mutable descriptors and partial synchronization adapters.
- `packages/application/src/content-authority.test.ts`: Type attenuated actor matrices and partial content/security repository fixtures.
- `packages/application/src/draft-normalization.test.ts`: Type partial content repositories and mutable normalized draft fixtures.
- `packages/application/src/internal-links.test.ts`: Type receipt graph fixtures, branded actors and deliberately tampered target guards.
- `packages/application/src/media-use-cases.test.ts`: Type partial media/storage ports, mutable catalog fixtures and malformed upload inputs.
- `packages/application/src/site-build.test.ts`: Type partial build ports, tracker observations and recorded dispatcher calls.
- `packages/auth/src/index.test.ts`: Type partial OAuth/import security adapters, role matrices and resolver result narrowing.
- `packages/db/src/index.test.ts`: Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
- `packages/mcp/src/index.test.ts`: Type scripted MCP transport payloads, protocol results and malformed content fixtures.
- `packages/server/src/email.test.ts`: Type discriminated email settings, scripted HTTP requests and intentionally incomplete runtime senders.
- `packages/server/src/routes-accounts.test.ts`: Type partial account security overrides, deferred tasks and recorded token lookups.
- `packages/server/src/routes-builds.test.ts`: Type partial build repositories, branded build records and actor role tables.
- `packages/server/src/routes-content.test.ts`: Type mutable content/model fixtures, branded snapshots and invalid lifecycle request matrices.
- `packages/server/src/routes-import.test.ts`: Type import capability matrices, partial token security adapters and malformed query cases.
- `packages/server/src/routes-mcp.test.ts`: Type partial OAuth/MCP adapters, attenuated actors and protocol completion event fixtures.
- `packages/server/src/routes-media.test.ts`: Type mutable media fixtures, partial storage adapters and invalid multipart/query inputs.
- `packages/server/src/routes-public-export.test.ts`: Type partial build-token security adapters, export callbacks and mutable publication fixtures.
- `packages/server/src/routes-session-settings.test.ts`: Type partial account/email providers, session role matrices and limiter callbacks.


## Final verification (2026-11-02)

- Node 24.12.0 / pnpm 12.3.4; dependency links completed before gates.
- Root `pnpm typecheck`: passed, 38 Turbo tasks plus project config.
- Root `pnpm lint`: passed, 22 Turbo tasks plus boundaries/admin colors.
- Root `pnpm build`: passed, 22 Turbo tasks.
- Root `pnpm test`: passed, 56 Turbo tasks (zero cache hits), then
  33 root files / 250 cases. All five new packaged export checks passed.
  Turbo portion: 3m44.519s; root Vitest portion: 14.88s.
- Root `pnpm format:check`: passed.
- Root `pnpm spec:validate`: passed, 87 items, no failures.
- Strict validation of `rf02b-source-tests-application-server`: passed;
  `skip_specs` accepts zero deltas because capability behavior is unchanged.
- Focused documentation and boundary guards: four files / 73 cases passed.
- Final build-free check: every `packages/*/dist` directory temporarily moved
  away, all five package `test` commands passed, then all directories restored.
- `git diff --check`: passed. No runtime implementation files changed.

The first sandboxed root test attempt failed only because integration fixtures
could not listen on 127.0.0.1 (`EPERM`). The complete successful root run used
the pinned toolchain outside the sandbox, as RF2A did. Dependency relinking
also required access to the existing pnpm store outside the sandbox; no package
versions were upgraded. No controlled performance comparison is claimed.

All 13 tasks are complete. Archived on 2026-11-02 at the owner’s explicit
request; no accepted capability specification needed syncing.
