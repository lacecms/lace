# ADR 0011: SEO system group

- Status: Accepted
- Date: 2026-10-12
- Governing architecture: [section 8](../mvp-architecture.md#8-content-configuration),
  [section 9.3](../mvp-architecture.md#93-content-snapshots),
  [section 9.7](../mvp-architecture.md#97-media),
  [section 12](../mvp-architecture.md#12-rest-api) and
  [section 16](../mvp-architecture.md#16-database-portability-and-d1-constraints)
- Related: [content and editor roadmap](../content-editor-roadmap.md) step CE4,
  OpenSpec change `ce04a-seo-data-contract`

## Context

Lace stored no search or social metadata. Sites hand-wrote `<title>` and meta
tags, could not mark an entry canonical elsewhere or exclude it from indexing,
and had no image to share. Site-wide values such as the site name belong to a
global (ADR 0010).

## Decision

1. **A per-entry system group, opt-in per routable model.** A page or
   collection declares `seo: true` or `seo: { description?, image? }`, naming
   a `text`/`textarea` and a `media` field of the same model as fallbacks.
   Globals cannot declare `seo`. Enabling SEO is structural (a version bump);
   the mapping is projection-only. A model without the option has no `seo`
   property, so existing hashes are unchanged.
2. **Storage with the snapshot, outside `fields`.** The group
   `{title?, description?, image?, canonical?, noindex?}` is a sparse JSON
   object in `content_snapshots.seo_json` (migration `0008`, additive). Save,
   publish, revert and duplicate copy it. Project field keys never collide
   with it, and it never appears in field validation or sync field diffs.
3. **One rule set in the domain.** Single-line plain text (title at most 200,
   description at most 500 code points), an absolute `http`/`https` canonical
   URL without credentials or fragment (at most 2,048 characters), a media ID
   image and a boolean `noindex`. Contracts reuse the predicates; failures are
   `422` issues under `/seo`. A non-null group on a model without SEO fails
   with `seo_not_allowed`.
4. **The SEO image is an ordinary media reference.** It is recorded with
   source key `$seo` and field path `image`, so the deletion guard, usage
   counts, metadata-driven builds, public media reads and the media dictionary
   need no special path.
5. **Site defaults by field mapping.** At most one global declares
   `seoDefaults: { siteName, titleTemplate?, description?, image? }`, naming
   its own fields. No separate storage exists.
6. **Fallbacks are resolved by the SDK, not stored or served resolved.** The
   chain is: title — the SEO title verbatim, otherwise the entry title through
   the title template (`%s`, default `%s | {siteName}`); description and image
   — the SEO value, then the model's mapped field, then the site default,
   otherwise omitted; canonical — the SEO value, otherwise site URL plus path;
   `noindex` — `noindex, follow` and no sitemap entry. The build export
   carries a `seo` section with the mappings so the resolver needs no model
   configuration.
7. **Disabling SEO is destructive.** Sync applies it when no snapshot holds a
   group, refuses it with `SEO_REMOVAL_HAS_DATA` otherwise, and with the
   temporary `removedSeo: true` hint clears the groups and their `$seo`
   references in the guarded sync mutation.

## Alternatives considered

- **Relational SEO columns.** Rejected: five columns at every copy site and a
  migration for every later key.
- **A reserved key inside `fields_json`.** Rejected: key collisions with
  project fields, and the values would leak into field validation, sync field
  diffs and public `fields`.
- **Rules in `@lacecms/content` beside `isSafeUrl`.** Rejected: `isSafeUrl`
  deliberately accepts relative, `mailto:` and `tel:` values; the domain
  already owns the comparable media text rules.
- **Resolving fallbacks in the API.** Rejected: it freezes the fallback
  policy into the REST contract and contradicts the owner decision.
- **The mapping inside every public entry.** Rejected: it repeats model
  configuration per entry, and single reads would still lack the defaults
  global.
- **Emitting `seo` only when values are stored.** Rejected: consumers could
  not tell "no values" from "SEO disabled".
