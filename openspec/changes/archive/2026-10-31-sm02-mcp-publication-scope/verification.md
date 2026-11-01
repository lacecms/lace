# SM2 verification

Date: 2026-10-31
Change: `sm02-mcp-publication-scope`
Environment: macOS arm64, project-pinned pnpm 12.3.4 via Corepack.
General checks used Node 24.22.1; the final root test command used the CI-pinned
Node 24.12.0 for the release-harness exact-version gate.

## Behavior verified

- Publish requests normalize to read/write/publish in canonical order; both
  discovery documents advertise the new scope. Unknown scopes remain rejected.
- SQLite and D1 consent tests allow administrators to grant publication, refuse
  editor/viewer publication without creating a grant, and allow explicit narrower
  consent without changing roles. Read remains the default.
- Token scopes intersect the durable consent ceiling and current role. Existing
  grants stay unchanged. Missing publication scope produces HTTP 403 with
  `insufficient_scope` and `scope="content:publish"`; demotion produces an
  `AUTHORIZATION_DENIED` MCP tool error before protected content work.
- REST and MCP use shared publication result enrichment and the same strict
  argument/idempotency schemas. SQLite/D1 tests compare successful projections,
  replay results and errors for stale revisions, strict validation, route
  conflicts and unavailable internal links. Public reads see the published
  snapshot; failures preserve public state and pending build work.
- Multiple MCP publications coalesce into one pending build event. Repeating an
  idempotency key replays without a second publication. The production Worker
  isolate also executes OAuth, draft save, publication and replay.
- Tool discovery exposes three read, five read/write or six publish tools.
  Unpublish/delete/revert/duplicate remain unavailable, including direct
  application invocations with a hostile delegated ceiling.
- Consent, all four setup recipes and Account connections describe publication.
  Chromium checks cover three accessible consent radios, read default, disabled
  editor publication, keyboard selection, client switching and no horizontal
  overflow at 320px; axe checks pass.
- Template 0.41.0 adds upgrade/re-consent guidance without a database migration.
  Six generated-project snapshots match two independent regenerations each.

## Checks

| Check | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | Pass; lockfile unchanged |
| `pnpm test` | Pass; 44 workspace tasks, 2778 workspace tests and 222 root tests (3000 total) |
| `pnpm typecheck` | Pass; workspace and project config |
| `pnpm lint` | Pass; Oxlint, dependency boundaries and admin color checks |
| `pnpm format:check` | Pass; Oxfmt |
| `pnpm openapi:check` | Pass; REST/OpenAPI unchanged |
| `pnpm compat:mcp` | Pass; types and 114 tests across six files |
| Focused final REST/MCP equivalence suite | Pass; six SQLite/D1 tests, including public reads |
| Admin MCP unit tests | Pass; 24 tests across four files |
| Chromium `e2e/mcp-publication.e2e.ts` | Pass; three tests at 320px/keyboard, including axe |
| Generator tests | Pass; 64 tests in the root workspace run |
| `tests/consumer-guides.test.mjs` | Pass; seven tests |
| Snapshot refresh | Pass; all six variants regenerated twice |
| `pnpm build` | Pass; all 22 build tasks |
| `pnpm acceptance:starter` | Pass; 15 packed packages, frozen install, typecheck and Astro builds |
| `pnpm acceptance:existing-site` | Pass; existing-site connection/build/media/source protection |
| `pnpm docs:check` | Pass; build, links/resources, typecheck and tests |
| `pnpm --filter @lacecms/app-docs test:variants` | Pass; extra locale and fixed-version build |
| `pnpm spec:validate` | Pass; 84 items, no failures |
| Strict change validation | Pass; `openspec validate sm02-mcp-publication-scope --type change --strict` |

These checks cover the runnable quality/build/acceptance steps from
`.github/workflows/ci.yml`. Existing Chromium was used for browser acceptance;
CI's OS-specific browser installation step was not needed locally.

An initial offline frozen install found an uncached tarball and interrupted a
concurrent test run while relinking dependencies. A subsequent online frozen
install restored the complete dependency tree without lockfile changes; final
quality and test runs use that restored tree. An initial root run on Node 24.22.1
passed every workspace test but stopped at the release harness exact-version
gate; the final Node 24.12.0 run passed, with valid workspace task cache reuse. Local socket tests require running
outside the filesystem sandbox. Existing non-failing Vite bundle-size and React
`act` warnings remain.

Local Node/D1/Worker and Chromium evidence does not claim deployed VPS/Cloudflare
acceptance or a verified login in an external client application. Public versioned
documentation updates remain assigned to release preparation. The apply action did not synchronize or archive specs.

## Archive

On 2026-10-31, following the explicit archive request, all five capability
deltas were synchronized into main specs (seven requirements modified, one
added), and every existing scenario was preserved. Strict validation passed for
all 82 main specs and for this completed change before moving it to
`openspec/changes/archive/2026-10-31-sm02-mcp-publication-scope`.
The roadmap now records SM2 as done.
