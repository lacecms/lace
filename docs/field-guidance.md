# Field metadata and author guidance

Configure empty prompts with `placeholder` on text, textarea, URL, number,
select and rich-text fields. The same syntax works inside groups/lists, on scalar
list items, in block fields, and on supported block settings.

```ts
import { field } from "@lacecms/content";

const fields = {
  title: field.text({
    label: "Title",
    required: true,
    placeholder: "A short, descriptive title",
    description: "Shown on the article card.",
    maxLength: 80,
  }),
  notes: field.textarea({ placeholder: "Notes for readers", minLength: 10 }),
  links: field.list({
    item: field.group({
      fields: {
        label: field.text({ placeholder: "Link label" }),
        url: field.url({ placeholder: "https://example.com" }),
      },
    }),
  }),
  tags: field.list({ item: field.text({ placeholder: "Tag" }) }),
  body: field.richText({ placeholder: "Tell the story…" }),
  category: field.select({ options: ["news", "guide"], placeholder: "Choose a category" }),
  amount: field.number({ min: 1, max: 5, placeholder: "1 to 5" }),
};
```

Omit `placeholder` to keep the control's existing prompt. Set it to `""` to
suppress a generic prompt. Strings are plain text, never HTML or callbacks.
Boolean, date, datetime, media, group and list descriptors reject the option;
use `description` to explain their switch, calendar, picker or container.
An inherited SEO/media prompt takes precedence over a generic configured prompt.
Existing inheritance explanations, site-default annotations and descriptions
remain accessible. Rich-text viewers receive no placeholder.

Required fields display a Required marker and explain “Required for publication
only.” The explanation is the Required marker's tooltip and part of the field's
accessible description; it is shown as text when the field has a problem and
always for viewers. Nothing appears on focus, so the layout never shifts under
the pointer. Otherwise valid incomplete drafts remain savable. Publication still checks
required fields; hidden blocks retain their existing draft-mode exception.
Numeric bounds and supplied text length limits apply during save. A list's
minimum applies during publication and its maximum applies to drafts as well.
An optional absent text value stays valid even if it declares a minimum length.
Guidance does not create absent containers, apply defaults or change content.

Text and textarea show their current count, right-aligned in the label row,
even without configured bounds. Their
validators count raw JavaScript UTF-16 units without trimming: `" 😀 "` counts
four, and `"e\u0301"` counts two. Input remains editable past a maximum; Save
explains violations rather than silently truncating text. SEO title/description
instead count Unicode code points after trimming (`" 😀 "` counts one). Their
60/160 recommendations are advisory; their separate hard limits remain 200/500.
Counters and advisory warnings are associated descriptions, with no live
announcement on every keystroke. Viewers can read the same counts and constraints.

Placeholders are display metadata: adding, changing or removing one does not
change structural model/config hashes, require a model-version bump, rewrite
snapshots or migrate content. The projection hash changes, so run normal content
sync to deliver the new metadata. Content/default keys literally named
`placeholder` remain part of structural identity. Save, publish and public JSON
contain authored values, never guidance metadata injected into content.

Upgrade engine, contracts and admin together before adopting this option; older
engines reject it as unknown configuration. No database migration is needed.
For rollback, remove placeholder options before running an older engine. Saved
content is unaffected. See [composite fields](composite-fields.md) and
[rich-text authoring](rich-text-authoring.md).

## Choice cards and reusable list layouts

A select can declare `presentation: { control: "cards", choices }`. Choices cover
its `options` exactly once; the form always follows option order. Each choice
has `value`, a nonempty plain-text `label`, optional `description` and optional
`diagram: { cells: [{ x, y, width, height }] }`. Cells are 1–16 nonoverlapping
integer rectangles inside a 12×12 canvas. Unknown properties and markup are
rejected. Text-only cards work too. This portable, detached hint works in model
fields, nested groups/list items, block data and scalar settings. It affects
projection identity only; option/default changes remain structural. Draft and
published values contain only the selected string. Keyboard navigation uses
arrows, Home/End and Space, with a single Tab stop; optional fields offer No
selection. Viewers read labels and descriptions.

Use `listLayoutSettings()` from `@lacecms/content` in any block's `settings`:

```ts
import { defineBlock, field, listLayoutSettings, listLayoutSettingsVisibility } from "@lacecms/content";
const cards = defineBlock({
  type: "cards", version: 1,
  fields: { cards: field.list({ item: field.text(), defaultValue: [] }) },
  settings: { ...listLayoutSettings() },
  settingsVisibility: listLayoutSettingsVisibility(),
});
```

This returns fresh, deeply frozen ordinary scalar descriptors: `layoutMode`
(default `grid`), `layoutWrap` (default true), and `layoutPreset` (default `auto`).
Horizontal/vertical flex and grid choices have schematic diagrams that explain
composition without media requests, site execution or an exact visual preview.
With the visibility helper, Wrap items appears only for either flex mode and
Grid preset only for grid. Inactive values stay mounted, retained, saved and
validated. A relevant validation error temporarily reveals its control, explains
why, and remains reachable from the error summary. Vertical wrapping needs a
site-defined definite height; Lace never invents one.

Grid presets use container width, inclusively: auto fits equal columns with a
preferred 14rem minimum; columns-2 uses 1/2 columns below/from 32rem; columns-3
adds a third from 48rem; columns-4 adds a fourth from 64rem. Narrow-wide and
wide-narrow use 1:2 and 2:1 columns from 32rem, otherwise one. Featured-first
spans only the first item across two equal columns from 32rem, otherwise one.
Order remains unchanged and incomplete rows keep empty tracks.

A renderer marks its outer element `data-lace-layout-container`, its list
`data-lace-layout={settings.layoutMode}`, `data-lace-wrap={String(settings.layoutWrap)}`
and `data-lace-preset={settings.layoutPreset}`, and direct items
`data-lace-layout-item`. Import the site-installed Gallery companion
`ListLayout.css` by its relative path; Gallery owns its installation record.
Custom components reuse that file without claiming a second registry owner.
The neutral `lace-layout` layer uses zero specificity and never crops images,
themes content or changes unmarked nested lists. On the list, set
`--lace-list-gap` (default 0) and `--lace-list-item-min` (default 14rem).
Unlayered site CSS can override display, gap and grid tracks directly; if your
site uses layers, order the theme layer after `lace-layout`. The maintained
Gallery theme keeps 1rem spacing and a 4:3 image crop in its own CSS.

Gallery keeps its previous image `sizes` for grid/auto and uses conservative
`100vw` elsewhere. Tune this in the user-owned component to match your actual
containers and overrides; geometric thumbnails cannot predict site CSS.


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
