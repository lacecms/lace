## Why

A collection's admin list always opens sorted by `-updatedAt`, and
`listOptions` cannot change that. The tatianae.com portfolio orders its
projects by a numeric `order` field, so editors pick the Order sort on every
visit; the URL keeps a chosen sort only while they stay on that list.

This is the third owner-inserted change after RF6, recorded in
[`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md) under
"Owner-inserted feature changes after RF6" and in [`backlog.md`](../../../backlog.md)
("Configurable default collection sort"). Owner decisions of 2026-11-10: the
default is written in the API sort syntax, and any sort other than the model's
own default stays in the admin URL.

## What Changes

- New optional `listOptions.defaultSort` on collections, written in the admin
  list `sort` syntax: one of the six system sorts (`updatedAt`, `-updatedAt`,
  `title`, `-title`, `publishedAt`, `-publishedAt`) or `field:<key>` /
  `-field:<key>` naming an entry of the same collection's `sortableFields`.
  Normalization rejects anything else before startup; `-updatedAt` normalizes
  to omission, so existing configurations keep their hashes.
- The admin entry-list API, and through it MCP `list_entries`, applies the
  collection's `defaultSort` when a request has no `sort`; without one the
  default stays `-updatedAt`. Pages and globals are unchanged.
- The admin collection list opens in the model's default sort, shows it in the
  Sort selector and column headers, leaves it out of the URL, and keeps every
  other valid sort in the URL, including `-updatedAt`.
- `defaultSort` is projection-only like the rest of `listOptions`: no model
  version bump, no content rewrite, no published-state advance or build when
  a trusted public baseline exists. Shared metadata schemas and the generated
  OpenAPI expose it.
- Public delivery, exports and the SDK keep their order; the site still sorts
  published entries itself.

Non-goals: drag-and-drop or manual ordering, a public order contract, more
than one sort key, defaults for pages or globals, per-user saved sorts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `collection-query-options`: `listOptions` accepts `defaultSort`, with its
  validation, normalization and synchronization behavior.
- `rest-contracts`: the admin entry-list default sort comes from the
  collection's `defaultSort`, otherwise `-updatedAt`.
- `admin-remote-state-and-lists`: the collection list's default sort, and
  therefore what is left out of the URL, is the model's default.

## Impact

- Architecture: [§8 content configuration](../../../docs/architecture/content-configuration.md)
  ("Collection list metadata") names `defaultSort`; no invariant changes.
- `@lacecms/config`: `models/list-options.ts`, `models/types.ts`, type tests.
- `@lacecms/contracts`: `collectionListOptionsSchema`, model metadata
  validation; `apps/api/openapi/api-v1.json` regenerated.
- `@lacecms/application`: list use case resolves the default sort.
- Admin: `app/router/collection-search.ts`, `CollectionEntries`, unit tests,
  `e2e/collection-queries.e2e.ts` and its mock backend.
- Documentation: `apps/docs` content-modeling page, internal
  `docs/collection-queries.md`, the generated-project operations guide
  (generated snapshots follow).
- MCP needs no code change: `list_entries` inherits the default from the use
  case.
- No database migration; Node and D1 reuse the existing typed sort and bounded
  cursor code. A continuation cursor from a request without `sort` keeps the
  effective sort in its identity, so changing `defaultSort` during paging
  fails the continuation at `/after` as other configuration changes do.
