## Why

`GET /api/v1/public/build-export` returns every published entry, global, block
and media item in one response. The whole export is built and validated in
memory, and serialized in a single request. On Cloudflare Workers that runs
into per-invocation limits, not into a network limit (Workers do not limit
response bodies):

| Limit | Free plan | Paid plan |
|---|---|---|
| CPU time per request | 10 ms | 30 s by default |
| Isolate memory | 128 MB | 128 MB |
| D1 queries per invocation | 50 | 1000 |

The current D1 export issues roughly `4 + 2·⌈N/100⌉ + ⌈M/100⌉` queries, so a
Free-plan site stops exporting at roughly 2,000 entries, and much earlier on
CPU. Its reads are also not one consistent snapshot: the version is read last.
Changing the export's wire shape after the release candidate would break
every deployed site build, so pagination has to be built into the contract
now.

This change is pre-RC contract hardening, session unit 2 of 2. It is not a
backlog item. It depends on `public-contract-forward-compat` (tolerant
consumer schemas and `formatVersion`), which must be applied and archived
first.

## What Changes

- **BREAKING (pre-RC):** the build-export endpoint returns bounded **pages**.
  - A request without a cursor returns the first page:
    `{formatVersion, version, entries, globals, seo, media, nextCursor?}`.
  - A request with `?after=<cursor>` returns a continuation page:
    `{formatVersion, version, entries, media, nextCursor?}`.
  - Entries are ordered by path and paged by a keyset cursor. Each page's
    `media` holds exactly the media its own items deliver.
  - An optional `limit` (1–100, default 100) caps entries per page. The
    server also ends a page once its stored entry JSON exceeds a fixed byte
    budget, but always delivers at least one entry per page.
- Every page is read from one consistent published state. The opaque cursor
  binds the page sequence to the published-state version of the first page. A
  continuation request after a publication fails with
  `409 BUILD_EXPORT_VERSION_CHANGED`, with `{expectedVersion, actualVersion}`
  details.
- The server validates **each page** with the strict page schema before
  sending it, so the validation cost per response is bounded by the page
  budget. Strict validation also stays in contract, server, repository and
  cross-runtime tests. Consumers validate each page with the tolerant schema
  from `public-contract-forward-compat`.
- Conditional reads apply to the first page: `If-None-Match` with the current
  version returns `304` without loading content. Every `200` page carries the
  strong ETag of its version.
- Repositories expose a paged, version-guarded export read in place of
  `exportBuildContent()`:
  - **Node:** one SQLite read transaction per page.
  - **D1:** a fixed, entry-count-independent number of batched read
    statements per page, using path-range predicates instead of chunked `IN`
    lists.
- `@lacecms/sdk`:
  - adds a single-page read operation;
  - its existing build-export operation follows every cursor and returns the
    same assembled export as today (`{formatVersion, version, entries,
    globals, media, seo}`);
  - it checks cross-page consistency (version, format, ordering, media
    equality);
  - it restarts from the first page when the version changes, up to two
    attempts in total.

  The published-site loader keeps its public API and fails fast with
  `version_mismatch` when an expected version is configured.
- The VPS builder's version probe requests a single-entry first page.
- Acceptance scripts and tests that read the raw export use one shared
  page-following helper.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rest-contracts`: page wire shape, cursor, budgets and the version-changed
  error.
- `hono-app-factory`: conditional reads apply to the first page; per-page
  ETags.
- `application-ports-and-commands`: a paged, version-guarded export read port.
- `content-repository-contracts`: shared fixtures for paging, budgets, version
  guards and per-page media.
- `node-content-repositories`: consistent per-page read transactions.
- `d1-content-repositories`: bounded batched page reads.
- `public-sdk`: a page operation, cursor traversal, cross-page checks and
  restarts.
- `published-site-loader`: a static read is one traversal; revalidation and
  expected-version behavior over pages.

## Impact

- **Architecture:**
  - section 12 (public endpoints, contract rules): the export becomes paged;
  - section 13.1/13.2 (SDK, loader): traversal;
  - section 16 (D1 constraints): per-page budgets.

  The static-site and build-token invariants are unchanged.
- **Code:**
  - `packages/contracts`: page schemas (strict and tolerant), cursor and error
    code.
  - `packages/domain` and `packages/application`: error code, port, in-memory
    double.
  - `packages/db`: SQL fragments and cursor helpers.
  - `packages/platform-node` and `packages/platform-cloudflare`: repositories.
  - `packages/server`: the route.
  - `packages/sdk`, `apps/builder/src/runner.ts`.
  - `apps/api/openapi/api-v1.json`.
  - `packages/test-utils` repository contracts.
  - `tests/d1-http-budgets.acceptance.mjs`, plus the scripts and e2e tests
    that read the raw export.
- **Compatibility:** sites that use `getSite()`/`LaceBlocks` or the SDK need
  no code change. Code that reads the raw REST export must follow
  `nextCursor`. The API and SDK must come from the same release. There is no
  database migration and no template change.
- **Non-goals:**
  - Streaming JSON responses.
  - Export caching (Cache API/KV).
  - Making the byte budget operator-configurable.
  - A loader option for page size.
  - Guaranteeing the Workers Free 10 ms CPU limit for every content shape.

  The budget is chosen and measured for it, but a single maximal entry can
  exceed it.
