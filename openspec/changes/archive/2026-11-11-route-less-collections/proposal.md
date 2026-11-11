## Why

A collection always needs a `route` with one `:slug` segment, and every entry
needs a slug before publication. Data that is only listed on another page —
About CV rows, testimonials, press mentions — therefore gets URLs nobody
renders. The tatianae.com rc2 mapping works around it three ways: a dummy
route (`/cv/:slug`), a hand-made slug for every row, and a sitemap filter
(`sitemapResponse(site, { include })`) that hides the resulting 404 URLs.

This is the fourth owner-inserted change after RF6, recorded in
[`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md) under
"Owner-inserted feature changes after RF6" and in
[`backlog.md`](../../../backlog.md) ("Route-less collections"). Owner decision
of 2026-11-11: entries of a route-less collection carry no slug at all (an
optional slug was considered and deferred; allowing it later is a compatible
relaxation).

## What Changes

- `defineCollection` accepts an absent `route`. A route-less collection keeps
  kind `collection` (lists, list fields, list options and default sort,
  duplication, delete) but owns no public paths. Configuration rejects `seo`
  on it and leaves it out of every path/route collision check.
- Its entries reject a slug in draft and publish mode (`slug_not_allowed`, as
  for globals) and need none to publish. Publication creates no
  `published_routes` row but still advances published state and requests a
  build; unpublish and delete behave as for routed entries.
- Adding or removing a route is a route change: `breaking`, refused while the
  model has a published snapshot. Removing a route is also refused while any
  snapshot of the model still holds a slug.
- Internal links: an `entry:` reference to a route-less entry is rejected as
  `non-routable` (as for a global); such entries stay valid link sources and
  are excluded from the admin link picker.
- Public delivery: the build export gains a `records` array — published
  route-less entries `{id, modelKey, title, fields, blocks, publishedAt,
  internalLinks}` — delivered in a second keyset phase after the routed
  entries. The key is additive under the format policy, so `formatVersion`
  stays `2`; tolerant consumers treat a missing `records` as empty.
- New anonymous `GET /api/v1/public/records/:modelKey` (cursor-paged, newest
  publication first). The collection list and slug reads answer `404` for a
  route-less model; path reads never see its entries.
- SDK: `listRecords(modelKey)` on the client; the site view gains
  `records(modelKey)` with media, image and link lookups. Records never appear
  in `all`, `byPath`, `bySlug`, `entries()` or the sitemap, so the sitemap
  workaround is no longer needed.
- Admin: the editor, collection list, publication card and publish/unpublish
  dialogs of a route-less collection show no slug, path or "Open on site".
- `lace import`: a route-less entry refuses `slug`; it is matched only through
  the state-file mapping and otherwise created.
- Node and D1 behave identically; no database migration.

Non-goals: optional slugs or any lookup key on records, SEO for route-less
entries, model-defined record ordering in the export (sites sort by their own
fields), bulk publication (separate backlog item), converting populated
collections between routed and route-less.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `content-model-configuration`: collections may omit `route`; SEO is limited
  to routable models.
- `content-validation`: publish requires a slug only for routed collections;
  route-less entry payloads reject a slug.
- `content-domain-rules`: route-less collection entries have no public path
  and own no published route.
- `content-use-cases`: route-less collection lifecycle without a route.
- `schema-evolution`: adding or removing a collection route is a route change;
  removing one requires slug-free snapshots.
- `internal-url-links`: route-less entries are non-routable targets.
- `rest-contracts`: model DTO without route, public records read, build export
  `records` phase, link picker exclusion.
- `public-sdk`: records read and export assembly.
- `published-site-loader`: site view `records(modelKey)`, consistency checks.
- `content-import-cli`: slug refused for route-less entries, state-file
  matching.
- `admin-draft-editor`: route-less editor without slug or path.
- `admin-draft-editor-publication`: publication card and dialogs without a
  path.
- `admin-remote-state-and-lists`: route-less collection list rows without slug.
- `content-repository-contracts`: shared fixtures cover route-less
  collections on both runtimes.

## Impact

- Architecture: [content-configuration](../../../docs/architecture/content-configuration.md)
  ("Content-model kinds", "System fields and routes", schema evolution
  table) and [api](../../../docs/architecture/api.md) (build export, public
  reads) are updated first; new ADR 0031 records the decision.
- `@lacecms/config`: optional `route` in `models/define.ts`, `models/types.ts`,
  collision checks, SEO validation, type tests.
- `@lacecms/content` / `@lacecms/domain`: payload validation flag, route-less
  `ContentModelRoute` variant, `contentPublicPath`.
- `@lacecms/application`: draft normalization, publication, link validation,
  sync planning (route add/remove evidence), build-export page selection.
- `@lacecms/db`, `platform-node`, `platform-cloudflare`: published-record SQL,
  export records phase and cursor, public records list, link target state;
  `packages/test-utils` repository-contract scenarios.
- `@lacecms/contracts`: model DTO, public record DTO, export/page schemas;
  OpenAPI regenerated.
- `@lacecms/server`: public records route, 404 for route-less collection
  reads.
- `@lacecms/sdk`, `@lacecms/astro`: client `listRecords`, site view
  `records()`, export assembly; template sitemap comment.
- `@lacecms/cli`: import format, JSON Schema, plan matching.
- Admin: entry editor, publication card and dialogs, collection list, link
  picker filter.
- MCP: no code change beyond inherited validation; tool descriptions mention
  route-less collections.
- Documentation: content-modeling guide, public SDK guide, internal URL links
  guide, import guide, backlog and roadmap progress log.
