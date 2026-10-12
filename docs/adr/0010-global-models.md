# ADR 0010: Global models

- Status: Accepted
- Date: 2026-10-11
- Governing architecture: [section 8](../mvp-architecture.md#8-content-configuration),
  [section 9.6](../mvp-architecture.md#96-published-routes),
  [section 10](../mvp-architecture.md#10-content-publication),
  [section 12](../mvp-architecture.md#12-rest-api),
  [section 13.2](../mvp-architecture.md#132-published-site-loader) and
  [section 16](../mvp-architecture.md#16-database-portability-and-d1-constraints)
- Related: [content and editor roadmap](../content-editor-roadmap.md) step CE5,
  OpenSpec change `ce05a-global-kind-storage-delivery`

## Context

Site-wide content that belongs to no URL (site name, tagline, footer text,
later SEO defaults and navigation) had no home. A page needs a path and is
served by it, and a collection is a list. Projects hard-coded such values in
templates or misused a page.

## Decision

1. **A third model kind, `global`.** `defineGlobal({ key, version, label?,
   description?, fields?, blocks? })` declares a route-less singleton with the
   page's temporary synchronization hints. A global has no path, route or list
   fields. Keys are unique across all kinds, and a kind change is a breaking
   change that sync refuses.
2. **Page singleton machinery.** A global uses `singleton_key = 1`, the
   partial unique index and the sync-created singleton entry (model-label
   title, no slug, defaults, empty blocks, `system:content-sync`). Delete and
   duplicate fail with the existing `CONTENT_PAGE_SINGLETON`; a second entry
   fails with `CONTENT_MODEL_CARDINALITY_CONFLICT`.
3. **System-owned title and no slug.** Saving a global stores the model label
   (or key) as its title regardless of the submitted value, and a slug is
   rejected. The title is never public.
4. **Publication without a route.** Publishing writes no `published_routes`
   row; unpublishing removes only the publication. Both bump
   `published_state.version` and request a build, because any page may render
   the global.
5. **Route-less public read.** `GET /api/v1/public/globals/:modelKey` returns
   `{global, media}` with `global = {id, modelKey, fields, blocks,
   publishedAt}`, reading by model key and kind without `published_routes`.
   The build export gains `globals`; `entries` stay route-only. A missing
   `globals` validates as empty. The SDK adds `getGlobal()` and
   `site.global()`, which returns `undefined` for an unpublished global.
6. **Migration `0007` rebuilds `content_models`** to widen the kind check,
   with deferred foreign keys in one D1 batch. The Node migrator suspends
   foreign keys on its own connection and verifies `foreign_key_check` before
   restoring them, because Node SQLite rejects the deferred drop and rename at
   commit.

## Alternatives considered

- **A page with an optional path.** Rejected: `path?` checks would spread
  through the code and weaken the invariant that a page always has a route.
- **A new `CONTENT_GLOBAL_SINGLETON` code.** Rejected: the behavior equals the
  page refusal, the admin already handles the existing code, and a second
  code would add a contract change without client benefit.
- **Rejecting a title that differs from the label.** Rejected: every client
  would need the label, and a harmless mismatch would become a `422`.
- **Globals inside the export's `entries` with an optional path.** Rejected:
  it breaks `PublishedEntry.path` and every consumer that assumes routed
  entries.
- **One `UNION ALL` export query.** Rejected: it saves one D1 query but needs a
  nullable path on the shared public row.
- **Editing `sqlite_master` through `writable_schema`, or dropping the kind
  check.** Rejected: D1 does not allow the first, and the second weakens the
  schema invariant.

## Consequences

- A global's stored title lags a label change until its next save.
- The D1 export costs one extra query: `9 + 5 × ⌈(entries + globals) / 100⌉`.
- Node migrations run with foreign keys suspended on the migrator connection;
  the integrity check stops a broken migration from being reported as applied.
- A binary that predates `0007` cannot read a database that holds a global;
  rollback means restoring the pre-migration backup.
- Older SDKs reject an export carrying `globals`; the SDK already changed
  incompatibly for the next alpha in CE3C.
