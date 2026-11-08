# Verification — rf05c-runtime-deltas-composition

Run on 2026-11-08 on branch `docs/refactoring-roadmap`.

| Check | Result |
| --- | --- |
| Baseline (task 1.2) | Node `repository-contract` + `security-contract` + `index.test.ts` 258 passed; Cloudflare `repository-contract` + `security-contract` + `worker.test.ts` + `d1-content-repository.test.ts` 167 passed; server 152 passed; D1 budgets 4 passed |
| New contract cases before fixes (task 2.1) | Failed as expected: D1 publication result lacked `seo`; Node stale publication returned `VALIDATION_FAILED`; Node returned more leases than the caps; D1 site-build claim of 20 raised "D1 mutation exceeds its statement budget" (four statements per claim, 40-statement budget) — design D1 updated to a site-build cap of 10 |
| After fixes | Node `repository-contract` 219 passed (file and memory SQLite, 3 new cases each); D1 `repository-contract` 109 passed; `d1-content-repository.test.ts` passed |
| Server | 21 files, 168 passed (new `services.test.ts`, `feature-flags.test.ts`, `request-rate-limiter.test.ts`, `model-resolver.test.ts`); route tests unchanged |
| Platforms | Node 16 files, 319 passed; Cloudflare 14 files, 222 passed |
| Export comparison (rebuild) | `platform-node`, `platform-cloudflare`: runtime keys identical, entries untouched. `server`: + `SensitiveRequestRateLimiter`, `composeLaceServices`, `contentModelResolver`, `jsonRequestLogger`, `parseRuntimeFeatureFlags`. `application`: + `MAX_DISPATCHER_CLAIMS_PER_CALL`, `MAX_SITE_BUILD_CLAIMS_PER_CALL`. Packaged pins updated |
| Composition | No `new …UseCases` in platform production code; runtime roots 621 → 565 and 484 → 421 lines; `composeLaceServices` 212 lines; routes contain no `input` reference |
| Baselines | Size, cycle and typecheck baselines unchanged |
| D1 budgets (`vitest.verification.config.mjs --project d1-budgets`) | 4 passed, statement counts unchanged |
| Cross-runtime (`--project cross-runtime`) | 4 files, 7 passed |
| `pnpm build`, root `pnpm test` | Pass (22 build tasks; 64 test tasks, 36 root files / 350 tests) |
| `pnpm exec vitest run tests/docs-links.test.mjs` | 6 passed |
| `pnpm typecheck`, `pnpm lint` (incl. boundary, Drizzle checks), `pnpm format:check`, `pnpm openapi:check` | Pass |
| `pnpm spec:validate`; `openspec validate rf05c-runtime-deltas-composition --type change --strict` | 87 passed; valid |

Log-format note: Node's deferred-task failure line is now
`{"component":"deferred","reason":"task_failed"}` (the Worker format); the
former extra `"level":"warn"` field is gone.
