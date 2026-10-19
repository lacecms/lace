## Why

The generic composite editor makes media-heavy blocks unusable at a glance: a
Gallery with three images is about 1,400px tall and has four nested frames
(list fieldset, sortable item, group disclosure, media card). Every item
repeats text buttons (Up, Down, Duplicate, Remove, "Collapse Images item 1"),
helper text and "0 characters" counters. The image itself sits at the bottom
of each item, and collapsed summaries say "Media selected". The owner chose
the compact-rows direction from the reviewed mockup. The fix has to stay
schema-driven: nothing in the shared renderer may be specific to Gallery or
to media.

This is a standalone, owner-requested admin refinement. It is not a roadmap
unit. It refines the CE7B/CE7C composite editor (`docs/mvp-architecture.md`,
"Bounded composite fields (CE7A)" and the CE7C `itemLabel` note) and the CE9A
field-guidance presentation, without changing their data contracts.

## What Changes

- **List items become compact rows.** A group item is collapsed by default to
  one row: drag handle, an optional leading preview, a primary summary line, a
  muted secondary line, a problem indicator, a chevron toggle and an actions
  menu (`⋯`) holding Move up, Move down, Duplicate and Remove. Rows share one
  bordered container with dividers instead of one frame per item. Opening a
  row shows its fields flat, without a nested group fieldset or a second
  collapse control. Scalar items stay inline rows: handle, control and menu.
- **Schema-driven list header.** Each list shows its declared label (the
  field label or humanized key), its count against the effective maximum, Add,
  and a list menu holding Clear. The list itself no longer has a frame or a
  collapse button. Nothing is hardcoded per list.
- **Chevron disclosures.** Standalone group disclosures and item rows use a
  chevron icon button, like block cards, instead of the "Collapse <label>"
  text button. Accessible names stay the same.
- **Leaf preview extension point.** The renderer registry gains an optional
  per-type `Preview`. A list row uses the first direct child leaf of its item
  that has a registered preview and a present value, and takes from it a
  leading visual, a fallback title, a detail line and an optional advisory
  indicator. The media library registers a media preview: a thumbnail,
  filename, type and dimensions, and a "No alt" indicator when neither the
  item's `alt` sibling nor the media item has alt text. Without a registered
  preview the existing text summary and "Media selected" fallback remain.
- **Compact media control.** A selected media field becomes one borderless
  row: a 56px thumbnail, filename, facts and alt line, Replace, and a menu
  holding Remove. The resolving, missing, unreadable and pending-deletion
  states remain.
- **Quieter, stable field chrome.** Text counters move into the field's label
  row, so they take no line of their own. The "Required for publication only."
  explanation becomes the tooltip and accessible description of the Required
  marker, shown as text only when the field has a problem and for viewers.
  Nothing appears or disappears on focus, so the layout never shifts under the
  pointer. Bounded limits, configured descriptions and errors stay visible.
- **Image first.** The built-in `image` block and the `gallery` item declare
  `media` before `alt`, `caption` and `link`, so the editor shows the image
  before its overrides. Declaration order is excluded from structural and
  projection hashes, so no definition version, migration or template release
  is needed.

Non-goals: a grid view, multi-select "add several images" from the picker,
inheriting media alt or caption as placeholders inside nested groups (the
existing rule covers block-level `alt` only), DSL changes, and public-site or
API changes.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `admin-draft-editor`: composite list and group presentation (compact rows,
  actions menu, schema-driven list header, chevron disclosures, item previews),
  the compact selected-media control, and visibility of unbounded counters and
  the required-for-publication explanation.
- `block-registry`: the built-in `image` block and `gallery` item declare
  `media` as their first field, with unchanged versions and hashes.

## Impact

- `apps/admin/src/entities/content/FieldRenderer/FieldRenderer.tsx`
  (`ListNode`, `SortableItem`, `Disclosure`, `summary`, field chrome),
  `field-types.ts` (registry and preview types),
  `FieldControls`, `field-guidance.ts`.
- `apps/admin/src/widgets/media-library/` (`MediaPicker`, `SelectedMedia`, a
  new media preview) and the registries passed by `EntryPage`, `BlockCard` and
  `BlockSettingsPanel`.
- `packages/content/src/index.ts`: field declaration order of `image` and the
  `gallery` item.
- Unit tests and admin e2e suites that click the visible Up, Down, Duplicate,
  Remove or Collapse text buttons. Accessible names stay, but the actions move
  into menus.
- No API, database, export, SDK, registry component or starter-template
  change. The draft `video-a-media-upload-delivery` change adds a media-field
  `accept` option. Whichever lands second keeps the compact control passing
  `accept` to the picker.
