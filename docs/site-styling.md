# Styling the public site

The public Astro site owns its presentation. Edit
[`apps/site/src/styles/site.css`](../apps/site/src/styles/site.css) to change
styles without changing Lace content, the admin application, or a block
component. `BaseLayout.astro` imports this global stylesheet for every static
route. A site rebuild publishes CSS changes; saving a CMS draft alone does not
change the public site.

## Stable selectors

| Attribute | Element | Value | Scope |
| --- | --- | --- | --- |
| `data-lace-model` | Entry `<main>` | Stable model key, such as `home` or `posts` | All entries of one model |
| `data-lace-entry` | Entry `<main>` | Stable public entry identifier | One entry, even if its slug changes |
| `data-lace-block` | Block root | Registered type, such as `hero` or `image` | All instances of one type |
| `data-lace-block-key` | Block root | Stable block key | One block within its entry |
| `data-lace-part` | Element inside a block | Semantic part name below | One part of a block |

`data-lace-block-key` is unique within an entry, not across the whole site. For
one specific block, combine it with `data-lace-entry`. You can inspect the
published page to copy the entry ID and block key. Page models such as `home`
have one entry, so their model key is usually a more readable selector.

The supported parts are:

| Block | `data-lace-part` values |
| --- | --- |
| `hero` | `eyebrow`, `heading`, `body`, `media`, `action` |
| `richText` | `content` |
| `image` | `media`, `caption`, with a link `link`, and with the lightbox on `lightbox-trigger`, `lightbox`, `lightbox-close`, `lightbox-media` |
| `quote` | `text`, `attribution` |
| `cta` | `heading`, `body`, `action` |
| `gallery` | `title`, `items`, `item`, `media`, `caption`, with an item link `link`, and with the lightbox on `lightbox-trigger`, `lightbox`, `lightbox-close`, `lightbox-media` |
| `navigation` | `list`, `item`, `link`, `label`, `submenu`, `toggle`, `children` |

An optional part is absent when the published block has no value for it. For
example, a `hero` without an image has no `data-lace-part="media"` element.
Rich-text `body` and `content` parts wrap the safe rendered rich-text nodes;
style headings or links inside those wrappers with ordinary descendant CSS.

## Expanded rich text

The reference and generated starter RichTextBlock use the common Astro renderer,
so H4, rules, plain code and link options need no copied component update.
[Authoring instructions](rich-text-authoring.md) include a starter walkthrough.
Style them within the existing `content`/`body` wrapper, for example:

```css
[data-lace-block="richText"] [data-lace-part="content"] pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
[data-lace-block="richText"] [data-lace-part="content"] h4 {
  margin-block: 1rem 0.5rem;
}
```

Retain pre/code whitespace and escaped text. New-tab/no-follow choices belong
to each document link; the common renderer supplies safe attributes.

## Examples

Add rules to `apps/site/src/styles/site.css`:

```css
/* Every hero on the site. The starter stylesheet ships this example. */
:where([data-lace-block="hero"]) {
  padding-block: 2rem;
}

/* Heroes on the home model only. */
[data-lace-model="home"] [data-lace-block="hero"] {
  max-width: 72rem;
}

/* Images in one published post. */
[data-lace-entry="first-post-entry"] [data-lace-block="image"] {
  margin-block: 3rem;
}

/* The heading of one block on the home page. */
[data-lace-entry="home-entry"]
  [data-lace-block-key="home-hero"]
  [data-lace-part="heading"] {
  max-width: 20ch;
}
```

These entry and block identifiers come from the committed reference fixture;
use the values on your own published pages in a generated project. The CSS
file is site-owned and can be changed freely. The `:where()` example has low
specificity; use normal CSS specificity when you need a more targeted rule.

Astro scopes `<style>` rules written inside a component by default. The
imported site stylesheet is global, so its selectors can reach block
components rendered inside routes. Keep these rules under the entry/block
selectors to avoid styling unrelated page elements.

The `data-lace-*` names and documented part values are the reference site's
public styling contract. HTML tag names, nesting beyond the part wrappers,
and existing classes such as `hero`, `rich-text`, and `cta` are implementation
details. This contract changes CSS targeting only; changing the structure or
behavior of a block still requires editing its Astro renderer. Automatically
generated HTML `id` attributes are not part of the contract.

Editors can also give a block an in-page anchor and an extra class name in
Admin. The block root then carries `id="<anchor>"` and the class name after
its own classes, for example `<aside class="cta cta--highlight" … id="get-started">`
in the reference fixture, and links such as `#get-started` jump to it. These
values are content that editors change, not part of the `data-lace-*`
contract; style an editor class only when the site offers it on purpose.
Hidden blocks are never rendered.

## Gallery and navigation

Neither component ships styles. `site.css` lays galleries out as an adaptive
grid (`repeat(auto-fill, minmax(min(14rem, 100%), 1fr))`) whose images use
`aspect-ratio: 4 / 3` and `object-fit: cover`, so the focal point set in Media
decides the crop through the rendered `object-position`. Navigation is a
vertical list below `48rem` with submenus shown inline, and a wrapping row with
absolutely positioned dropdown submenus from `48rem`; submenus open through the
native `<details>` disclosure. The current page's link carries
`aria-current="page"`, which the stylesheet makes bold.

The site-wide navigation comes from the `navigation` global and is rendered in
the layout header, outside `[data-lace-entry]`. Select it with
`.site-header [data-lace-block="navigation"]`, or style navigation inside page
content with `[data-lace-entry] [data-lace-block="navigation"]`. While the
global is unpublished the header shows the static `.site-nav` fallback from
`BaseLayout.astro`, which shares the same list rules.

## Images and the lightbox

Block images are WebP variants with `srcset`; an opaque image also carries a
blurred inline `background-image` placeholder until it loads, so keep its
`background-*` properties unset in site CSS. With the *Open full screen*
setting on, the `image` block and each gallery item wrap the `media` image in a
`lightbox-trigger` button that opens the `lightbox` `<dialog>`, holding a
`lightbox-close` button and the original as `lightbox-media`. `site.css` resets
the trigger button, shows a focus ring, sizes the dialog to the image (so the
`::backdrop` around it stays clickable), constrains the original to the
viewport with `object-fit: contain`, and pins the close button to the top
right.

An `image` block or gallery item with a *Link* wraps its `media` image in a
`link` anchor instead and never gets a lightbox. `site.css` makes the anchor a
block and gives it the same focus ring as the trigger.

## Alpha.7 image adoption

The matching image/gallery/hero registry components use `LaceImage.astro` for
build-time WebP variants. Install site `sharp`, configure `laceImageConfig` with
the build API origin, and review component changes with `lace add block`
`--dry-run`/`--write-new` rather than replacing customized source blindly.
Image/gallery versions 4/3 need explicit model-version advances and content sync;
components must match before rebuilding. Copy lightbox/link focus rules and
Pages `public/_headers` from the matching starter. See the
[alpha.7 upgrade guide](./compatibility.md#alpha-7-upgrade-and-rollback) for order
and backup boundaries, and the generated Astro guide for complete setup.
