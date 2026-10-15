## 1. Architecture and documentation

- [x] 1.1 Confirm `public-contract-forward-compat` is applied and archived
  (its tolerant schemas and `formatVersion` are prerequisites). Then update
  `docs/mvp-architecture.md` before production code:
  - section 12: public endpoints, contract rules and the paged export shape;
  - sections 13.1/13.2: SDK traversal and loader semantics;
  - section 16: per-page D1 budget.

  Verify consistency with the eight delta specs.
- [x] 1.2 Update `docs/compatibility.md` (next alpha): paged export,
  raw-reader migration (follow `nextCursor`), the restart and
  `version_mismatch` behaviour, and best-effort Free-plan CPU. Also update
  `docs/node-api.md`/`docs/cloudflare-worker.md` where they describe the
  export. Verify with `pnpm format:check`.

## 2. Contracts and domain

- [x] 2.1 Add the `BUILD_EXPORT_VERSION_CHANGED` domain error and contract
  error code (HTTP 409, details `{expectedVersion, actualVersion}`). Add
  strict and tolerant `buildExportFirstPageSchema` and
  `buildExportContinuationPageSchema`. Keep `buildExportSchema` as the
  assembled export, and add the query schema (`after`, `limit` 1–100, no other
  keys). Verify with contracts tests:
  - first and continuation shapes;
  - `globals`/`seo` required or forbidden on the right page;
  - query rejections;
  - the error envelope.
- [x] 2.2 Replace `exportBuildContent` with `exportBuildContentPage` on
  `PublicContentReadPort` (design D6), and implement it in the in-memory
  parity double. Split `toBuildExportDto` into first-page and continuation
  converters. Verify that application tests cover paging, the budget and the
  stale-cursor guard.

## 3. Shared SQL and repository contracts

- [x] 3.1 Add the `build-export` cursor helpers and the range-predicate SQL
  fragments (candidate rows with stored sizes; page snapshots, visible blocks,
  delivered media; globals without identifier lists) to
  `packages/db/src/sql-content.ts`. Verify with db unit tests for:
  - cursor round-trip and foreign or malformed rejection;
  - an empty-path first cursor;
  - the size expression on a fixture.
- [x] 3.2 Add repository contract fixtures to `packages/test-utils`
  (content-repository-contracts delta):
  - path order;
  - limit and byte-budget splitting, with an oversized entry alone;
  - first-page-only globals, including a first page with zero entries;
  - per-page media with hidden and draft exclusions;
  - complete-export equivalence;
  - a stale cursor after publish, unpublish, delete, media-metadata edit and
    sync;
  - foreign and malformed cursors.

  Verify they fail before the adapters are updated.

## 4. Runtime adapters

- [x] 4.1 Implement `exportBuildContentPage` in
  `packages/platform-node/src/content-repository.ts` inside one read
  transaction, with the range SQL. Remove the old export. Verify the shared
  fixtures pass on Node, plus a two-connection test where a commit during a
  page read does not mix states.
- [x] 4.2 Implement it in
  `packages/platform-cloudflare/src/d1-content-repository.ts` with two
  batches, a version re-check and range SQL (design D4/D5). Remove the old
  export. Verify the shared fixtures pass on D1, plus a test that injects a
  publication between the batches.

## 5. HTTP route, OpenAPI and builder

- [x] 5.1 Rework the build-export route in `packages/server/src/app.ts`:
  - validate the query;
  - check authorization first;
  - answer a first-page conditional with `304`;
  - ignore `If-None-Match` on continuation pages;
  - read one page and validate it strictly with the matching page schema;
  - set the page-version ETag;
  - map the version-changed error to 409.

  Regenerate `apps/api/openapi/api-v1.json`. Verify with server app tests,
  the `apps/api` node-server and worker-smoke tests, and `pnpm openapi:check`
  (stage the file).
- [x] 5.2 Make the builder's `currentVersion` probe request `?limit=1` and
  keep reading only the ETag. Verify with the builder runner tests.

## 6. SDK, loader and consumers

- [x] 6.1 Add `getBuildExportPage` and page traversal to `getBuildExport` in
  `packages/sdk/src/client.ts` (design D7):
  - tolerant per-page parsing and format check;
  - cross-page version, format, ordering, globals/seo and media-equality
    checks;
  - restart on 409 with two attempts in total, `restart: false`, `pageSize`.

  Verify with SDK tests for every public-sdk delta scenario, using a
  multi-page mock server.
- [x] 6.2 Update `createPublishedSiteLoader`:
  - static and revalidate traversal;
  - first-page expected-version check before continuation;
  - `restart: false` with an expected version;
  - 409 and exhaustion mapped to `version_mismatch`.

  Verify with published-site and `packages/astro` tests for the loader delta
  scenarios.
- [x] 6.3 Add `readCompleteBuildExport` to `packages/test-utils`, and switch
  every raw-export reader to it:
  - `scripts/*-acceptance.mjs` and `scripts/cross-runtime-api.mjs`;
  - `tests/*.mjs`;
  - `apps/admin/e2e/acceptance.e2e.ts` and `block-order.e2e.ts`;
  - `apps/site/src/fixture-build.test.mjs`;
  - platform tests.

  Verify `git grep "public/build-export"` shows no remaining single-request
  reader outside the helper, the route, the SDK and the builder probe.

## 7. Budgets and quality gates

- [x] 7.1 Rework `tests/d1-http-budgets.acceptance.mjs` export checks. Verify:
  - every page request, including token verification, stays within 50 D1
    queries;
  - page reads use at most two batches and ten statements;
  - entry counts and byte splitting are correct for typical and near-1 MB
    fixtures.

  Log per-page rows read and wall-clock timings as evidence for the
  Free-plan CPU target.
- [x] 7.2 Run the narrow contracts, domain, application, db, platform-node,
  platform-cloudflare, server, SDK, Astro, builder and `apps/api` tests. Then
  run:
  - the cross-runtime product phase;
  - `pnpm acceptance:starter`;
  - the D1 budget acceptance;
  - the affected admin e2e specs;
  - root `pnpm typecheck`, `pnpm lint`, `pnpm format:check`,
    `pnpm openapi:check`;
  - `pnpm exec openspec validate paginated-build-export --type change
    --strict`.

  Record the results in `verification.md`.
