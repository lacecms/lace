## Context

See proposal.md for motivation. Current state that shapes the approach:

- The kind union `"page" | "collection"` is duplicated in `@lacecms/domain`
  (`ContentModelKind`, `ContentModelRoute`), `@lacecms/content`
  (`ContentModelKind`, payload validation), `@lacecms/config` (model
  definitions), `@lacecms/contracts` (model DTO picklist, entry `model`
  union, `toContentModelRouteDto`), `@lacecms/server` (`ServerContentModel`,
  `modelDto`), the stored-model mapper in `@lacecms/db`
  (`storedModelStates`), the runtime mappers in `platform-node/runtime.ts` and
  `platform-cloudflare/worker.ts`, the repositories and the fake. Many sites
  are binary ternaries (`kind === "page" ? … : collection`) that would silently
  treat a third kind as a collection, so each must become explicit.
- Route resolution happens in the adapters. `PublishContentEntryCommand` has
  no path; Node, D1 and the fake call `resolveContentPublicPath(entry.model,
  slug)` inside `publish` and write `published_routes`. The use case calls it
  only as a validation guard. Unpublish and delete remove routes by
  `entry_id`, which is already a no-op for an entry without a route.
- Public reads: `loadPublic(path)`, `listPublic` and `exportBuildContent` are
  all built on `PUBLIC_ROUTE_SQL` (from `published_routes`), so a route-less
  entry is invisible to them. `PUBLIC_MEDIA_SQL` (public media binary) joins
  any `content_entries.published_snapshot_id`, so media of a published global
  is already servable; the in-memory fake diverges (routes only).
  `PublicContentEntry.path` is a required string and `BuildContentExport` is
  `{entries, version}`. `GET /public/pages/:modelKey` reads through
  `loadPublic(model.path)`.
- Sync: `createConfigurationSyncPageEntry` and `pageEntries` build page
  singletons; adapters insert the entry when `configuration.kind === "page"`.
  Kind changes are already refused generically (`MODEL_KIND_CHANGED`,
  `RENAME_KIND_CHANGED`), and `kind` is already in both hashes.
- Schema: `content_models` has `CHECK (kind in ('page','collection'))`; the
  only foreign key to it is `content_entries.model_key` (`ON UPDATE CASCADE
  ON DELETE RESTRICT`), and sync renames models through that cascade. Node
  connections set `foreign_keys = ON`; drizzle's migrator runs every pending
  file in one `BEGIN … COMMIT`. D1 cannot switch foreign keys off. The only
  earlier rebuild (`0003`) touched an unreferenced table.
- Experiments made while planning (scratch, not committed):
  - better-sqlite3 3.53 and node:sqlite 3.50: `PRAGMA defer_foreign_keys = on;
    CREATE __new; INSERT … SELECT; DROP content_models; ALTER … RENAME` fails
    at `COMMIT` with `FOREIGN KEY constraint failed` (the implicit delete of
    the drop is counted and the rename does not clear it).
  - The same statements with `foreign_keys = OFF` set on the connection
    outside the transaction succeed; the child DDL is untouched and enforcement,
    `RESTRICT` and `ON UPDATE CASCADE` work afterwards.
  - Miniflare D1, statements in one `batch` with `PRAGMA defer_foreign_keys =
    true`: succeeds, foreign keys stay enforced and `global` is accepted.
    `PRAGMA foreign_keys = OFF` is ignored by D1, and running the statements
    as separate calls fails.

## Goals / Non-Goals

**Goals:**

- One explicit three-way kind vocabulary with exhaustive handling everywhere a
  kind is branched on.
- Globals reuse the page singleton machinery (index, sync creation,
  refusals) and the publication pipeline (version bump, build coalescing,
  media references), differing only in having no route.
- A route-less public read path that cannot leak globals into routed reads.
- A migration that is safe for populated databases on both runtimes.

**Non-Goals:**

- Admin UI for globals, starter globals, template bump (CE5B). In CE5A the
  admin only widens types so it compiles; globals stay hidden from its
  navigation.
- Per-global cache headers or ETags on the public route; it behaves like the
  page read.
- Updating a global's stored title when its label changes in configuration.
- Cross-runtime browser or Astro journeys for globals (the starter has none
  yet).

## Decisions

### D1. Explicit kind helpers instead of ternaries

`@lacecms/domain` gains `GlobalContentModelRoute = {key, kind: "global"}` in
the `ContentModelRoute` union, `RoutableContentModelRoute` (page | collection),
and two helpers: `isSingletonKind(kind)` (page or global) and
`contentPublicPath(model, slug): string | undefined`, which returns
`undefined` for a global and otherwise delegates to the existing
`resolveContentPublicPath`. `resolveContentPublicPath` narrows its parameter to
`RoutableContentModelRoute`, so the compiler finds every caller that could
receive a global. Every kind branch (listed in the context) becomes a
`switch` with an exhaustive `never` default or uses these helpers.
`assertEntryCreationAllowed` and `assertCollectionEntryOperation` use
`isSingletonKind`.

