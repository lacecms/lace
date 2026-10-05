## 1. Architecture and vocabulary

- [x] 1.1 Update architecture §9.8 with the seven-status table, transitions, tracking columns, retry sources and current-version rule before code changes.
- [x] 1.2 Add the portable status vocabulary (`siteBuildStatuses`, terminal/retryable/tracked sets and predicates) to `@lacecms/domain`; verify with focused domain tests.

## 2. Ports, dispatcher and trigger adapters

- [x] 2.1 Extend `BuildTriggerResult` with optional-ID `accepted` and `tracking`; replace `completeAcceptedSiteBuild` with `completeTrackedSiteBuild` and add `recordSiteBuildTracking`; map every result in `SiteBuildDispatcher`. Verify each mapping, lease loss and failure retry with dispatcher tests.
- [x] 2.2 Make the Cloudflare deploy hook return `accepted` for every accepted 2xx (with ID when valid). Verify ID/no-ID/rejected/unavailable responses with adapter tests.

## 3. Schema and migration

- [x] 3.1 Update the Drizzle schema (seven-value check, tracking columns, tracking index), add hand-finished migration `0003_site_build_outcomes` with snapshot/journal/inventory entries and D1-only reclassification. Verify Node (Drizzle migrator) and D1 (Miniflare) migrations of seeded pre-`0003` rows, constraint enforcement and the migration inventory test.

## 4. Repositories

- [x] 4.1 Implement claim-to-`running`, guarded reclaim, terminal-row event completion, `running`-guarded outcomes, accepted/tracking writes, tracked completion and widened retry guard in the Node SQLite repository.
- [x] 4.2 Implement the same transitions as guarded D1 batches.
- [x] 4.3 Update and extend the shared repository contract suite (claim, reclaim, retry-to-pending, accepted with/without ID, tracking completion idempotence/mismatch/conflict/late-after-unknown/dispatcher-owned refusal, retry sources, terminal row with unprocessed event) and runtime composition tests; run them on file/in-memory SQLite and local D1.

## 5. Contracts and admin

- [x] 5.1 Widen contract status schemas and DTO mapping, regenerate OpenAPI; verify contract tests and `pnpm openapi:check`.
- [x] 5.2 Add the shared `entities/site-build` status map and badge-with-popover; use it in Builds rows/detail and entry publication details, widen covering-state precedence/terminal polling/retry visibility, update the Builds visibility note and derive the tour Builds wording from the map. Verify with unit/component tests for every status.
- [x] 5.3 Add Playwright coverage with mocked history in all seven statuses: keyboard open/close and focus return for every popover, axe audit with an open popover, and 375px overflow.

## 6. Documentation and completion

- [x] 6.1 Update Cloudflare Worker/deployment handoff docs, personal site guide, database migration notes and the generated `lace-operations.md` status wording; record 33D completion in the roadmap after verification.
- [x] 6.2 Run narrow tests, root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check` and `pnpm exec openspec validate step-33d-truthful-site-build-outcomes --type change --strict`; resolve failures.
