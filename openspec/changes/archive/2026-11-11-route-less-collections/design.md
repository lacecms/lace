## Context

See proposal.md (Why). Current state that shapes the approach:

- Globals are already route-less. `contentPublicPath` in
  `@lacecms/domain` (`content/routes.ts`) returns `undefined` for a global, the
  Node and D1 entry repositories write a `published_routes` row only when a
  path exists, `PUBLIC_GLOBAL_SQL` reads published snapshots without
  `published_routes`, and the link reader reports a global target as
  `non-routable`.
- The database stores model identity and `kind`, never the route; the route
  lives only in the normalized configuration. A published entry of a routed
  collection always owns exactly one `published_routes` row, written in the
  same guarded mutation as its publication.
- The build export pages by keyset over `published_routes.path`
  (`packages/db/src/builds/export.ts`): candidates with stored byte sizes, a
  page range `(after, last]`, constant statements bound by path range, and a
  cursor `{kind: "build-export", id: lastPath, value: version}`. Globals ride
  on the first page. `selectBuildExportPage` in `@lacecms/application` applies
  the limit and byte budget.
- The public collection list (`listPublic`) and slug read join
  `published_routes`; the SDK site view indexes entries by path and slug and
  sorts listings by path; the sitemap renders `site.all`.
- Payload validation (`validateEntryPayload` in `@lacecms/content`) knows only
  the kind: it rejects a global slug and requires a collection slug at
  publication.
- Sync's structural diff already compares the collection route and refuses a
  path or route change while the model has a published snapshot.
- Both runtimes share the SQL and readers of `@lacecms/db`; runtime packages
  differ only in transaction mechanics.

## Goals / Non-Goals

**Goals:** route-less collections with no schema migration; one shared SQL
path for Node and D1; additive public contract (format 2 kept); routed
collections, their hashes and their export pages unchanged byte for byte.

**Non-Goals:** see proposal. Additionally: no stored "routable" flag in the
database and no new model kind.

## Decisions

### D1 Keep kind `collection`; routability is "page, or collection with a route"

A route-less collection is a `collection` without `route`. Everything that is
collection-shaped (multiple entries, list fields and options, duplicate,
delete, entry lists, admin navigation) keeps working unchanged. Path decisions
move from `kind === "global"` checks to one domain predicate (a model has a
public route when it is a page or a collection with a route); the domain
`ContentModelRoute` union gains a route-less collection variant and
`contentPublicPath` returns `undefined` for it.

Rejected: a new kind (`list`/`dataset`). It would answer the kind boundary for
free but needs a database kind migration on both runtimes, a fourth branch in
every kind switch (admin navigation, landing, sync singletons) and a separate
admin list implementation for what is still a list of entries.

### D2 Route-lessness is derived, not stored

Configuration is the only authority for routes. SQL that must select published
route-less entries uses the stored invariant instead: a published entry of a
`collection` model with no `published_routes` row for its published snapshot.
This needs no column, no migration and no bound list of model keys, and holds
for both runtimes because the route row is written atomically with
publication. Where configuration is needed (validation, link statuses, picker
exclusion) the application layer supplies it.

Rejected: a `routable` column on `content_models` maintained by sync — a
migration and a second copy of configuration state that sync would have to
keep consistent.

### D3 Slug rules live in payload validation

`validateEntryPayload` receives whether the model has a route.
Route-less entries reject any slug (`slug_not_allowed`, the global issue code)
in draft and publish mode; only routed collections require a slug to publish.
Draft normalization, create, save, duplicate and MCP inherit this through the
use cases. The admin entry-list `slug` filter needs no special case: no
route-less snapshot holds a slug.

### D4 Records are a second keyset phase of the build export

Each page carries `records` (public record DTO plus `internalLinks`). The page
reader first takes routed candidates after the cursor path (`limit + 1`); when
fewer remain, it fills the rest with record candidates ordered by
`(model_key, entry id)` after the cursor's record position (row-value
comparison, supported by SQLite and D1). `selectBuildExportPage` runs over the
concatenated candidate sizes, so limit and byte budget cover both kinds. The
page then binds two ranges — the path range and the record range — into the
existing constant statements (blocks, media, snapshots), so statement count
and bindings stay constant. The cursor keeps `kind`, `value` (version) and
`id` (last path, kept at the last path once routes are exhausted) and gains an
optional `record: {modelKey, entryId}`; a cursor without it is a path-phase
cursor, so in-flight sequences are unaffected by the deploy. Globals stay on
the first page.

