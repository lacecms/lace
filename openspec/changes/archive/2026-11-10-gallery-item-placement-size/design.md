## Context

- `packages/content/src/blocks/list-layout.ts` exports `listLayoutSettings()`
  (`layoutMode`, `layoutWrap`, `layoutPreset` with choice-card diagrams) and
  `listLayoutSettingsVisibility()`. Gallery spreads them into its block
  `settings`. Items are block data: a `field.group` inside `images`, with
  `kind`-based conditional `visibility`.
- `gallery` is at version 5 and declares no migrations (ADR 0029). The
  migration API (`migrateBlockData`) passes each step `{ data, settings }` and
  accepts both back; configuration sync runs the steps for drafts and
  published snapshots when a model that allows the block advances its version.
- `videoPlaybackField` (default `player`) is shared by `videoEmbed` settings
  and gallery video items.
- `ListLayout.css` (registry, `apps/site`, starter template,
  `tests/fixtures/existing-astro-site`; byte-identical) is all
  `@layer lace-layout` with `:where()` selectors, so unlayered site CSS always
  wins. `featured-first` is the only preset with a span rule, and it sits in
  the 32rem container query.
- The starter theme (`templates/site/src/styles/global.css`) and the reference
  theme (`apps/site/src/styles/site.css`) give every gallery `media` image
  `aspect-ratio: 4 / 3; object-fit: cover; width: 100%`, unlayered. Any layered
  natural-size rule would lose to them.
- `LaceImage` already emits `width`/`height`; variants are capped at the
  original width (`IMAGE_VARIANT_WIDTHS` 960/1920).
- The reference fixture (`apps/site/src/fixtures/published-export.json`) holds
  three version 5 galleries.

## Goals / Non-Goals

**Goals:** one reusable item field and one stylesheet rule set that any list
block can adopt; rc2 galleries render unchanged after synchronization; a
natural image never overflows.

**Non-Goals:** see proposal. No placement in flex modes and no admin
component work: the fields use existing select cards.

## Decisions

### D1 `listLayoutItemFields()` supplies `placement`

`list-layout.ts` adds `listLayoutItemFields()` returning a frozen
`{ placement }`: a required `field.select` with options
`auto | full | start | end`, default `auto`, label "Placement", description
"Applies to grid lists. Start, end and full choose the first column, the last
column or the whole row." and choice cards with 12×12 diagrams (a cell left,
a cell right, a full-width bar, an ordinary cell). `@lacecms/content` exports
it next to `listLayoutSettings`. Gallery spreads it into its item group.

Item visibility cannot depend on a block setting (conditional fields read
sibling data only), so the field is always visible and its description names
the grid-only scope; this matches retained-but-inactive `layoutWrap`.

Alternative rejected: a gallery-only field. The owner wants the same rows in
any list block, and removing `featured-first` would otherwise leave custom
list blocks without a span.

### D2 Grid placement rules without container queries

`ListLayout.css` drops the `featured-first` rules and adds, outside any
container query:

```css
:where([data-lace-layout="grid"] > [data-lace-layout-item][data-lace-placement="start"]) { grid-column-start: 1; }
:where([data-lace-layout="grid"] > [data-lace-layout-item][data-lace-placement="end"]) { grid-column-end: -1; }
:where([data-lace-layout="grid"] > [data-lace-layout-item][data-lace-placement="full"]) { grid-column: 1 / -1; }
```

With an automatic start and a definite end, `end` spans one track ending at
the last line; `full` spans every explicit track (for `auto`, `auto-fill`
tracks are explicit). Sparse auto-placement moves the cursor past a placed
item, so skipped tracks stay empty and order is kept. With one column every
rule resolves to that column, so no breakpoint is needed. Flex selectors are
untouched, so flex ignores the attribute.

### D3 Natural size is a hook implemented by the site theme

The component writes `data-lace-size` on image items. Because site theme CSS
is unlayered and already owns image proportions (architecture §13), the
natural rules live in the theme, not in `ListLayout.css`:

