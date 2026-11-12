---
title: Groups, lists and form layout
description: Model nested values with groups and lists, organize long editor forms, and add reusable list layouts and choice cards.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

Groups store JSON objects and lists store JSON arrays of one item type. Use
them in model fields and block data to describe structured content such as
team members, links or gallery items. This guide also covers presentation
metadata that changes how the editor arranges a form without changing stored
values: form sections and tabs, choice cards and reusable list layouts.

## Before you start

- A model or block in `lace.config.ts` ([Define your content](../)).
- Changes reach Admin through [configuration synchronization](../synchronization/).

## Model groups and lists

`field.group({ fields })` holds named child fields; `field.list({ item })`
holds items of one descriptor. A page with a contact group and a team list:

```ts
import { definePage } from "@lacecms/config";
import { field } from "@lacecms/content";

definePage({
  key: "about",
  version: 2,
  path: "/about",
  label: "About",
  fields: {
    contact: field.group({
      label: "Contact",
      fields: { email: field.text(), phone: field.text() },
    }),
    team: field.list({
      label: "Team",
      itemLabel: "name",
      maxItems: 12,
      item: field.group({
        fields: {
          name: field.text({ required: true }),
          photo: field.media(),
          links: field.list({ item: field.url() }),
        },
      }),
    }),
  },
});
```

Block fields use the same builders. Site code reads the values from
`entry.fields` (or block `data`) as plain JSON and resolves nested media with
`entry.image(id, usageAlt?)`.

- **Item labels.** `itemLabel` names an immediate text, textarea, select or URL
  child of a group item. The editor uses it to summarize collapsed rows; it
  stores nothing. Without it, rows use the first useful text, URL, select or
  rich-text value, or "Media selected". Update `itemLabel` when you rename its
  target field.
- **Bounds.** `minItems` is checked at publication, `maxItems` also for drafts.
  A list holds at most 100 items, and one entry holds at most 500 list
  elements in total, counting nested lists, defaults and the data of all
  blocks, including hidden ones. A lower `maxItems` wins.
- **Nesting.** A branch has at most six groups and lists and at most two
  consecutive groups. A list cannot directly contain another list: put the
  inner list inside a group item.
- **Absent and empty values differ.** An absent group or list is not the same
  as `{}` or `[]`. In the editor, Create group applies the children's defaults
  and Create list starts an empty list. Clear removes a named value; a
  configured default is applied again when the draft is saved.

