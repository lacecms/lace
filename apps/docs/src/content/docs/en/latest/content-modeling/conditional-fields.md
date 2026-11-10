---
title: Conditional fields
description: Show, require and publish a field only when a sibling select or switch selects it.
---

A conditional field applies only when a sibling **controller** holds selected values. For example, a gallery item can be an image or a video: `kind` decides whether the editor asks for an image or a video link. The built-in `gallery` block (version 6) ships exactly this rule; the example below shows the same shape in a custom block. Lace enforces the rule on every write path (admin, REST, MCP and `lace import`), so a field that does not apply is never required and never published.

## Declare a rule

Add a `visibility` map next to the `fields` it refers to. Each key names a **target** field; each rule names its controller with `field` and the controller values that show the target with `values`:

```ts
import { defineBlock, field } from "@lacecms/content";

export const portfolio = defineBlock({
  type: "portfolio",
  version: 1,
  label: "Portfolio",
  fields: {
    items: field.list({
      label: "Items",
      itemLabel: "caption",
      maxItems: 50,
      item: field.group({
        fields: {
          kind: field.select({
            label: "Kind",
            options: ["image", "video"],
            defaultValue: "image",
            required: true,
          }),
          media: field.media({ label: "Image", required: true }),
          alt: field.text({ label: "Alt text" }),
          videoUrl: field.url({
            label: "Video URL",
            required: true,
            embedProviders: ["youtube", "vimeo"],
          }),
          videoTitle: field.text({ label: "Video title", required: true }),
          caption: field.text({ label: "Caption" }),
        },
        visibility: {
          media: { field: "kind", values: ["image"] },
          alt: { field: "kind", values: ["image"] },
          videoUrl: { field: "kind", values: ["video"] },
          videoTitle: { field: "kind", values: ["video"] },
        },
      }),
    }),
  },
});
```

`visibility` is accepted in three places:

- **Models**: `definePage`, `defineCollection` and `defineGlobal` take `visibility` beside `fields`.
- **Groups**: `field.group({ fields, visibility })`, including groups used as list items and nested groups.
- **Block data**: `defineBlock({ fields, visibility })`.

Each list item, group value and block is evaluated on its own: one item can be an image while the next is a video.

A controller is a sibling `select` or `boolean` field. A boolean rule lists `true` or `false`:

```ts
fields: {
  hasCta: field.boolean({ label: "Show a call to action" }),
  ctaUrl: field.url({ label: "Action URL", required: true }),
},
visibility: { ctaUrl: { field: "hasCta", values: [true] } },
```

The controller's value is its saved value, or its `defaultValue` when it has none. A controller may be optional; when it has no value and no default, its targets are hidden. Give the controller a default when one case is usual.

## Rules Lace rejects

Configuration fails before startup, naming the rule's path, when:

- the target or controller is not a field of the same owner (no paths into other groups, list items or blocks);
- the controller is not a `select` or `boolean`, or is the target itself;
- the controller is itself conditional (rules cannot chain);
- `values` is empty, repeats a value, or lists a value the select does not offer;
- a rule is placed on a scalar or list field, a scalar list item or block settings;
- the global `seoDefaults` names a conditional field.

System title, slug and SEO fields and block anchors, CSS classes and hidden state cannot be targets or controllers.

## Validation and published content

- A shown field follows its normal rules: `required`, `minItems` and every other constraint apply when publishing.
- A hidden field is never required and never needs `minItems`. When it holds a value, the value is still checked like a draft value (type, options, URL safety, lengths, ranges and `maxItems`).
- Hidden values stay in the draft. Switching the controller back shows them again.
- Publication omits hidden fields. The public API, the build export, globals and published reads never contain them, and media or links that only hidden fields use are not published.

Site code reads the published shape. The value types `BlockDataOf` (from `@lacecms/render`) and `ModelFieldValues` (from `@lacecms/config`) make every target optional, so narrow on the controller before using a target:

```ts
for (const item of data.items) {
  if (item.kind === "video" && item.videoUrl !== undefined) {
    // render the video
  } else if (item.media !== undefined) {
    // render the image
  }
}
```

## Change rules safely

Rules are structural. Increase the model `version`, or the block `version` for block data rules, and run [configuration synchronization](../synchronization/). Synchronization reports `field-visibility-added`, `field-visibility-removed` and `field-visibility-changed`. When a change hides values that are already published, synchronization removes them from published snapshots and requests one site build. Drafts keep their values. Removing a rule from a required field is refused while published items lack the value, as when you make a field required.

## Settings keep `settingsVisibility`

Block **settings** use a different rule, `settingsVisibility`, described in [groups, lists and form layout](../composites/#reusable-list-layouts). It only hides setting controls in the editor; hidden settings keep their defaults, are validated and are still published. Use `visibility` when a field should stop being required and stop being published; use `settingsVisibility` when you only want a tidier settings panel.

## In the editor

The admin hides fields that do not apply as soon as the controller changes, without saving. See [edit and publish content](../../editing-content/#conditional-fields) for what editors see.

When a list can add several images from the media library and its media field depends on a `select` controller, the list also offers one **Add** button per option that hides the media field, labelled with the option's choice-card label (the gallery's **Add Video**). It adds one item with that option selected. A controller's value never labels a collapsed row; rows use the other fields and previews instead.
