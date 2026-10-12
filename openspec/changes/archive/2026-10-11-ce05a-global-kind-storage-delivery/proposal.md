## Why

Site-wide content that belongs to no URL (site name, tagline, footer text,
later SEO defaults and navigation) has no home in Lace: a page needs a path and
is served by it, and a collection is a list. Projects either hard-code such
values in templates or abuse a page. Step CE5 of
[`docs/content-editor-roadmap.md`](../../../docs/content-editor-roadmap.md)
adds a third model kind, `global`, and CE4 (SEO defaults) depends on it. This
change implements session **CE5A — Global kind, storage and delivery**; the
admin and starter work is CE5B.

## What Changes

- **`defineGlobal`** in `@lacecms/config`:
  `defineGlobal({ key, version, label?, description?, fields?, blocks?,
  renamedFrom?, removedFields?, removedBlocks? })` produces a model of kind
  `global` with no path, route or list fields. Keys stay unique across all
  three kinds; `kind` is part of both configuration hashes and of the admin
  projection.
- **Kind vocabulary.** `ContentModelKind` becomes
  `"page" | "collection" | "global"` in domain, content, contracts, the stored
  model states, the runtime model mappers and the server. A global is a
  singleton (`singleton_key = 1`) like a page and never has a public route.
- **Migration `0007`** rebuilds `content_models` to widen its kind check to
  include `global`, preserving every row, the `content_entries` foreign key
  (`ON UPDATE CASCADE`, `ON DELETE RESTRICT`) and existing data on Node SQLite
  and D1. The Node migrator applies pending migrations with foreign-key
  enforcement suspended and verifies `foreign_key_check` before restoring it.
- **Synchronization** creates the singleton draft entry of a new global exactly
  like a page entry (model-label title, no slug, defaults, empty blocks,
  `system:content-sync`). A kind change between any two kinds stays a refused
  breaking change (`MODEL_KIND_CHANGED`, `RENAME_KIND_CHANGED`).
- **Lifecycle.** Save, publish, revert and unpublish work for a global. Publish
  writes no `published_routes` row; unpublish removes only the publication.
  Every publication or unpublication of a global bumps
  `published_state.version` and requests a build. Delete and duplicate are
  refused with the existing `CONTENT_PAGE_SINGLETON` code (message generalized
  to configuration-defined singletons); a second entry is refused with
  `CONTENT_MODEL_CARDINALITY_CONFLICT`. A global draft's title is always its
  model label and a slug is rejected.
- **Public read** `GET /api/v1/public/globals/:modelKey` (anonymous, like page
  reads) returns `{global, media}` where
  `global = {id, modelKey, fields, blocks, publishedAt}` and `media` is the
  CE3C media dictionary; `404` for an unknown or non-global key or an
  unpublished global. Globals never appear in by-path reads, collection lists
  or the export `entries`. Media used by a published global are served by the
  public media endpoint.
- **Build export** gains `globals` (sorted by `modelKey`), and the `media`
  dictionary covers entries and globals. The key is additive: the contract
  schema treats a missing `globals` as an empty list. The ETag keeps following
  the published-state version, so it changes when a global is published or
  unpublished.
- **SDK.** `client.getGlobal(modelKey)` returns `{global, media}` (a `404`
  surfaces as the usual API error). `site.global(modelKey)` returns a
  `PublishedGlobal` with `media()` and `image()` lookups, or `undefined` when
  the global is unpublished or unknown; an export with duplicate global keys
  or a key shared by an entry and a global fails with `invalid_export`.
- **Admin REST.** Content-model DTOs carry `kind: "global"` without `path` or
  `route`; admin entry DTOs carry `model: {kind: "global", key}`. OpenAPI is
  regenerated. The admin app keeps compiling (singleton-aware types) but shows
  no global UI until CE5B.
- **Fix found while planning.** The in-memory repository fake serves public
  media only through routed snapshots; it now matches the SQL rule (any
  current published snapshot).
- Documentation: architecture sections 8, 9.1, 9.2, 9.6, 10, 12, 13.1, 13.2
  and 16, ADR 0010, `docs/database-migrations.md`, `docs/node-api.md`,
  `docs/compatibility.md`, and the roadmap (CE5 in progress).

Not in this change: the admin *Site* group and global editor, starter and
reference-site globals, the template version bump and upgrade notes (all
CE5B); navigation globals (CE7); `seoDefaults` (CE4A); cross-runtime browser
journeys for globals.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `content-model-configuration`: `defineGlobal` and global models without
  routes; key uniqueness across kinds.
- `content-domain-rules`: global cardinality, no public path, and the
  singleton lifecycle refusals.
- `content-validation`: entry payloads accept the `global` kind and reject a
  global slug.
- `content-use-cases`: global save (label title), publish without a route,
  unpublish, revert, and the delete/duplicate refusals.
- `configuration-synchronization`: synchronization creates global singletons;
  kind changes between all three kinds are refused.
- `sqlite-schema-and-migrations`: the widened kind check, migration `0007` and
  foreign-key-preserving Node migration.
- `content-repository-contracts`: global sync, publish, unpublish, revert,
  public read, export and media cases on both runtimes.
- `rest-contracts`: global model and entry DTOs, the public global response,
  and the export `globals` key.
- `public-sdk`: `getGlobal`.
- `published-site-loader`: `site.global()` and export consistency checks for
  globals.

## Impact

- Code: `packages/config`, `packages/content`, `packages/domain`,
  `packages/application` (use cases, sync, public read port),
  `packages/contracts`, `packages/db` (schema, migration `0007`, shared SQL),
  `packages/platform-node` (repository, migrator, runtime mapper),
  `packages/platform-cloudflare` (repository, worker mapper),
  `packages/test-utils` (fake and contract suite), `packages/server`,
  `packages/sdk`, `apps/admin` (type widening only),
  `apps/api/openapi/api-v1.json`.
- Tests and scripts: config, domain, content, application, contracts, server,
  SDK, migration (Node and D1) and repository contract tests; the D1 HTTP
  budget acceptance (export formula gains one globals query).
- APIs: a new public route and an additive export key; admin model and entry
  DTOs gain a kind variant. No change to existing public response shapes.
- Database: migration `0007` (table rebuild of `content_models`).
- Depends on CE1 (structure baselines), CE2A (unpublish and revert) and CE3C
  (media dictionary). CE5B and CE4 build on it.