```css
:where([data-lace-block="gallery"]) [data-lace-size="fill"] [data-lace-part="media"] {
  aspect-ratio: 4 / 3; display: block; height: auto; object-fit: cover; width: 100%;
}
:where([data-lace-block="gallery"]) [data-lace-size="natural"] [data-lace-part="media"] {
  display: block; height: auto; max-width: 100%; width: auto;
}
:where([data-lace-block="gallery"]) [data-lace-placement="end"][data-lace-size="natural"] [data-lace-part="media"] {
  margin-inline-start: auto;
}
```

`max-width: 100%` of a cell that is itself `minmax(0, 1fr)` with
`min-inline-size: 0` rules out horizontal overflow; the `width`/`height`
attributes keep the proportions. Starter and reference themes change; the
Astro site guide shows the snippet for existing sites, and upgrade
instructions say an existing theme crops natural images until it adopts it.

Alternatives rejected: a layered natural rule in `ListLayout.css` (media
specific, forbidden by the list-layout contract, and overridden by every
existing theme); a block-level size setting (the owner wants per-item
control).

### D4 Natural images request their own width

`GalleryBlock.astro` computes sizes per item: a `natural` image with known
width `W` gets `(max-width: Wpx) 100vw, Wpx`; otherwise the existing
layout-based sizes. Variant capping already avoids upscaling, so a 405px GIF
has one 405px variant.

### D5 Gallery gets its own playback field

`built-ins.ts` derives `galleryVideoPlaybackField` from the same options,
label, description and cards with `defaultValue: "ambient"`; `videoEmbed`
keeps `videoPlaybackField`. The component's fallback `item.playback ?? "player"`
becomes `?? "ambient"` to match the parsed default.

### D6 Migration 6 and model versions

`gallery` becomes version 6 with `migrations: { 6: migrateGalleryToV6 }`, a
pure function in a new `blocks/gallery-migration.ts` (keeps `built-ins.ts`
single-purpose): copy settings and items; if `layoutPreset` is
`featured-first`, set it to `columns-2` and, when `images` is non-empty, set
`images[0].placement = "full"`; set `playback: "player"` on `kind: "video"`
items without `playback`. A version 4 snapshot fails with `missing_step`,
which is the rc2 floor. Root `lace.config.ts` models that allow `gallery`
(12, 11, 12, 11) and the starter's two (9, 9) advance by one so sync runs the
migration.

Alternative rejected: identity migration with absent-means-default. Absent
`playback` would flip to `ambient`, and a stored `featured-first` would fail
validation once the option is gone.

### D7 Delivery surfaces

Registry `astro/gallery` revision 8 / block version 6 (component and
`ListLayout.css`); byte-identical copies in `apps/site`, the starter template
and `tests/fixtures/existing-astro-site`; the CLI bundle follows its build.
Reference fixture galleries move to `schemaVersion` 6 with `placement` `end`
and `full` items and one `natural` image, and the fixture build test asserts
the hooks. Template `0.48.0` is unpublished, so it keeps its version: its
single configuration instruction gains the gallery steps (raise model
versions, sync, `lace add block gallery --site site`, adopt the theme
snippet, migrate custom `featured-first` values); generated snapshots are
regenerated. Documentation: `lace-astro-site.md`, `apps/docs` composites and
Astro integration pages, architecture §8 (`listLayoutItemFields()`). Admin
tests and e2e replace `featured-first` and the CSS e2e covers placement.

## Risks / Trade-offs

- [A custom block stored `featured-first`] → its drafts fail validation after
  upgrade; upgrade instructions and the composites page describe the
  migration (preset to `columns-2`, first item `full`).
- [Existing site themes crop natural images] → documented snippet; the
  component still emits correct sizes, so only appearance waits for CSS.
- [Ambient by default costs bandwidth] → it applies to new items only;
  migrated rc2 items keep their playback; reduced motion still falls back to
  the player.
- [`end` after a partly filled row leaves gaps] → intended (the owner's
  "right column only"); documented in the scenario.

## Migration Plan

1. Upgrade packages and images together; raise the version of every model
   that allows `gallery`; run `pnpm content:sync`, which rewrites stored
   galleries to version 6 and requests a build.
2. Run `pnpm exec lace add block gallery --site site` (or merge the `.new`
   proposal) before the next build, and adopt the theme snippet.

Rollback requires the pre-upgrade backup and matching older sources; there is
no down-migration.
