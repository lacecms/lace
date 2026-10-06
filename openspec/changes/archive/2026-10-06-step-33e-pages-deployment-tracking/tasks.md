## 1. Architecture and vocabulary

- [x] 1.1 Update architecture §9.8 (tracking checks, deadline, closed reasons, stage) and §15 (Pages tracking settings and read-only secret) before code.
- [x] 1.2 Add tracking reasons, `trackedOutcomeReasons`/normalization, provider stages and tracking policy constants to `@lacecms/domain`; verify with domain tests.

## 2. Ports and tracker

- [x] 2.1 Add `TrackedSiteBuildCheck`, `claimTrackedSiteBuildChecks`, `recordTrackedSiteBuildCheck`, stage-aware `completeTrackedSiteBuild`, and the `ProviderDeploymentReader` port to `@lacecms/application`.
- [x] 2.2 Implement `SiteBuildTracker` (outcomes, forbidden/rejected/not-found grace, deadline, backoff, unconfigured, conflict isolation); verify with unit tests using fakes.

## 3. Repositories

- [x] 3.1 Update `trackedOutcomeError`, `siteBuildRecord` (stage, last check) and shared SQL helpers in `@lacecms/db`.
- [x] 3.2 Implement check claims, check records and stage-aware completion in the Node SQLite repository.
- [x] 3.3 Implement the same in the D1 repository with batched guarded leases.
- [x] 3.4 Extend the shared repository contract suite (lease exclusivity/expiry, provider guards, stage records, completion with stage and reason vocabularies, parallel builds, terminal rows ignored) and run it on Node SQLite and local D1.

## 4. Cloudflare adapters and Worker

- [x] 4.1 Add Pages tracking settings validation (all-or-none, ranges, development-only base URL) with tests.
- [x] 4.2 Make the deploy hook return `tracking` when configured with an ID; extend hook tests.
- [x] 4.3 Add `PagesDeploymentStatusReader` with stub-`fetch` tests for every mapping, bounds and secrecy.
- [x] 4.4 Compose the tracker in the Worker and run it from `scheduled`; Worker tests against a controlled Pages API stub: success, Astro build failure, deploy failure, cancel/skip, transient outage, insufficient permission, parallel builds and late results, restart recovery, hook without ID, deadline, tracking removed, query budget, no secret leakage.

## 5. Contracts and admin

- [x] 5.1 Add `providerStage`/`providerCheckedAt` to contracts and DTO mapping, regenerate OpenAPI; verify contract tests and `pnpm openapi:check`.
- [x] 5.2 Show stage and last check in Builds detail, refresh while non-terminal, add guidance for the nine reasons with neutral styling for `cancelled`/`unknown`; update the running status text; verify with admin unit tests.

## 6. Documentation and completion

- [x] 6.1 Update Cloudflare Worker and deployment handoff docs, Worker config comments, `.dev.vars.example`, generated `lace-operations.md`, and the Cloudflare consumer acceptance expectation; record 33E in the roadmap.
- [x] 6.2 Run narrow tests, root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm openapi:check`, and `pnpm exec openspec validate step-33e-pages-deployment-tracking --type change --strict`; resolve failures.
