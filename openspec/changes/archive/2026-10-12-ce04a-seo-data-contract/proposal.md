## Why

Lace stores no search or social metadata. Sites hand-write `<title>` and meta
tags, cannot tell search engines that an entry is canonical somewhere else or
should not be indexed, and have no image to share. Step CE4 of
[`docs/content-editor-roadmap.md`](../../../docs/content-editor-roadmap.md)
adds per-entry SEO with fallbacks and site defaults. This change implements
session **CE4A — SEO data and contract**: configuration, storage, validation,
the lifecycle copies and the REST/export contract. The site output (`<LaceSeo>`,
sitemap, robots, SDK resolver) is CE4B and the admin SEO section is CE4C.

## What Changes

- **`seo` model option** in `@lacecms/config`. A page or collection declares
  `seo: true` or `seo: { description?, image? }`. The object names fallback
  fields of the same model: a `text` or `textarea` field for the description
  and a `media` field for the image. A global that declares `seo` is rejected.
  Whether SEO is enabled is structural, so turning it on or off needs a model
  version bump. The fallback mapping is projection-only, like `listFields`.
- **`seoDefaults` global option**:
  `defineGlobal({ seoDefaults: { siteName, titleTemplate?, description?, image? } })`
  names fields of that global. `siteName`, `titleTemplate` and `description`
  must be `text` or `textarea` fields and `image` must be a `media` field.
  Configuration rejects a second global that declares `seoDefaults`, and it
  rejects `seoDefaults` on pages and collections. The option is
  projection-only, and no separate storage is added for defaults.
- **The SEO group** belongs to the snapshot, outside `fields`, so its keys never
  collide with project field keys:
  `{ title?, description?, image?, canonical?, noindex? }`.
  - The rules live in `@lacecms/domain` and contracts reuse them.
  - `title` and `description` are single-line plain text. They are trimmed, an
    empty value clears them, and control characters are not allowed. Hard API
    limits: 200 code points for the title and 500 for the description.
  - `canonical` is an absolute `http`/`https` URL without credentials or a
    fragment, at most 2,048 characters.
  - `image` is the ID of an active media item.
  - `noindex` is a boolean, stored only when `true`.
- **Migration `0008`** adds a nullable `content_snapshots.seo_json` column on
  Node SQLite and D1. It is a plain `ALTER TABLE … ADD`, with no rebuild and no
  backfill.
- **Lifecycle.** Save, publish, revert and duplicate copy the SEO group.
  - Create and save accept it. Saving `seo` for a model without SEO fails with
    `422 seo_not_allowed` at `/seo`.
  - Publish re-validates it in publish mode.
  - The SEO image becomes a `content_media_references` row with source key
    `$seo` and field path `image`. It counts toward the 200-reference limit,
    blocks media deletion, appears in media usage and is served by the public
    media endpoint.
- **Synchronization.** Enabling `seo` is a compatible structural change.
  Disabling it is destructive:
  - Without data it is applied.
  - With stored SEO values and no hint it is refused with
    `SEO_REMOVAL_HAS_DATA`.
  - With the new temporary model hint `removedSeo: true`, the SEO group and its
    `$seo` media references are pruned in the guarded sync mutation.
  - Changing a fallback mapping or `seoDefaults` is a projection-only change.
    Like every such change, it advances the published version.
- **Contracts.**
  - **Admin.** Draft and published snapshot DTOs carry `seo` for models with
    SEO enabled:
    `{title, description, image, canonical, noindex}`, with `null` for unset
    values.
  - **Create and save requests** accept an optional, nullable `seo`.
    Leaving it out stores no SEO values, so the request still replaces the
    whole draft.
  - **Model DTOs** carry `seo` (the fallback mapping) for routable models and
    `seoDefaults` for the defaults global.
  - **Media usage** gains a `{source: "seo", field: "image"}` location.
  - **Public.** Entries carry the same `seo` object for models with SEO enabled.
  - **Build export** gains an additive `seo` section that holds the fallback
    mappings and the defaults global mapping, which the CE4B resolver needs.
  - **The public media dictionary** includes SEO images.
  - OpenAPI is regenerated.
- **Admin, without SEO UI.** Save sends back the loaded draft's `seo`
  unchanged, so it no longer erases values set through the API. The media
  details panel labels the new location *SEO image*.
- **SDK.** `PublishedEntry.seo` passes the stored public values through. The
  SDK does not resolve fallbacks yet; that is CE4B.
- **Documentation:**
  - architecture sections 8, 9.3, 9.7, 12 and 16;
  - ADR 0011 (system group and fallback chain);
  - `docs/database-migrations.md` and `docs/compatibility.md`;
  - the roadmap (CE4 in progress).

Not in this change:

- `site.seo()`, `site.url`, `<LaceSeo>`, the sitemap and robots helpers, the
  builder's site URL and `LACE_SITE_INDEXING`, and starter or reference-site
  SEO with the template bump (all CE4B);
- the admin SEO section, counters, soft warnings, inherited placeholders and
  the preview (CE4C);
- SEO for globals;
- resolving fallbacks in single public reads.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `content-model-configuration`: the `seo` model option, `seoDefaults`, the
  `removedSeo` hint and their hash participation.
- `content-domain-rules`: SEO text, canonical URL and image rules, and the
  snapshot SEO group.
- `content-use-cases`: SEO on create, save, publish, revert and duplicate, and
  the `$seo` media reference.
- `configuration-synchronization`: enabling and disabling SEO, the
  `SEO_REMOVAL_HAS_DATA` refusal and the hinted prune.
- `sqlite-schema-and-migrations`: `content_snapshots.seo_json` and migration
  `0008`.
- `content-repository-contracts`: SEO persistence, copies, media references
  and public reads on both runtimes.
- `rest-contracts`: SEO in admin snapshot, request, model and public DTOs, the
  export `seo` section and the media usage location.
- `media-use-cases`: SEO images count as media usage.
- `admin-draft-editor`: save round-trips stored SEO values.
- `admin-media-library`: the *SEO image* usage label.
- `published-site-loader`: `PublishedEntry.seo` pass-through.

## Impact

- Code:
  - `packages/config`, `packages/domain`, `packages/content` (issue export
    only, if needed);
  - `packages/application` (use cases, sync classification and writes, ports);
  - `packages/db` (schema, migration `0008`, shared SQL, usage mapping);
  - `packages/platform-node`, `packages/platform-cloudflare` and
    `packages/test-utils` (fake and contract suite);
  - `packages/contracts`, `packages/server` and `packages/sdk`;
  - `apps/admin` (save round-trip, usage label);
  - `apps/api/openapi/api-v1.json`.
- APIs. Additive admin and public DTO keys, plus a new error issue code
  (`seo_not_allowed`) and sync diagnostic (`SEO_REMOVAL_HAS_DATA`). The admin
  media usage location union gains a variant. The export gains an optional
  `seo` key, so older SDKs reject the new export; the SDK already moves with
  the API in the next alpha.
- Database: migration `0008` (additive column).
- Architecture sections 8, 9.3, 9.7, 12 and 16.
- Depends on CE1 (structure baselines and hints), CE3C (media dictionary) and
  CE5 (globals). CE4B and CE4C build on it.
