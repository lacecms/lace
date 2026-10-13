# ADR 0011: SEO system group

- Status: Accepted
- Date: 2026-10-12
- Governing architecture: [section 8](../mvp-architecture.md#8-content-configuration),
  [section 9.3](../mvp-architecture.md#93-content-snapshots),
  [section 9.7](../mvp-architecture.md#97-media),
  [section 12](../mvp-architecture.md#12-rest-api) and
  [section 16](../mvp-architecture.md#16-database-portability-and-d1-constraints)
- Related: [content and editor roadmap](../archive/content-editor-roadmap.md) step CE4,
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

## Site output (CE4B)

OpenSpec change `ce04b-site-seo-output` implements decision 6 on the site:

- The SDK reads the site URL from `LACE_BUILD_SITE_URL`, the operator setting
  already used for "Open on site", and the deployment switch from
  `LACE_SITE_INDEXING` (`on` by default, `off`). Builders and Pages builds pass
  both to the site build. Lace does not set Astro's `site` option, so the
  value also works in `astro dev` from `.env`.
- `resolveSeo` is a pure SDK function bound as `site.seo(entry)`. A custom
  title template applies only when it contains `%s`, inserted literally;
  otherwise the default `%s | {siteName}` applies, or the bare title without
  a site name. Only resolved `image/*` media count as images.
- Indexing `off` resolves every page to `noindex, nofollow`; a stored
  `noindex` gives `noindex, follow`.
- The sitemap lists every published entry except `noindex` entries and
  entries whose stored canonical points to another URL. Without a site URL
  no sitemap is written and the build warns.
- `@lacecms/astro` ships `LaceSeo.astro` and the sitemap and robots response
  helpers; sites own the layout and endpoint files.

## Admin editing (CE4C)

OpenSpec change `ce04c-admin-seo-editing` adds the editor surface:

- An *SEO* card in the entry editor of SEO-enabled models holds the group in
  the draft form, so dirty tracking, discard, revert, conflict recovery and
  "Copy my JSON" need no separate path. Saves send the complete group.
- Recommended lengths (60 and 160 characters) only warn; the domain limits
  are validated locally through the predicates re-exported by
  `@lacecms/contracts`.
- Placeholders and a search-result preview apply decision 6 to unsaved
  values. `seoText` and the title template rule (`formatSeoTitle`) live in
  `@lacecms/contracts`, shared by the admin preview and the SDK resolver.
- Site defaults come from the published snapshot of the defaults global,
  which is what the next build reads; without one the editor shows the next
  step of the chain.

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
- **A separate `LACE_SITE_URL` for site builds, or Astro's `site`.** Rejected:
  a second name for the same operator value could drift from the admin links,
  and Astro's `site` is not visible to the loader or other frameworks.
- **An empty sitemap without a site URL.** Rejected: sitemap locations must
  be absolute, and the owner decision is that no sitemap is generated.