`ContentModelKind` stays duplicated in content and domain (content does not
depend on domain), both widened.

*Alternative:* model a global as a page with an optional path. Rejected: it
spreads `path?` checks across the code and weakens the page invariant that a
page always has a route.

### D2. Reuse `CONTENT_PAGE_SINGLETON` and the cardinality conflict

Delete and duplicate of a global fail with the existing `CONTENT_PAGE_SINGLETON`
(409); its domain and contract messages become "Page and global entries are
defined by configuration." A second entry fails with the existing
`CONTENT_MODEL_CARDINALITY_CONFLICT` through the same partial unique index
(`singleton_key = 1`); `sqliteWriteError`'s singleton message is generalized
from "page model" to "page or global model". The admin already handles both
codes.

*Alternative:* a new `CONTENT_GLOBAL_SINGLETON` code. Rejected: the roadmap
asks for the page behavior, and a second code would add a contract change with
no client benefit. The `PAGE` in the code name is accepted as historical.

### D3. Global title and slug are system-owned

`ContentUseCases.save` replaces the submitted title of a global with
`model.label ?? model.key` before validation, so contracts and the admin keep
sending a title. Content payload validation rejects a slug on a global
(`slug_not_allowed` at `/slug`). Create, revert and sync reuse the existing
paths: the sync factory already titles singletons from the label, and revert
copies the published title. A label change in configuration does not rewrite
stored titles (sync label updates stay projection-only and revision-neutral);
the next save picks up the new label. The title never reaches public output.

*Alternative:* reject a title that differs from the label. Rejected: it makes
every client know the label and turns a harmless mismatch into a 422.

### D4. Adapters skip route statements for a global

In Node, D1 and the fake, `publish` computes `contentPublicPath(entry.model,
slug)`; when it is `undefined`, the `publish.route` checkpoint and the
route delete/insert statements are omitted and everything else (snapshot
insert, block and reference copies, pointer update, version bump, build
coalescing, idempotency, old snapshot deletion) is unchanged. Unpublish,
revert and delete need no change (route deletes by `entry_id` are no-ops). The
use case's validation guard calls `contentPublicPath` too. Repository create
sets `singleton_key = 1` when `isSingletonKind(model.kind)`.

### D5. A dedicated route-less public read

The application port gains:

```ts
interface PublicGlobalContent {
  readonly entry: ContentEntry;              // published-only projection
  readonly media: readonly MediaMetadata[];
}
interface PublicContentReadPort {
  loadPublicGlobal(modelKey: ContentModelKey): Promise<PublicGlobalContent | null>;
  // …existing methods
}
interface BuildContentExport {
  readonly entries: readonly PublicContentEntry[];
  readonly globals: readonly PublicGlobalContent[];
  readonly version: number;
}
```

Shared SQL `PUBLIC_GLOBAL_SQL` selects published entries joined to
`content_models` with `m.kind = 'global'` and to their published snapshot,
without `published_routes`. `loadPublicGlobal` adds `where e.model_key = ?
limit 1`; the export adds `order by e.model_key`. Rows are hydrated and their
media resolved with the existing `hydrate`/`publicMedia` helpers; the export
hydrates entries and globals in one pass, so media and block reads stay
chunked. The D1 export therefore costs one extra query:
`9 + 5 × ⌈(entries + globals) / 100⌉`, and the budget acceptance changes to
that formula. Filtering by kind in SQL (not only in the server) keeps a page or
collection from ever being served by this path.

The server adds `globalModel(key)` and `GET /api/v1/public/globals/:modelKey`
next to the page route, with the same validator, anonymity and `404` handling.
Contracts add `publicGlobalSchema` (strict `{id, modelKey, fields, blocks,
publishedAt}`), `publicGlobalContentSchema` (`{global, media}`), `globals:
v.optional(v.array(publicGlobalSchema), [])` on `buildExportSchema`, and the
mappers `toPublicGlobalDto`, `toPublicGlobalContentDto`; `toBuildExportDto`
builds one media dictionary from entries and globals.

*Alternatives:* a single `UNION ALL` export query (one fewer D1 query but a
nullable `path` on `PublicRow` and riskier SQL), and returning globals inside
`entries` with an optional path (breaks `PublishedEntry.path` and every
consumer that assumes routed entries). Both rejected.

### D6. `globals` is optional on input, always sent

