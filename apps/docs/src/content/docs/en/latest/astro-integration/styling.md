---
title: Style your site
description: Target stable data-lace hooks to style blocks, rich text, galleries, images and video players without editing Lace.
kind: guide
verifiedAgainst: 0.1.0-rc2
---

Your Astro site owns its presentation. Lace renders blocks through source components installed into your site and marks their output with stable `data-lace-*` attributes, so you can style pages from your own stylesheet without changing content, Admin or a block component. This guide lists those hooks and the behavior of the built-in galleries, images and video players that your CSS works with.

## Before you start

- An Astro site connected as described in [Connect an Astro site](../), with the built-in block components installed by `lace add block`.
- A global stylesheet imported by your layout. The generated starter imports `site/src/styles/global.css` from `site/src/layouts/BaseLayout.astro`; its rules apply to every route.
- A site rebuild to publish CSS changes. Saving or publishing content alone does not change your styles.

## Target stable selectors

| Attribute             | Element                | Value                                 | Selects                             |
| --------------------- | ---------------------- | ------------------------------------- | ----------------------------------- |
| `data-lace-model`     | The entry's `<main>`   | Model key, such as `home` or `posts`  | All entries of one model            |
| `data-lace-entry`     | The entry's `<main>`   | Stable entry ID                       | One entry, even if its slug changes |
| `data-lace-block`     | Block root             | Block type, such as `hero` or `image` | All blocks of one type              |
| `data-lace-block-key` | Block root             | Stable block key                      | One block within its entry          |
| `data-lace-part`      | Element inside a block | A part name from the table below      | One part of a block                 |

`data-lace-model` and `data-lace-entry` are set by your layout; the starter's `BaseLayout.astro` puts them on `<main>`. A block key is unique within an entry, not across the site: combine it with `data-lace-entry` to select one block. Inspect a published page to copy an entry ID or block key. A page model such as `home` has one entry, so its model key is usually the more readable selector.

| Block        | `data-lace-part` values                                                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hero`       | `eyebrow`, `heading`, `body`, `media`, `action`, `label`                                                                                         |
| `richText`   | `content`                                                                                                                                        |
| `image`      | `media`, `caption`; `link` when linked; `lightbox-trigger`, `lightbox`, `lightbox-close`, `lightbox-media` with the lightbox                     |
| `quote`      | `text`, `attribution`                                                                                                                            |
| `cta`        | `heading`, `body`, `action`, `label`                                                                                                             |
| `link`       | `link`, `label`; the root carries `data-lace-appearance` (`button` or `text`)                                                                    |
| `gallery`    | `title`, `items`, `item`, `media`, `caption`; `link` for linked images; the lightbox parts as for `image`; `player` and `source` for video items |
| `navigation` | `list`, `item`, `link`, `label`, `submenu`, `toggle`, `children`                                                                                 |
| `videoEmbed` | `preview`, `play`, `player`, `caption`, `source`                                                                                                 |

An optional part is absent when the published block has no value for it; for example, a `hero` without an image has no `media` part.

The `data-lace-*` names and these part values are the styling contract. Tag names, nesting inside parts, class names such as `hero` or `rich-text` and generated `id` attributes are implementation details of the installed components. Changing a block's structure or behavior means editing its component in your site.

## Write site rules

```css
/* Every hero on the site. */
:where([data-lace-block="hero"]) {
  padding-block: 2rem;
}

/* Heroes on the home model only. */
[data-lace-model="home"] [data-lace-block="hero"] {
  max-width: 72rem;
}

/* Images in one entry. */
[data-lace-entry="<entry-id>"] [data-lace-block="image"] {
  margin-block: 3rem;
}

/* The heading of one block. */
[data-lace-entry="<entry-id>"] [data-lace-block-key="<block-key>"] [data-lace-part="heading"] {
  max-width: 20ch;
}
```

Replace the placeholders with values from your published pages. `:where()` keeps a rule's specificity at zero; use ordinary specificity for targeted rules. Styles written inside an Astro component's `<style>` are scoped to that component by default, while an imported global stylesheet reaches every rendered block, so keep global rules under entry and block selectors to avoid styling unrelated elements.

Editors can give a block an in-page anchor and an extra class name in Admin. The block root then carries `id="<anchor>"` and the class after its own classes, so `#get-started` links jump to it. These values are content that editors change, not part of the styling contract; style an editor class only when your site offers it on purpose. Hidden blocks are never rendered.

## Style rich text

