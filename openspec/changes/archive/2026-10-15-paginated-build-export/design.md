## Context

See proposal.md (Why). Current flow:

- The server route (`packages/server/src/app.ts`, `/api/v1/public/build-export`)
  does the following in order:
  1. verifies the build token;
  2. reads `publishedContentVersion()` and answers a matching `If-None-Match`
     with `304`;
  3. calls `PublicContentReadPort.exportBuildContent()`;
  4. strictly validates the whole DTO through `response(buildExportSchema, …)`.
- The repositories (`platform-node/src/content-repository.ts:1459`,
  `platform-cloudflare/src/d1-content-repository.ts:706`):
  - read all route rows ordered by path, then all global rows;
  - hydrate snapshots and blocks, chunked into `IN (…)` lists of 100;
  - resolve media with `publicSnapshotMediaSql`;
  - read the version last.
- Public collection lists already use opaque base64url cursors from
  `packages/db/src/sql-content.ts`: `encodeCursor`/`encodeSortCursor`, with a
  `kind` and `SQL_CURSOR_VERSION`.
- The SDK (`packages/sdk/src/client.ts`) already follows collection cursors in
  `getAllCollection`. The loader (`published-site.ts`) calls
  `getBuildExport({etag})` once.
- The builder probes the version by fetching the full export and cancelling
  the body (`apps/builder/src/runner.ts:110`).
- `tests/d1-http-budgets.acceptance.mjs` already measures D1 queries for
  export sizes, and includes near-1 MB blocks.

Content limits (architecture section 8): 200 blocks per entry, and 1,000,000
bytes per `fields_json` or per block `data_json`. A single maximal entry can
therefore far exceed any page budget.

## Goals / Non-Goals

**Goals:**
- Bound the work of every export request (D1 statements, rows materialized,
  JSON validated and serialized) independently of site size.
- Keep every page consistent with one published state, and detect changes
  across pages.