Rejected: records on the first page like globals (unbounded size); a separate
records endpoint for builds (two traversals, two version checks, no single
snapshot of published state).

### D5 Format stays 2; `records` is additive

The format policy allows a key older consumers may ignore without a new
version. Strict schemas (API output, tests) require `records`; tolerant
schemas default it to `[]`, so a new SDK reads an rc2 API, and an rc2 SDK
drops records it could not use anyway. An rc2 SDK refuses a page that has a
`nextCursor` but no entries; such a page exists only when a project already
publishes more records than fit after its routed entries, which needs the
upgraded configuration package and therefore an upgraded SDK. The refusal is a
contract error that advises upgrading the SDK, never silently missing
content.

Rejected: `formatVersion: 3`, which would force every existing site to
upgrade `@lacecms/sdk` in lockstep for content it does not yet read.

### D6 Separate public record read and SDK type

`GET /api/v1/public/records/:modelKey` mirrors `listPublic` (published time
desc, id desc, same cursor rules, its own cursor kind) on a record SQL without
`published_routes`. The collection list and slug reads 404 for route-less
models, as for any non-collection key, so their DTO keeps a required `path`.
The SDK adds `listRecords` and `PublishedRecord`/`site.records(modelKey)`
(published time desc, id desc — the REST order) with media, image and link
lookups; `site.all`, `byPath`, `bySlug`, `entries()`, SEO resolution and the
sitemap never see records, which removes the sitemap workaround.

Rejected: making `path` optional on `PublishedEntry` and the public entry DTO
— it would weaken types for every existing site and REST consumer.

### D7 Links: non-routable by configuration, unavailable by SQL

The publication projection's target check already treats a target without a
published route as unavailable, so a route-less target can never be
published as a delivered link on either runtime. The application maps a
resolver status whose model is a route-less collection to `non-routable`
(draft save rejects it, as for globals) and passes the configured route-less
model keys — bounded by the model count — to the link-target listing so the
picker excludes them.

### D8 Route add/remove reuses the route-change class

The structural diff already reports `route` changes; an absent route is
compared as a value. Planning adds data evidence for removal only: snapshots
of the model holding a slug and reference locations targeting its entries,
read in the existing bounded snapshot pages. Adding a route needs no evidence
beyond the existing "refused while published" rule.

### D9 Admin follows configuration, not entry data

The admin model projection carries the optional `route`; one
`hasPublicRoute(model)` helper in `entities/content` replaces the
global-only checks that hide the slug control, path facts, "Open on site",
SEO card and the list slug cell, and selects the route-less unpublish copy.

## Risks / Trade-offs

- [Record SQL relies on the route-row invariant] → repository contract
  fixtures assert that every published routed entry has a route row and that
  record and entry sets are disjoint on both runtimes.
- [Two-range page statements are more complex] → fixtures cover pages that
  hold only entries, entries then records, only records, an oversized record
  alone on a page, and media scoped across the boundary.
- [Old SDK ignores records, and refuses record-only pages with a cursor] →
  accepted under the format policy because only projects that already use
  route-less collections produce such pages; the error advises an SDK upgrade
  and the public SDK guide states the minimum SDK for `site.records`.
- [Removing a route needs operators to clear slugs first] → the refusal names
  up to 20 snapshots; no automatic slug pruning, because sync never silently
  transforms content.
- [Picker exclusion binds a list of model keys] → bounded by configured models;
  no list is bound when there are no route-less collections.

## Migration Plan

No database migration and no data rewrite. Upgrading an installation changes
nothing until a configuration declares a route-less collection; the export
then carries `records: []` until one is published. Rollback: remove the
route-less model (sync refuses while entries exist) or add a route while it
has no published entry. Template and docs drop the sitemap `include`
workaround advice.