Rich text renders inside the `content` part of `richText` blocks and the `body` part of blocks that contain rich text. Style its elements with descendant selectors. The common renderer emits headings `h1`–`h4`, paragraphs, lists, block quotes, horizontal rules (`hr`), links, inline code and code blocks as `pre` with escaped `code` text:

```css
[data-lace-block="richText"] [data-lace-part="content"] pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
[data-lace-block="richText"] [data-lace-part="content"] h4 {
  margin-block: 1rem 0.5rem;
}
```

Keep `pre`/`code` whitespace intact. Link attributes come from each link in the document: a new-tab link has `target="_blank"` and `rel="noopener noreferrer"`, and a nofollow link adds `nofollow` to `rel`. You can target them with `a[target="_blank"]` or `a[rel~="nofollow"]`. See [rich text rendering](../#render-blocks-and-rich-text) for the component that produces this markup.

## Lay out lists and galleries

The gallery component imports `ListLayout.css`, installed beside `GalleryBlock.astro`. The stylesheet owns neutral list structure only: flex or grid layout, list resets and item placement. It sets no colors, typography, image crop, aspect ratio or fixed height, and leaves unmarked nested lists alone.

Its rules live in the `lace-layout` cascade layer with zero specificity, so unlayered site CSS overrides display, gap and columns without `!important`. If your site uses its own layers, put your theme after `lace-layout` in the layer order. Set these properties on the list:

- `--lace-list-gap`: the gap between items (default `0`; the starter uses `1rem`).
- `--lace-list-item-min`: the preferred minimum item width for the `auto` grid and flex rows (default `14rem`).

The stylesheet uses container queries on the list's container. Vertical flex wrapping needs a definite height from your CSS. Remove older unlayered `display: grid` or `grid-template-columns` rules for galleries: they force every layout back into a grid.

A custom list block that uses the same [list layout settings](../../content-modeling/composites/#reusable-list-layouts) can reuse the installed stylesheet with a relative import. Mark its outer element `data-lace-layout-container`, the list `data-lace-layout={settings.layoutMode}`, `data-lace-wrap={String(settings.layoutWrap)}` and `data-lace-preset={settings.layoutPreset}`, and each direct item `data-lace-layout-item`. Do not register the stylesheet under a second registry item.

### Item placement and image size

Every gallery item carries `data-lace-placement` (`auto`, `full`, `start` or `end`), and every image item carries `data-lace-size` (`fill` or `natural`). A custom list that adopts `listLayoutItemFields()` marks each item `data-lace-placement={item.placement ?? "auto"}`.

Placement is structural and acts in grid mode only: `start` puts an item in the first column, `end` in the last and `full` across the row, for every preset and column count. Skipped cells stay empty and order is kept. Flex layouts keep the value without effect.

Size is a hook for your theme, which owns image proportions. Crop only `fill` images and let `natural` images keep their own width without overflowing their cell, as the starter does:

```css
:where([data-lace-block="gallery"]) [data-lace-size="fill"] [data-lace-part="media"] {
  aspect-ratio: 4 / 3;
  display: block;
  height: auto;
  object-fit: cover;
  width: 100%;
}
:where([data-lace-block="gallery"]) [data-lace-size="natural"] [data-lace-part="media"] {
  display: block;
  height: auto;
  max-width: 100%;
  width: auto;
}
:where([data-lace-block="gallery"])
  [data-lace-placement="end"][data-lace-size="natural"]
  [data-lace-part="media"] {
  margin-inline-start: auto;
}
```

A theme without these rules keeps cropping natural images. The crop uses `object-fit: cover`, so the focal point set in Media decides which part stays visible.

The component requests image widths through `sizes`: the `auto` grid keeps `(min-width: 64rem) 20rem, (min-width: 32rem) 50vw, 100vw`, other layouts use `100vw`, and a `natural` image of known width `W` requests `(max-width: Wpx) 100vw, Wpx`. Tune these values in your component copy to your site's actual widths.

## Style gallery video items

Video items share the gallery's cells. Each is an `<li data-lace-part="item" data-lace-kind="video">` holding a `<figure data-lace-video>` whose `data-lace-aspect-ratio` and `data-lace-playback` mirror the item, a `[data-lace-video-area]`, an optional `caption` part and a `source` link to the provider. Image items carry `data-lace-kind="image"`, so the starter's image crop, which targets the `media` part, leaves videos at their own ratio.

`GalleryVideo.css`, installed beside the component, reserves each video area at the item's ratio (16:9 by default) with zero-specificity rules in the `lace-layout` layer, and visually hides the source link only while an ambient player is mounted. Unlayered site CSS overrides it.

Player items load a lazy iframe that never autoplays. Ambient items mount a muted, looping player once on page load; with reduced motion or without JavaScript they fall back to the player. Ambient playback has no pause control, the same gap as the video embed block described below; add a control in your component copy if you need one and use ambient sparingly, because every player loads provider media. Links and the lightbox never apply to video items.

## Style navigation

The navigation component ships without styles. Provide your own layout, responsive behavior and focus styles. Submenus use a native `<details>` disclosure (`submenu`, `toggle`, `children` parts), and the link to the current page carries `aria-current="page"`. Only resolved links are anchors; unavailable destinations render as plain labels.

The starter renders the published `navigation` global in the layout header, outside `[data-lace-entry]`. Select it with `.site-header [data-lace-block="navigation"]`, or style navigation inside page content with `[data-lace-entry] [data-lace-block="navigation"]`. While the global is unpublished, the starter shows a static `.site-nav` fallback that shares the same list rules. Its stylesheet shows a vertical list below `48rem` and a wrapping row with absolutely positioned dropdowns from `48rem`.

## Style images and the lightbox

Block images are WebP variants with `srcset`. An opaque image carries a blurred inline `background-image` placeholder until it loads, so leave the image's `background-*` properties unset.

With the _Open full screen_ setting on, the `image` block and each gallery image wrap the `media` image in a `lightbox-trigger` button that opens a `lightbox` `<dialog>` holding a `lightbox-close` button and the original image as `lightbox-media`. The starter resets the trigger button, shows a focus ring, sizes the dialog to the image so the `::backdrop` around it stays clickable, fits the original to the viewport with `object-fit: contain` and pins the close button to the top right.

An image with a link wraps its `media` image in a `link` anchor instead and never gets a lightbox. The starter displays the anchor as a block with the same focus ring. Copy the lightbox and link focus rules from a matching starter when you adopt these components in an existing site.

## Style video embeds

The `videoEmbed` component imports `VideoEmbed.css`, which reserves the selected aspect ratio (16:9 by default) in `@layer lace-layout`; your CSS owns decoration. The root exposes `data-lace-aspect-ratio` and `data-lace-playback`, and the parts are `preview`, `play`, `player`, `caption` and `source`.

- **Player** (default): without a poster, the component renders a lazy iframe. With a poster, it shows the optimized image, with an empty decorative alt, inside a named `preview` button. Activating it loads one iframe and moves focus to it; playback never starts automatically and may need a second click on the provider's Play control. Nothing is requested from the provider before that activation.
- **Ambient**: after checking motion preferences, the component mounts one lazy, muted, looping iframe without controls (Vimeo `background=1`; YouTube autoplay, mute, single-video loop, hidden controls, inline playback). The poster stays underneath and its button becomes inert, and the ambient iframe is not a keyboard stop. The source link is visually hidden only under `data-lace-ambient="active"` and reappears on keyboard focus. Reduced motion and disabled JavaScript use player behavior. The preference is read on page load, not watched afterwards.

A source link stays available without JavaScript or when embedding fails. Use posters and few ambient blocks per page: lazy loading still costs bandwidth, and browsers may block autoplay, for example in low-power mode, in which case the provider shows a still frame.

**Motion accessibility:** ambient playback ships without a pause control and does not meet WCAG 2.2.2 (Pause, Stop, Hide) for videos longer than five seconds. This applies to `videoEmbed` blocks and gallery video items. Prefer player mode when the requirement applies, or add a control to your component copy. For example, place this button in the figure and add the handler to the component's script. It stops the ambient player and restores the player fallback; starting again begins from the start.

```html
<button type="button" data-stop-ambient>Stop motion</button>
```

```js
document.addEventListener("click", (event) => {
  if (!(event.target instanceof Element)) return;
  const control = event.target.closest("[data-stop-ambient]");
  const block = control?.closest('[data-lace-ambient="active"]');
  if (!block) return;
  const area = block.querySelector("[data-lace-video-area]");
  area.querySelector(":scope > iframe")?.remove();
  const preview = area.querySelector('[data-lace-part="preview"]');
  if (preview) preview.inert = false;
  else area.append(area.querySelector("[data-lace-video-template]").content.cloneNode(true));
  block.dataset.laceAmbient = "fallback";
  block.querySelector('[data-lace-part="source"]').focus();
  control.remove();
});
```

## Reference

- [Configuration reference](../../reference/configuration/): block definitions, list layout settings and gallery item fields.
- [CLI and environment](../../reference/cli-environment/): `lace add block` options for installing and updating components.
- [Connect an Astro site](../): installing, rendering and updating block components.
