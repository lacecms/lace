## Context

- `listOptions` (`packages/config/src/models/list-options.ts`) accepts only
  `sortableFields`, `filterableFields` and `searchableFields`; `assertOnlyKeys`
  rejects anything else. It is projection-only: structural hashes and the
  internal `publicProjectionHash` exclude it, so query-only edits need no
  version bump and, with a trusted baseline, no build.
- The admin list default `-updatedAt` is a constant in two places:
  `DEFAULT_CONTENT_ENTRY_SORT` in `@lacecms/application` (applied in
  `ContentUseCases.list` when `input.sort` is absent) and `DEFAULT_ENTRY_SORT`
  in the admin (left out of the URL by `collection-search.ts` and of the API
  query by `CollectionEntries`, and used as the Sort selector and header
  fallback).
- REST and MCP `list_entries` both call `ContentUseCases.list`, so a default
  applied there reaches both. The repository receives an explicit sort and puts
  it into the cursor fingerprint, so Node and D1 already page any configured
  field sort identically.
- `@lacecms/contracts` validates model metadata with
  `collectionListOptionsSchema` (a strict object of target arrays) and a model
  check that iterates every `listOptions` entry as a key array.
- The six system sorts are listed in `@lacecms/contracts`
  (`contentEntrySystemSortSchema`) and in `@lacecms/application`
  (`CONTENT_ENTRY_SORTS`). `@lacecms/config` depends only on
  `@lacecms/content`, so it cannot import either.

## Goals / Non-Goals

**Goals:** one optional, validated default per collection; the same ordering
and cursor rules as the explicit sort; no build or content rewrite; existing
configurations unchanged byte for byte.

**Non-Goals:** see proposal (manual ordering, public order, multiple keys,
pages/globals, per-user sorts).

## Decisions

### D1 The default is an API sort string validated against `sortableFields`

`listOptions.defaultSort` takes the admin list `sort` syntax (owner decision).
`normalizeListOptions` reads it after normalizing `sortableFields` and accepts
a system sort, or `field:<key>` / `-field:<key>` with `<key>` in the normalized
`sortableFields`. Errors name `listOptions.defaultSort`. `-updatedAt`
normalizes to omission (the documented default, and the only way existing
hashes stay equal when someone writes it explicitly). A `defaultSort` alone
keeps `listOptions` nonempty.

Typing: `CollectionListOptions<Fields>` gains
`defaultSort?: ContentEntrySystemSort | \`field:${K}\` | \`-field:${K}\`` with
`K = ListQueryFieldKey<Fields, ListQueryableFieldType>`. Membership in the
declared `sortableFields` array is a runtime check only.

Alternatives rejected: an object `{ field, direction }` (owner chose the API
string; an object needs a separate system marker because user fields may be
named `title`); inferring `sortableFields` as a const tuple to type exact
membership (adds a generic to `defineCollection` and risks inference
regressions in existing configurations for a check runtime already makes).

### D2 System sorts are declared once in `@lacecms/content`

`@lacecms/content` exports `CONTENT_ENTRY_SYSTEM_SORTS` (the six values,
frozen) and its type next to the existing list-query policy. Config validates
against it; `contracts` builds `contentEntrySystemSortSchema` from it and
`application` derives `CONTENT_ENTRY_SORTS` from it, so the three cannot
drift. This keeps the dependency direction (content ← config, contracts,
application).

### D3 The use case resolves the effective sort

`ContentUseCases.list` computes
`input.sort ?? model.listOptions?.defaultSort ?? DEFAULT_CONTENT_ENTRY_SORT`
(collections only) before `resolveCollectionQuery` and the repository call.
Nothing below the use case changes: the repository gets an explicit sort and
writes it into the cursor fingerprint, so a cursor from an omitted-sort page
fails at `/after` once the default changes, and an explicit `-updatedAt`
cursor is rejected without `sort` on a collection whose default differs. The
REST route and MCP tool stay as they are.

### D4 Metadata schemas carry the default

`collectionListOptionsSchema` adds
`defaultSort: v.optional(contentEntrySortSchema)`. The model check validates
target arrays as before and checks that a field `defaultSort` names an entry
of `sortableFields`; it no longer treats every entry as a key array. The model
projection already copies `listOptions` and must copy the string unchanged.
`collectionCapabilityIdentity` is unchanged: the effective sort already
identifies cursors, and the admin sends it explicitly (D5). OpenAPI is
regenerated.

### D5 The admin sends the effective sort and omits the model default from the URL

- `parseCollectionSearch` keeps every valid sort, including `-updatedAt`; it no
  longer knows the default.
- `resolveCollectionListSearch` (model-aware, runs after metadata loads) drops
  a URL sort equal to the model's effective default, so `?sort=field:order` on
  a collection with that default normalizes away and links stay canonical.
- A helper `defaultCollectionSort(model)` returns
  `model.listOptions?.defaultSort ?? DEFAULT_ENTRY_SORT`. `CollectionEntries`
  uses it for the Sort selector value, the header sorting state and the query
  it sends. The query it sends always carries the effective sort, so cache
  keys and requests cannot reuse a page loaded under an older default; only
  the URL omits it.
- Selecting the model default writes no `sort` to the URL; selecting anything
  else writes it.

Alternative rejected: omitting the default from the API request too and adding
`defaultSort` to `collectionCapabilityIdentity` for cache identity. It would
also invalidate explicit-sort cursors whenever the default changes and keeps
two places that must agree on the default.

### D6 Delivery surfaces

No migration, no template version change (template `0.48.0` is unpublished and
the feature needs no upgrade step). Documentation: the content-modeling page,
internal `docs/collection-queries.md`, the generated-project operations guide
example (snapshots regenerated) and architecture §8 "Collection list metadata".
The starter and root configurations do not adopt `defaultSort`; an admin e2e
mock model does.

## Risks / Trade-offs

- [Older engines reject `defaultSort`] → like other `listOptions` additions:
  upgrade packages before adopting it; removing it restores the old default.
- [A default changes while an editor pages] → the continuation fails at
  `/after` and the existing Restart list action recovers.
- [Bookmarked `?sort=-updatedAt` links of collections without a default] →
  still valid; the model-aware resolver removes it because it equals that
  collection's default.

## Migration Plan

None required. Adopting it: add `defaultSort` to a collection's `listOptions`
and run `pnpm content:sync`; with a trusted public baseline no build is
requested.
