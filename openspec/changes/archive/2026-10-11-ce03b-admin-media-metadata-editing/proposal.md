## Why

CE3A stored media alt text, caption and focal point and exposed
`PATCH /api/v1/admin/media/:mediaId`, but nobody can edit those values yet, and
the `image` block still demands its own alt text even when the media item
already describes itself. Step CE3 of
[`docs/content-editor-roadmap.md`](../../../docs/content-editor-roadmap.md)
continues with session **CE3B — Admin metadata editing**: editors describe an
image once, in the media library, and the `image` block inherits that
description unless it overrides it. CE3C (public delivery) then resolves the
effective alt text on the site.

## What Changes

- **Media details panel editing.** Writers (`media:write`) edit the alt text
  and caption of an active item in the details panel and save them explicitly
  through the CE3A route with `If-Match` from the item's `updatedAt`. Only
  changed values are sent. The panel announces the save and whether a site
  build was requested, keeps the typed values on failure, recovers from
  `MEDIA_UPDATE_CONFLICT` by showing the newer values and letting the writer
  discard theirs or save them over the newer version, and asks before closing
  with unsaved changes. Viewers and items pending deletion see the values
  read-only. An item without alt text shows a non-blocking warning.
- **Focal-point control.** The panel preview becomes a focal-point control:
  click or drag on the image sets the point; the marker is keyboard focusable
  and moves with the arrow keys (1 % per press, 10 % with Shift); a reset
  action clears the point (the site then centres the image). The current value
  is announced as percentages.
- **Picker and selected media show alt text.** Picker tiles and the selected
  media card of a media field show the item's alt text, or "No alt text".
- **Inherited alt in the block editor.** A block whose definition has exactly
  one media field and a text field keyed `alt` (the built-in `image` block, or
  a custom block with the same shape) shows the selected media's alt text as
  the alt field's placeholder ("Uses media alt: …"), and warns, without
  blocking save or publication, when both the block alt and the media alt are
  empty. Field renderers gain an optional placeholder and notice.
- **`image` block version 2.** The built-in `image` block makes `alt`
  optional and moves to version 2. Under the CE1 schema-evolution rules a
  changed block definition must raise its version and declare a migration to
  every version, so version 2 declares an identity migration: stored data is
  not transformed, but configuration sync rewrites the stored schema version
  of existing `image` blocks (drafts get a new revision by
  `system:content-sync`), and every model that allows `image` must raise its
  version. The repository's own `lace.config.ts` models are bumped. This
  corrects the roadmap's "needs no data migration": no data changes, but the
  version bump and sync are required.
- **Block sources.** The registry `image` item moves to block version 2,
  revision 2; its component renders `alt=""` when the block has no alt text
  (CE3C replaces this with the effective alt). The starter template, the
  reference site, the existing-site guide fixture and their `lace.site.json`
  locks are updated together, and the reference site's fixture export holds
  version 2 `image` blocks.
- Documentation: architecture section 8 *Initial built-in blocks*, ADR 0009
  (block version consequence), and the content-editor roadmap (CE3B log row,
  the corrected migration wording, and the upgrade instruction CE3C must ship).

Not in this change: the public entry shape, the resolved media dictionary, the
SDK `image()` helper, effective alt text on the site and focal-point rendering
(all CE3C); a template version bump and upgrade notes (CE3C bumps the template
once for the whole CE3 public change); bulk metadata editing; alt text for the
hero block (it uses the media alt in CE3C).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-media-library`: metadata editing in the details panel with
  concurrency recovery, the focal-point control, the missing-alt warning, and
  alt text on picker tiles.
- `admin-draft-editor`: the selected media card shows alt text; media-alt
  inheritance (placeholder and missing-alt warning) for alt-and-media blocks.
- `block-registry`: the built-in `image` block is version 2 with optional alt
  text and an identity migration.
- `block-source-registry`: the `image` registry component renders an empty
  alt attribute when the block has no alt text.

## Impact

- Packages: `@lacecms/content` (`builtInBlocks.image` v2), `apps/admin`
  (admin client `updateMediaMetadata`, a new `features/edit-media-metadata`
  slice, media details panel, media grid, selected media, field renderer,
  block card), `registry/astro/image`, the CLI's bundled registry copy,
  `packages/create-lace/templates/site`, `apps/site`,
  `tests/fixtures/existing-astro-site`, generated-project snapshot fixtures,
  config projection fixtures, and the root `lace.config.ts`.
- API: none. CE3A's route and DTOs are consumed unchanged.
- Data: no database migration. Configuration sync migrates stored `image`
  blocks from version 1 to 2 without changing their data; draft revisions of
  affected entries increase, so an editor open during that sync gets the usual
  revision conflict.
- Compatibility: a project that upgrades `@lacecms/content` must raise the
  version of every model that allows `image` and run sync before building its
  site, because the render core refuses blocks whose stored version differs
  from the site definition. The instruction is recorded for CE3C's template
  upgrade notes; no release happens between CE3B and CE3C.
- Dependencies: CE3A is archived. No new third-party dependencies.
- Architecture: section 8 of
  [`docs/mvp-architecture.md`](../../../docs/mvp-architecture.md). Sections 12
  and 13 change in CE3C.