The export schema defaults a missing `globals` to `[]`. The server always
emits it, and the SDK's parsed type always has it. Existing fixtures
(`apps/site` export fixture, generated-project and existing-site acceptance
stubs, SDK and Astro tests) stay valid without edits, which matches the
roadmap's "additive". The SDK and API still move together in the next alpha
because the export schema is strict for every other key.

### D7. SDK and loader

`client.getGlobal(modelKey)` mirrors `getPage`. `buildSite` builds a frozen
`Map<modelKey, PublishedGlobal>` with the same media resolution closures as
entries and fails with `invalid_export` on a repeated global key or a key that
also appears in `entries`. `PublishedGlobal` is a new exported type;
`PublishedEntry` is unchanged.

### D8. Migration `0007` and the Node migrator

`schema.ts` widens the check; `pnpm --filter @lacecms/db db:generate` produces
the snapshot and journal entry. The generated SQL is replaced by:

```sql
PRAGMA defer_foreign_keys = on;
CREATE TABLE `__new_content_models` (… same columns …,
  CONSTRAINT "content_models_kind_check" CHECK(… in ('page', 'collection', 'global')),
  CONSTRAINT "content_models_config_version_check" CHECK(… > 0));
INSERT INTO `__new_content_models` (…all columns…) SELECT … FROM `content_models`;
DROP TABLE `content_models`;
ALTER TABLE `__new_content_models` RENAME TO `content_models`;
PRAGMA defer_foreign_keys = off;
```

with statement breakpoints, an explicit column list (including the `0005`
baseline columns) and no index recreation (the table has only its primary
key). This is the form D1 accepts in one batch. On Node the deferral alone is
not enough, so `migrateNodeDatabase` follows SQLite's documented rebuild
procedure: it sets `foreign_keys = OFF` on its private connection, runs the
drizzle migrator, runs `PRAGMA foreign_key_check`, throws a sanitized error if
any row is returned, and sets `foreign_keys = ON` before closing. Application
connections from `openNodeDatabase` keep enforcement on. The rebuild copies
rows unchanged, so the check is a safety assertion, not an expected path.

Wrangler applies a migration file as one request; the D1 test harness
reproduces that with one batch. Group 6 additionally applies the migrations
with `wrangler d1 migrations apply --local` to a populated local database to
prove the production path.

*Alternatives:* edit `sqlite_master` with `writable_schema` (not allowed on
D1, undocumented risk), store globals under an existing kind plus a flag
(corrupts the vocabulary), drop the check entirely (weakens the schema
invariant in section 9.1). All rejected.

### D9. Sync

`createConfigurationSyncPageEntry` becomes `createConfigurationSyncSingletonEntry`
(page or global; the route of a global is `{key, kind: "global"}`), and
`pageEntries` becomes `singletonEntries`. Adapters insert the singleton when
`isSingletonKind(configuration.kind)`. Checkpoint names `sync.page.entry` and
`sync.page.snapshot` are kept so existing failure-injection tests stay valid.
No classification change is needed; tests pin the kind-change refusals for
global.

### D10. Admin compiles, nothing more

`entry-actions.ts` and `UnpublishEntryDialog` take `ContentModelDto["kind"]`;
a global gets the page behavior (no delete or duplicate; the unpublish text
says the content disappears from the site after the next build instead of
naming a 404 path). `navigation.ts` and `ContentPage` keep filtering to pages
and collections. CE5B adds the real UI.

## Risks / Trade-offs

- [The table rebuild runs on production D1 with live foreign keys] → the
  migration is proven on Miniflare in a batch and through `wrangler d1
  migrations apply --local` over populated data; `docs/database-migrations.md`
  tells operators to back up (`wrangler d1 export` / SQLite copy) first, as
  for every migration.
- [Node migrations now run with foreign keys off] → the integrity check runs
  before enforcement is restored and failure is reported; only the explicit
  migrator connection is affected.
- [`CONTENT_PAGE_SINGLETON` is returned for a global] → documented in the
  architecture and ADR; the message names both kinds.
- [A global title lags a label change until the next save] → titles are not
  public; CE5B shows the model label in the admin.
- [Older SDKs reject an export with `globals`] → the SDK already changed
  incompatibly in CE3C for the next alpha; `compatibility.md` records the key.

## Migration Plan

1. Deploy the new API with migration `0007` (Node: `lace migrate` /
   `migrateNodeDatabase`; Cloudflare: `wrangler d1 migrations apply`).
2. No data backfill. Existing models, entries and routes are unchanged.
3. Rollback: restore the pre-migration backup. A `0006` binary cannot read a
   database that contains a global (the stored-model mapper rejects the
   kind); without globals the widened check is harmless to it.