Missing required children and lists below `minItems` are allowed in drafts and
reported as publication requirements. Invalid present values and exceeded
maxima block saving. The editor's list controls are described in
[edit and publish content](../../editing-content/#groups-and-lists).

### Built-in examples

The built-in Gallery and Navigation blocks are made of these builders only.
Gallery holds a `title` and an `images` list (1–50 items) whose items are
images or videos, chosen with a `kind` select and
[conditional fields](../conditional-fields/). Navigation holds an optional
`name` (the accessible name of its `<nav>`) and a `links` list (1–20 items)
whose items have a `label`, an optional `url` and an optional `children` list of
up to 20 links. A new block starts with an empty list, so editors can add items
immediately; publication requires at least one.

The starter declares a `navigation` global that allows only the Navigation
block. Its site layout renders the published global in the header and shows
static links until the global is published.

## Arrange forms in sections or tabs

Models, block data and groups (including a list's group item) can declare a
`layout` that arranges their fields:

```ts
import { defineCollection } from "@lacecms/config";
import { field } from "@lacecms/content";

const posts = defineCollection({
  key: "posts",
  version: 1,
  route: "/blog/:slug",
  fields: {
    author: field.text(),
    excerpt: field.textarea(),
    links: field.list({
      item: field.group({
        fields: { label: field.text(), url: field.url() },
        layout: {
          mode: "tabs",
          groups: [
            { key: "copy", label: "Copy", fields: ["label"] },
            { key: "target", label: "Target", fields: ["url"] },
          ],
        },
      }),
    }),
  },
  layout: {
    mode: "sections",
    groups: [
      {
        key: "content",
        label: "Content",
        description: "Shown in the article list.",
        fields: ["excerpt"],
      },
      { key: "details", label: "Details", fields: ["author", "links"] },
    ],
  },
});
```

- `mode` is `"sections"` or `"tabs"`; `groups` is a nonempty array.
- Each group has a unique `key`, a nonblank `label`, an optional `description`
  and a nonempty ordered `fields` list.
- Field references name the owner's own fields only: no paths, no duplicates.
  Unlisted fields follow the groups in declaration order.
- Blocks arrange their declared settings with `settingsLayout`, using the same
  shape, inside the block's Settings tab.
- The system title, slug and SEO controls and the block anchor, visibility and
  CSS controls keep their positions and cannot be arranged.

Layout creates no objects or paths in the stored content. A section or tab
whose fields are all hidden by [conditional fields](../conditional-fields/) is
hidden as well.

## Offer choices as cards

A `select` can present its options as cards with a label, an optional
description and an optional schematic diagram:

```ts
field.select({
  options: ["news", "guide"],
  presentation: {
    control: "cards",
    choices: [
      { value: "news", label: "News", description: "Short, dated updates." },
      {
        value: "guide",
        label: "Guide",
        diagram: {
          cells: [
            { x: 0, y: 0, width: 12, height: 4 },
            { x: 0, y: 5, width: 12, height: 7 },
          ],
        },
      },
    ],
  },
});
```

`choices` covers every option exactly once; the cards follow option order.
Labels and descriptions are plain text. A diagram holds 1 to 16
nonoverlapping integer rectangles `{ x, y, width, height }` within a 12×12
canvas. Markup, URLs, colors and callbacks are rejected. Cards work in model
fields, nested groups and list items, block data and block settings. The stored
value is still the option string. Changing options or defaults stays a
structural change; changing only the presentation does not.

## Reusable list layouts

`listLayoutSettings()` from `@lacecms/content` adds ordinary layout settings to
any block that renders a list, and `listLayoutItemFields()` adds the
per-item `placement` field. The built-in Gallery uses both:

```ts
import {
  defineBlock,
  field,
  listLayoutItemFields,
  listLayoutSettings,
  listLayoutSettingsVisibility,
} from "@lacecms/content";

export const cards = defineBlock({
  type: "cards",
  version: 1,
  label: "Cards",
  fields: {
    cards: field.list({
      item: field.group({ fields: { title: field.text(), ...listLayoutItemFields() } }),
      defaultValue: [],
    }),
  },
  settings: { ...listLayoutSettings() },
  settingsVisibility: listLayoutSettingsVisibility(),
});
```

The settings are:

- `layoutMode` (**Arrangement**): `flex-row` (Horizontal), `flex-column`
  (Vertical) or `grid` (default).
- `layoutWrap` (**Wrap items**): boolean, default `true`, for the flex modes.
  Vertical wrapping needs a definite height from site CSS.
- `layoutPreset` (**Grid preset**): default `auto`, for grid mode.

| Grid preset   | Behavior by container width                        |
| ------------- | -------------------------------------------------- |
| `auto`        | Equal columns fitting a preferred minimum of 14rem |
| `columns-2`   | One column below 32rem, two from 32rem             |
| `columns-3`   | As above, three from 48rem                         |
| `columns-4`   | As above, four from 64rem                          |
| `narrow-wide` | One column below 32rem, then 1fr/2fr               |
| `wide-narrow` | One column below 32rem, then 2fr/1fr               |

Thresholds include their starting width. Items keep their order and incomplete
rows leave tracks empty. The editor shows the choices as schematic cards that
load no media; your site owns the actual styling
([Lay out lists and galleries](../../astro-integration/styling/#lay-out-lists-and-galleries)).

### Place items in a grid

`listLayoutItemFields()` adds `placement` to each item: `auto` (default, the
next free cell), `full` (**Full row**), `start` (**First column**) or `end`
(**Last column**). Placement applies in grid mode only, for every preset and
column count. Cells skipped to honor a placement stay empty, and the next item
continues after it, so stored order is kept. In a single column every placement
uses that column. Flex lists keep the value without effect.

The `featured-first` grid preset of rc2 no longer exists. Gallery version 6
rewrites it during synchronization to `columns-2` with a `full` first item. A
custom block that stored it adopts `listLayoutItemFields()`, raises its version
and declares the same rewrite as a
[block migration](../synchronization/#migrate-block-data):

```ts
migrations: {
  2: ({ data, settings }) =>
    settings.layoutPreset !== "featured-first"
      ? { data, settings }
      : {
          data: { ...data, cards: data.cards.map((c, i) => (i === 0 ? { ...c, placement: "full" } : c)) },
          settings: { ...settings, layoutPreset: "columns-2" },
        },
},
```

### Show settings only for some layouts

`settingsVisibility` hides block setting controls that do not apply. With
`listLayoutSettingsVisibility()`, Wrap items appears only for the flex modes and
Grid preset only for grid. You can declare your own map: each key is a scalar
setting, each rule `{ setting, values }` names a required sibling `select`
setting with a default and a nonempty subset of its options. Controllers cannot
themselves be conditional.

Hidden settings keep their values, are saved, validated and published. A
setting with a validation error is shown again so it can be corrected. To make
**data** fields optional and unpublished when they do not apply, use
[conditional fields](../conditional-fields/) instead.

## Synchronize presentation changes

Item labels, layouts, choice-card presentation, placeholders and
`settingsVisibility` are presentation metadata. Run ordinary synchronization
after changing them; no model or block version increase, database migration or
content rewrite is needed. Upgrade the CMS packages before adopting new
metadata: older releases reject options they do not know, so remove such
options before rolling back to one.

## Reference

- [Configuration reference](../../reference/configuration/): `field.group`,
  `field.list`, list bounds, `itemLabel`, `layout`, `settingsLayout`,
  `settingsVisibility` and select `presentation`.
- [Internal links](../links/) for URL fields that point at other entries.
