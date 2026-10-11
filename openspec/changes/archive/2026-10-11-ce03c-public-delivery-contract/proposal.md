## Why

CE3A and CE3B let editors describe media once (alt text, caption, focal point),
but public consumers still receive bare media IDs inside a misleading
`{entry: {draft, published, …}, path}` shape where `draft` is a copy of the
publication. Sites cannot render alt text, dimensions or the focal point, so the
starter blocks still hardcode `alt=""`. Step CE3 of
[`docs/content-editor-roadmap.md`](../../../docs/content-editor-roadmap.md)
closes with session **CE3C — Public delivery contract**: public endpoints and
the build export return the published entry directly with a resolved media
dictionary, and the SDK, render core and starter blocks use it. This completes
step CE3.

## What Changes

- **BREAKING — public entry shape.** Public page, collection, slug, path and
  build-export responses return the published entry directly:
  `{id, modelKey, path, slug?, title, fields, blocks, publishedAt}` with blocks
  ordered by position. The `draft`, `published` and `model` keys and the outer
  `{entry, path}` wrapper of list items disappear. Single reads return
  `{entry, media}`, collection pages `{items, media, nextCursor?}`, the build
  export `{entries, media, version}`.
- **Resolved media dictionary.** Every public content response carries a
  `media` object keyed by media ID with
  `{id, url, mimeType, width, height, alt, caption, focalPoint}` for every
  media item the returned entries' published snapshots reference (from the
  content reference projection). Unknown values are `null`. Field and block
  values keep storing IDs. `url` uses the API's public base URL.
- **ETag unchanged.** The build-export ETag stays the published-state version;
  CE3A already bumps it when metadata of published media changes, which is now
  observable in the export body.
- **SDK.** The REST client returns the new DTOs (`getAllCollection` merges the
  media of all pages). `PublishedEntry` gains `publishedAt`, `media(id)` and
  `image(mediaId, usageAlt?)`; `PublishedSite` gains the same two lookups.
  `image()` returns the resolved item with the effective alt text (usage alt,
  then media alt, then `""`). `site.mediaUrl(id)` and resolved media URLs use
  the site's `LACE_PUBLIC_BASE_URL` when configured and the server-provided URL
  otherwise. A malformed media dictionary fails contract validation.
- **Render core and Astro adapter.** Block props gain
  `image(mediaId, usageAlt?)`, returning `{src, alt, width?, height?,
  objectPosition?, caption?}` from the entry's resolved media, with
  `object-position` derived from the focal point; a referenced item missing
  from the dictionary fails with a new `missing_media` render error. The
  existing `mediaUrl` prop and the `LaceBlocks` props stay, so pages and
  unmodified older block sources keep working.
- **Block sources.** Registry `image` (revision 3) and `hero` (revision 2)
  render the effective alt text, `width`/`height` and the focal-point
  `object-position`; the image caption falls back to the media caption. The
  starter template, reference site and existing-site fixture copies and their
  locks are updated together; the reference fixture export gains a media
  dictionary.
- **Template 0.23.0 and upgrade notes.** The managed template version moves to
  `0.23.0`. Upgrade instructions describe migrations `0005` and `0006`, the
  breaking public shape for code that reads REST responses or the raw export,
  how to adopt the new block sources (`lace add block`), and the CE3B step:
  raise the version of every model that allows `image` and run configuration
  sync before building, because the render core refuses `image` blocks stored
  at version 1. `docs/compatibility.md` records the contract break for the
  next alpha.
- **Fixes found while planning.** The generated-project acceptance journey
  saves `image` blocks at schema version 1 (rejected since CE3B); the
  in-memory repository fake returns the real draft from public reads.
- Documentation: architecture sections 12 and 13, ADR 0009, the content-editor
  roadmap (CE3C log row, CE3 done) and the managed Astro guide.

Not in this change: responsive images and `srcset` (CE11), media title or
credit, publishing a release (the next alpha release change raises registry
`requires` and package versions), SEO media (CE4).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `rest-contracts`: public content DTOs use the published entry shape and the
  resolved media dictionary; public entry routes document their responses.
- `content-repository-contracts`: public reads return each entry's referenced
  active media; fakes and both runtimes expose no draft.
- `public-sdk`: client operations return the new public DTOs.
- `published-site-loader`: entries expose `publishedAt`, `media()` and
  `image()`; the site exposes the media lookups; media URL origin rule and
  dictionary validation.
- `render-core`: the `image()` block prop, image descriptions and the
  `missing_media` error.
- `astro-adapter`: block components receive the `image()` prop.
- `block-source-registry`: `image` and `hero` sources render effective alt,
  dimensions and focal point.
- `astro-reference-site`: the reference site renders resolved media from its
  fixture export.
- `generated-project-acceptance`: the journey saves current block versions and
  verifies alt text, dimensions and focal point on the built site.
- `project-generator`: template `0.23.0` with the public delivery upgrade
  instructions.
- `cross-runtime-product-verification`: parity checks use the public entry
  shape and compare media dictionaries instead of a mirrored draft.

## Impact

- Code: `packages/contracts`, `packages/application` (public read port),
  `packages/db` (shared SQL), `packages/platform-node`,
  `packages/platform-cloudflare`, `packages/test-utils`, `packages/server`,
  `packages/domain` (effective alt rule), `packages/sdk`, `packages/render`,
  `packages/astro`, `registry/astro/{image,hero}`, `apps/site`,
  `packages/create-lace` (template, version, upgrade instructions, guide),
  `tests/fixtures/existing-astro-site`, `apps/api/openapi/api-v1.json`.
- Scripts and tests: generated-project, existing-site and cross-runtime
  acceptance scripts, D1 HTTP budget acceptance (one more query per public
  read), runtime and SDK tests.
- APIs: breaking change to every `/api/v1/public` JSON response (alpha).
  Admin APIs and the media binary route are unchanged. No database migration.
- Depends on CE1 (block versions), CE3A (metadata, version bump) and CE3B
  (`image` v2).