- Keep site code (`getSite()`, `LaceBlocks`, the SDK's assembled export)
  unchanged.
- Keep strict validation where it guards our own output: per page on the
  server, and in every test.

**Non-Goals:**
- Response streaming.
- Server-side caching of pages.
- Operator-tunable byte budgets.
- Splitting one oversized entry across pages.

## Decisions

### D1. Wire shape: first page plus continuation pages

The route stays `GET /api/v1/public/build-export`, with optional
`after`/`limit`, mirroring the public collection list.

- The first page carries `globals` and `seo` once. Repeating them would waste
  budget.
- Every page carries `formatVersion` and `version`, so each page validates and
  checks on its own.
- The contracts define `buildExportFirstPageSchema` and
  `buildExportContinuationPageSchema` (strict, with tolerant twins built by
  the factory from `public-contract-forward-compat`).
- The existing `buildExportSchema` becomes the **assembled** export: same
  fields, no `nextCursor`. The SDK returns it, and tests compare against it.

Alternatives considered:
- *A single page schema with optional `globals`/`seo`*: the first page would
  then not enforce their presence. Rejected.
- *A separate `/build-export/manifest` endpoint*: it adds a request and a
  second auth/ETag surface. Rejected.
- *Offset pagination*: D1 rows read grow quadratically, and inserts shift
  pages. Rejected in favour of a keyset on the unique `published_routes.path`.

### D2. Cursor

The cursor reuses the sorted-cursor helper with kind `build-export`. It
encodes `{kind, version: SQL_CURSOR_VERSION, value: publishedVersion,
id: lastPath}` as base64url JSON.

- The repository decodes and validates it. A wrong kind or shape is a
  validation failure, as for collection cursors.
- A first page with zero entries (possible only when globals alone fill the
  budget) returns a cursor whose `lastPath` is the empty string. Every
  routed path starts with `/`, so `path > ''` selects all entries.

### D3. Page budget

Selection order: `limit` entries (default and max 100) or `PAGE_BYTE_BUDGET
= 4_000_000` stored bytes, whichever is reached first, with at least one
entry.

- An entry's size is computed in SQL as `length(cast(fields_json as blob)) +
  coalesce(length(cast(seo_json as blob)), 0)` plus the summed blob length of
  its **visible** blocks' `data_json` and `settings_json`. Stored bytes are a
  stable, cheap proxy for the memory and CPU of hydration, validation and
  serialization.
- On the first page, globals' sizes count against the same budget before
  entries are added.
- 4 MB keeps a page's in-memory working set (rows, objects, a validated copy
  and the JSON string, roughly 4–6× the stored bytes) well below the 128 MB
  isolate, and keeps per-page validation and serialization short.

Cloudflare's own limits make CPU behaviour content-dependent, so the budget
test (task 6.2) records CPU-relevant timings for typical and maximal fixtures.
The Free-plan 10 ms target is documented as best effort.

Alternatives considered:
- *A count-only budget*: one page of 100 entries holding near-maximal blocks
  could exceed memory. Rejected.
- *Per-block splitting*: it breaks the entry aggregate the SDK validates.
  Rejected.

### D4. Consistency and the version guard

- **Node:** the whole page runs in one better-sqlite3 read transaction
  (`BEGIN` deferred, `COMMIT`), so it reads one WAL snapshot. Checks:
  - a continuation page compares its cursor version with the in-transaction
    version;
  - a mismatch throws `DomainError("BUILD_EXPORT_VERSION_CHANGED")`.
- **D1:** there is no multi-statement read transaction across awaits, but a
  `batch()` executes atomically.
  - Batch A reads the version and the candidate route rows with their sizes
    (`limit + 1` rows after the cursor).
  - JavaScript then picks the page's last path by budget.
  - Batch B reads the version again, plus snapshots, visible blocks and
    delivered media for `path > after AND path <= last`. On the first page it
    also reads globals.
  - If either version differs from the cursor version, or A and B differ on a
    first page, the page fails with the version-changed error.
  - Each version increment is atomic with every published-state change, so
    an equal version proves the same published state.
- **Server mapping:** the error maps to HTTP 409 with details
  `{expectedVersion, actualVersion}`. The ETag of a `200` page is the
  version the page was read at.

Alternative: return a mixed page and let the SDK detect it. Rejected. Torn
reads exist today and are invisible, because the version is read last.

### D5. Range-predicate SQL instead of `IN` lists

New SQL fragments in `packages/db/src/sql-content.ts` select the page's
snapshots, blocks and media by joining `published_routes r` on
`r.path > ? AND r.path <= ?`, together with the existing
`e.published_snapshot_id = r.snapshot_id` condition. Statement count and bound
parameters stay constant per page. Media reuse `DELIVERED_REFERENCE_SQL` to
exclude hidden-only references. Global reads reuse `PUBLIC_GLOBAL_SQL`, joined
to snapshots, blocks and media without identifier lists. Both repositories
share these fragments. The existing `storedSnapshots`/`hydrateEntries`/
`publicSnapshotMedia` mappers consume the rows unchanged.

### D6. Port shape

`PublicContentReadPort.exportBuildContent()` is replaced by:

```ts
exportBuildContentPage(input: {
  readonly after?: OpaqueCursor;
  readonly limit: number;
}): Promise<BuildContentExportPage>;

interface BuildContentExportPage {
  readonly entries: readonly PublicContentEntry[];
  readonly globals?: readonly PublicGlobalContent[]; // first page only
  readonly nextCursor?: OpaqueCursor;
  readonly version: number;
}
```

`publishedContentVersion()` stays for `304` handling. The `toBuildExportDto`
converter is split into first-page and continuation converters. The SEO
section is still built from configuration by the server, and is attached
only to the first page.

### D7. SDK traversal

- `client.getBuildExportPage({after?, limit?, etag?, signal?})` returns
  `{changed: false, etag}` or `{changed: true, etag, page}`.
- `client.getBuildExport({etag?, pageSize?, restart?: boolean, signal?})`:
  1. reads the first page conditionally;
  2. follows cursors unconditionally;
  3. validates every page with the tolerant schemas and the format check;
  4. enforces the cross-page rules;
  5. merges media (deep equality per ID);
  6. returns the assembled export with the first page's ETag.

  On `LaceHttpError` 409 `BUILD_EXPORT_VERSION_CHANGED` it restarts (2
  attempts in total) unless `restart: false`.
- The loader passes `restart: false` and checks the first page's version
  against the expected version through an `onFirstPage` hook, before any
  continuation request. It maps the 409 error, or exhausted restarts, to
  `version_mismatch`.

### D8. Builder and test consumers

- `apps/builder/src/runner.ts` `currentVersion` requests `?limit=1` and still
  reads only the ETag.
- `packages/test-utils` gains `readCompleteBuildExport(fetch, baseUrl,
  token)`. It follows pages and strictly validates each page and the
  assembled result. Scripts and e2e tests that read the raw export use it:
  - `scripts/*-acceptance.mjs`, `scripts/cross-runtime-api.mjs`;
  - `tests/*.mjs`;
  - `apps/admin/e2e/acceptance.e2e.ts`, `block-order.e2e.ts`;
  - `apps/api` and platform tests.

## Risks / Trade-offs

- [Phase-A size computation reads block rows twice, raising D1 rows read
  (relevant for the Free-plan daily cap).] → The sum uses the
  `(snapshot_id, position)` index, and rows read stay linear in content. The
  budget test records rows read per page.
- [More HTTP requests per build: ⌈N/100⌉ or more.] → Negligible against
  Workers request quotas. Each request is cheap, and `304` still costs one
  version read.
- [Frequent publication during a large build causes restarts.] → Two
  attempts. Production builds pin the expected version and fail fast. The
  outbox coalesces the follow-up build.
- [A single entry above the CPU or memory limit still fails.] → It is
  isolated on its own page and documented. Content limits remain the hard
  bound.
- [D1 counting of batched statements toward the 50-query limit is not
  precisely documented.] → The design stays within 50 even if each statement
  counts, and the budget test asserts it.

## Migration Plan

- Apply after `public-contract-forward-compat` is archived. There is no
  database migration, and no generated-template change.
- Deploy the API, builder image and site SDK of the same release together.
  Older SDKs cannot read pages, and mixing releases is already unsupported.
- Document in `docs/compatibility.md` (next alpha) that raw-export readers
  must follow `nextCursor`.
- Rollback restores the previous package and image set. No data change.

## Open Questions

- Whether to expose a site-level page-size setting (for example
  `LACE_BUILD_EXPORT_PAGE_SIZE`) for Free-plan tuning. It can be added later
  additively, because `limit` already exists on the wire and in the SDK.
