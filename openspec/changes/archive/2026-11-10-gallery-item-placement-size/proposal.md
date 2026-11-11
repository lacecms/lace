## Why

Gallery layout settings apply to the whole block, so the tatianae.com
portfolio grid is built from several consecutive galleries plus a hand-typed
envelope class and site CSS. Three rows cannot be expressed today: an item only
in the right column, an arbitrary item spanning both columns (only the first
item of `featured-first` can) and an image at its intrinsic width (a 405px GIF
is stretched to its cell). Portfolio videos are almost always ambient, yet each
item starts as `player`.

This is the second owner-inserted change after RF6, recorded in
[`docs/refactoring-roadmap.md`](../../../docs/refactoring-roadmap.md) under
"Owner-inserted feature changes after RF6", with the owner decisions of
2026-11-10 in [`backlog.md`](../../../backlog.md). Later changes migrate from
rc2 only ([ADR 0030](../../../docs/adr/0030-rc2-oldest-supported.md)).

## What Changes

- New reusable list-layout item field `placement` (`auto`, `full`, `start`,
  `end`; default `auto`) from `listLayoutItemFields()` in `@lacecms/content`.
  In `grid` mode `start` places the item in the first column, `end` in the last
  column and `full` across all columns, for every preset; flex modes retain the
  value without effect. Adopting renderers expose it as
  `data-lace-placement` on the item, and `ListLayout.css` implements it.
- **BREAKING:** the `featured-first` grid preset is removed from
  `layoutPreset`. Gallery migrates it; a custom block that stored it must
  migrate its own data.
- `gallery` advances to definition version 6:
  - every item gains `placement`; image items gain `size` (`fill`, `natural`;
    default `fill`), exposed as `data-lace-size`;
  - video items default to `ambient` playback (`videoEmbed` keeps `player`);
  - migration 6 rewrites `featured-first` to `columns-2` with a `full` first
    item and writes `playback: "player"` to stored video items that rely on
    the old default, so rc2 galleries render as before.
- Natural images keep their intrinsic width, capped to the cell with preserved
  proportions and no horizontal overflow, and request sizes no wider than
  their own width. The starter and reference site themes apply their crop to
  `fill` images only.
- Registry `astro/gallery` revision 8 (block version 6); root and starter
  models that allow `gallery` advance their versions; template `0.48.0`
  upgrade instructions, guides, public documentation and snapshots follow.
- Architecture §8 names the reusable item field.

Non-goals: placement in flex modes, per-block playback defaults, drag-and-drop
item ordering, an `image` block `size`, changes to `videoEmbed`, new admin
editors (the fields use the existing select presentation).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `list-layout`: presets lose `featured-first`; a reusable item `placement`
  field with its grid rules and `data-lace-placement` hook.
- `gallery-block`: version 6 items with `placement` and image `size`, ambient
  playback default, the version 6 migration, and item markup hooks.
- `block-source-registry`: gallery revision 8 / block version 6, natural-size
  image sizes, and the non-default sizing scenario without `featured-first`.
- `astro-reference-site`: the reference theme crops only `fill` gallery images
  and renders `natural` images at their intrinsic width.

## Impact

- Architecture: [§8 content configuration](../../../docs/architecture/content-configuration.md#presentation-metadata);
  §13 rendering is unchanged (site CSS still owns image proportions).
- `@lacecms/content`: `blocks/list-layout.ts`, `blocks/built-ins.ts`, public
  index export, tests.
- Registry and sites: `registry/astro/gallery/*`, `apps/site`,
  `packages/create-lace/templates/site`, `tests/fixtures/existing-astro-site`
  (byte-identical copies), site theme CSS, `lace.config.ts` and the starter
  `lace.config.ts`.
- Generator: `templates/.lace/upgrade-instructions.json`,
  `templates/docs/lace-astro-site.md`, generated-project snapshots.
- Admin: preset tests and e2e that reference `featured-first`.
- Documentation: `apps/docs` composites and Astro integration pages.
- Data: stored rc2 galleries are rewritten by configuration sync to version 6.
