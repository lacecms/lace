---
title: Groups, lists and form layout
description: Model nested JSON and organize long editor forms without changing their values.
---

Groups store JSON objects and homogeneous lists store JSON arrays. They work in model and block fields:

```ts
import { field } from "@lacecms/content";
const links = field.list({
  label: "Links",
  itemLabel: "label",
  maxItems: 20,
  item: field.group({
    fields: {
      label: field.text({ required: true }),
      url: field.url({ required: true }),
    },
  }),
});
```

`itemLabel` selects an immediate text-like child of a group item for summaries; it does not create a stored identifier. A list cannot directly contain another list: place nested lists inside group items. Schema limits are six containers, at most two consecutive groups, 100 items per list and 500 total list elements per snapshot, including nested values, defaults and block data. A configured lower maximum wins. Media-reference and JSON-size limits still apply.

Absent containers differ from `{}` and `[]`. Create group applies child defaults; Create list produces an empty array. Clear omits a named value; configured defaults can be reapplied by server normalization. Invalid present values block Save; required descendants and list minima are checked for publication.

## Arrange forms

Models, block data and groups can declare presentation layout:

```ts
const layout = {
  mode: "tabs",
  groups: [
    { key: "copy", label: "Copy", fields: ["excerpt"] },
    { key: "details", label: "Details", fields: ["author"] },
  ],
};
```

Attach this alongside the owner's `fields`. `sections` is the other mode. Groups and field lists must be nonempty, keys unique, and references immediate sibling fields without duplicates or paths. Unlisted fields follow in declaration order. Layout creates no new data objects or paths. System title/slug/SEO and standard block controls keep their established positions. Blocks can organize declared settings with `settingsLayout`.

Placeholders, item summaries and layout are presentation metadata: they need synchronization but do not require a structural model/block version bump or rewrite content. Older engines may reject these options, so upgrade matching packages before adoption and remove unsupported metadata before rolling back.

## Reusable list layouts

`listLayoutSettings()` from `@lacecms/content` supplies ordinary scalar settings
for Gallery or any custom list block:

```ts
import {
  defineBlock,
  field,
  listLayoutSettings,
  listLayoutSettingsVisibility,
} from "@lacecms/content";
const cards = defineBlock({
  type: "cards",
  version: 1,
  fields: { cards: field.list({ item: field.text(), defaultValue: [] }) },
  settings: { ...listLayoutSettings() },
  settingsVisibility: listLayoutSettingsVisibility(),
});
```

`layoutMode` chooses `flex-row`, `flex-column` or `grid` (default). `layoutWrap`
is boolean, default true. `layoutPreset` defaults to `auto`. With the visibility helper, wrap appears only for either flex mode and presets
only for grid. Inactive values are retained, saved and validated. Relevant errors
temporarily reveal inactive controls for correction and error-summary focus. Vertical wrapping requires a definite height from site CSS.

| Grid preset      | Container behavior                                               |
| ---------------- | ---------------------------------------------------------------- |
| `auto`           | Equal columns fitting a preferred minimum of 14rem               |
| `columns-2`      | One column below 32rem, two from 32rem                           |
| `columns-3`      | As above, three from 48rem                                       |
| `columns-4`      | As above, four from 64rem                                        |
| `narrow-wide`    | One below 32rem, then 1fr/2fr                                    |
| `wide-narrow`    | One below 32rem, then 2fr/1fr                                    |
| `featured-first` | One below 32rem, then two with only the first item spanning both |

Thresholds include their starting width. Order stays unchanged; incomplete rows
leave tracks empty. The cards are schematic compositions, not site screenshots.
They load no media and remain useful for empty galleries. Your site owns styling.

Other selects may opt into the same control with
`presentation: { control: "cards", choices: [{ value: "news", label: "News" }] }`.
Choices must cover every option exactly once; their display order follows options.
Labels/descriptions are plain text. Optional diagrams contain 1–16 nonoverlapping
integer rectangles `{ x, y, width, height }` within a 12×12 canvas. No markup, URLs,
colors or callbacks are accepted. Card hints are projection-only at descriptor
positions and work inside groups, list items and scalar settings. Values remain
strings; changing options/defaults retains existing structural rules.

See [Astro integration](../../astro-integration/) for the matching CSS contract and
coordinated Gallery v4 upgrade.

Block-level `settingsVisibility` is optional. It maps scalar setting keys to
`{ setting, values }`, where the controller is a required sibling select with a
valid default and `values` is a nonempty unique subset of its options. Controllers
cannot themselves be conditional; chains, cycles and recursive field conditions
are unsupported. Without the map, all settings remain visible. Older packages
reject this new metadata: upgrade matching CMS/admin packages together.

Rules affect configuration projection identity only at block-definition positions.
Run ordinary content sync after changing them; no model/block version bump, SQL
migration or content rewrite is needed. Existing sync still advances the published
version and requests/coalesces a site build for metadata updates. Stored snapshots,
revisions and media references remain unchanged. Server validation is unconditional.
