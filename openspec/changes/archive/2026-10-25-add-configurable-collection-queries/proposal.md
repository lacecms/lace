## Why

Collection editors can currently search only titles/slugs and sort only system columns. Selecting the deferred backlog field-value-filter work now lets each collection opt into useful field queries while preserving existing lists. Use ordinary literal LIKE matching with explicit platform limits; non-ASCII case folding is outside this change.

## What Changes

- Deliver backlog session CQ1, **Configurable collection queries**, as one independently verifiable change: collection configuration, validated admin API queries, portable SQL and metadata-driven admin controls share one query contract and must ship together.
- Add optional collection `listOptions` with `sortableFields`, `filterableFields` and `searchableFields`, independent of visible `listFields`; omission retains current fields and ordering; search follows the runtime policy below.
- Support one field sort, typed conjunctive field filters, existence filters and extra text/textarea search targets; keep system sorting, title/slug search and status filtering.
- Use ordinary parameterized LIKE with literal wildcard escaping for q/contains and = COLLATE NOCASE for text equality: ASCII case-insensitive, Cyrillic/non-ASCII case-sensitive. Node/VPS retains 200 code units; Cloudflare uses at most 48 code units and 50 UTF-8 bytes for the final escaped LIKE pattern. Advertise limits through admin runtime metadata and validate before reads. No GLOB compiler, chunked matcher, FTS or external service.
- Preserve URL state, stable cursor paging, query-aware status totals and viewer/editor/admin parity. Query draft values only; public API and website ordering do not change.
- Keep custom sort cursors bounded: string sorts use entry/draft/revision anchors resolved through indexed continuation reads, with explicit restart after edited/deleted anchors. Numeric/boolean/date/datetime boundaries stay embedded; public and system paging behavior is preserved.
- Persist a separate public-projection identity, tied to its full projection hash, through an additive Node/D1 metadata migration. Query-only synchronization avoids builds when public identity is proven unchanged; mixed SEO/public changes retain builds and legacy unknown identity uses a conservative fallback.
- Update architecture §§8, 9, 12, 16 and 17 and select CQ1 in backlog during apply, before implementation. No architecture invariant is relaxed.

## Capabilities

### New Capabilities

- `collection-query-options`: opt-in configuration, typed filter and sort semantics, literal LIKE semantics and platform-specific resource bounds.

### Modified Capabilities

- `content-model-configuration`: list query settings are projection identity, not content structure.
- `rest-contracts`: field query parameters, validation, model metadata and query-bound cursors.
- `content-use-cases`: resolve and authorize configured query capabilities before reads.
- `node-content-repositories`: typed scalar boundaries, bounded string anchors and full-query cursor identity; preserve public pagination.
- `admin-remote-state-and-lists`: configured controls and URL state, recovery, totals and pagination.

## Impact

Primary areas: packages/config, contracts, application, db, platform-node, platform-cloudflare, server and apps/admin; generated OpenAPI and configuration/admin-list documentation. Shared SQL must return identical matches/totals/boundaries for requests accepted by both runtimes; Cloudflare alone rejects over-budget LIKE patterns before SQL. One additive migration adds nullable `public_projection_hash` and `public_projection_source_hash` columns to `content_models`; config sync records them atomically without a content backfill. No new runtime dependency, table, query index, snapshot mutation, model version bump or public SDK feature is planned. Existing structural/full projection hashes stay compatible; the new identity is internal metadata. Runtime listQueryLimits are exposed separately from model definitions/hashes and included in cursor/cache identity. Rollback retains the additive columns and detects obsolete baselines when upgrading again. String-anchor continuations may use at most one additional constant indexed lookup, with no per-entry reads or full draft JSON loads. Existing configs/URLs retain their meanings; new query features are opt-in. Old admin cursors may be rejected safely when the internal cursor version changes.

Scope excludes manual record order, public collection filtering/sorting, nested/group/list/block/SEO queries, rich-text/media queries, multi-sort, arbitrary boolean filter expressions, fuzzy search, transliteration, locale-aware collation and bulk actions. This has no dependency on either active video change.
