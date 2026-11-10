---
title: Connect an Astro site
description: Install source-owned block renderers and read published content at build time.
---

Starter mode includes an editable Astro site. Existing-site mode creates a CMS next to your Astro source without modifying it. No-site mode builds nothing until you configure a site. Run commands from the generated CMS directory unless stated otherwise.

## Install into an existing site

Install matching `@lacecms/sdk`, `@lacecms/astro`, `@lacecms/render` and `@lacecms/content` packages in the Astro project. Commit its lockfile. From the CMS root install source components:

```sh
pnpm exec lace add block --all --site ../my-astro-site
```

Use your actual relative site path. The command does not edit the site's package manifest and reports conflicts for edited managed files. Installed visual components are your source: customize them without modifying the engine. The registry is versioned; blindly overwriting edited components during an upgrade is not safe.

## Read and render

Follow the generated `docs/lace-astro-site.md` to create the server-only loader, block map and Astro routes. Keep `LACE_API_BASE_URL` and `LACE_BUILD_TOKEN` in build/server configuration, never browser bundles. The SDK's published-site loader assembles version-bound export pages; direct REST consumers must follow export pagination rather than assume one response contains all content.

Import transport helpers from `@lacecms/sdk`, framework-neutral helpers from `@lacecms/render`, descriptors from `@lacecms/content`, and Astro components from `@lacecms/astro`. The Astro package does not re-export every other package's API. Use `LaceBlocks` with the installed block map and `RichText` for validated rich-text rendering. Missing renderers or invalid block data should fail a build rather than emit a silently incomplete website.

Pages need corresponding Astro files. A collection uses `getStaticPaths`; a config route alone does not create it. Resolve published globals for shared site content and provide an explicit fallback for an unpublished optional global. Use the loader's metadata/path helpers for SEO, canonical URLs, robots and sitemap behavior. Set the public build-site URL deliberately, and disable indexing for staging.

## Optimize images

The generated starter already configures image optimization. For an existing site, install the matching Lace packages plus `sharp` in that site's dependencies and add image configuration in `astro.config.mjs`:

```js
import { laceImageConfig } from "@lacecms/astro";
import { defineConfig } from "astro/config";

export default defineConfig({
  image: laceImageConfig(process.env),
  output: "static",
});
```

Supply `LACE_API_BASE_URL` to the Astro configuration process as well as the server-only loader; if you use an environment file, load it explicitly as shown in the generated `docs/lace-astro-site.md`. The helper allows only that API's public media path. Keep the build token private and make originals reachable from the build environment.

`LaceImage.astro` builds WebP variants at 960 and 1920 pixels, each capped at the original width, with `srcset`, `sizes`, dimensions, alt text and focal point. GIF variants preserve animation. Eligible opaque images receive a blurred placeholder; GIF, transparent images and services without local transforms omit it. Images load lazily by default; Hero uses eager loading. A failed fetch or transform fails the build. Set the loader's `optimizeImages: false` to use direct public originals instead.

Image and Gallery components support an opt-in, script-free full-size lightbox for images. A block/item link takes precedence and opens in the same tab. Adopt the starter's lightbox and link focus styles. To update installed copies, review `lace add block image gallery hero --site <path> --dry-run`, update unedited files and merge customized components (`--write-new` provides `.new` proposals). Components must match the synchronized block versions before the next build.

## Style your components

Use public `data-lace-model`, `data-lace-entry`, `data-lace-block`, `data-lace-block-key` and `data-lace-part` hooks. Incidental tags/classes are not the styling contract. Gallery/navigation components ship source rather than a universal theme: provide your own layout, responsive CSS and accessible navigation behavior. Keep editor-chosen CSS classes in any purge safelist.

## Develop and deploy

Dev revalidates exports on render, but `getStaticPaths` and data passed through static path props may need a restart after publication. Token/environment or new/renamed route changes need restart. `pnpm build` creates a new static artifact. Host that artifact independently of the CMS; [deployment](../deployment/) explains automatic versus manual rebuilding.

## List layout styling

Gallery v4 installs `ListLayout.css` beside `GalleryBlock.astro`, which imports it
automatically. Both files are user-owned and hash guarded as one registry item.
A custom list can reuse the installed stylesheet with a relative import and the
same scalar settings described in [content modeling](../content-modeling/composites/).
Mark the existing outer element `data-lace-layout-container`, its list
`data-lace-layout={settings.layoutMode}`, `data-lace-wrap={String(settings.layoutWrap)}`,
`data-lace-preset={settings.layoutPreset}`, and direct items `data-lace-layout-item`.
A list that adopts `listLayoutItemFields()` also marks each item
`data-lace-placement={item.placement ?? "auto"}`; the stylesheet then places
`start`, `end` and `full` items in grid mode. Do not register the CSS under a
second item's ownership.

The stylesheet uses container queries and zero-specificity selectors in the
`lace-layout` layer. It owns neutral flex/grid structure and list resets only;
unmarked nested lists keep their styles. It sets no colors, typography, image
crop, aspect ratio or fixed height. Vertical flex wrapping needs a definite
height supplied by your CSS. Set `--lace-list-gap` (default 0) and
`--lace-list-item-min` (default 14rem) on the list. Unlayered site CSS overrides
display, gap and columns without `!important`. With your own layers, put the
site theme after `lace-layout` in the layer order.

The starter keeps its 1rem Gallery gap and 4:3 image crop in site CSS. Remove old
unlayered `display: grid` and `grid-template-columns` rules that would force flex
back into grid. Keep your image and decorative rules. Grid/auto keeps Gallery's
existing image `sizes`; other layouts use `100vw`, and a `natural` image with a
known width `W` requests `(max-width: Wpx) 100vw, Wpx`. Tune the user-owned
component's sizes to actual site widths, especially for custom layouts.

### Gallery placement and natural images

Gallery v6 marks every item part `data-lace-placement` (`auto`, `full`, `start`,
`end`) and every image item part `data-lace-size` (`fill` or `natural`).
Placement is structural and comes from `ListLayout.css`. Size is a hook for your
theme, which already owns image proportions: crop only `fill` images and let
`natural` images keep their width without overflowing their cell.

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

Until a theme adopts these rules it keeps cropping natural images. New gallery
video items start `ambient`; synchronization from rc2 keeps `player` on stored
video items that relied on the old default and rewrites the removed
`featured-first` preset to `columns-2` with a `full` first item.

### Gallery video items

Gallery items carry `kind`: `image` items render as before, `video` items
render inside their layout cell as `<li data-lace-part="item"
data-lace-kind="video">` with a `<figure data-lace-video
data-lace-aspect-ratio="…" data-lace-playback="…">`, a `[data-lace-video-area]`,
an optional `caption` part and a `source` link. Player items load a lazy,
non-autoplaying iframe. Ambient items mount a muted, looping player once on page
load; reduced motion and no JavaScript fall back to the player, as for the
Video embed block. Ambient playback has no pause control, which does not meet
WCAG 2.2.2 for motion longer than five seconds; add a control in your component
copy if you need one, and use ambient sparingly because each player loads
provider media. The lightbox and links never apply to videos, and dialog ids
count every stored item.

`GalleryVideo.css` installs beside the component. It reserves each video area at
its item's ratio (16:9 by default) with zero-specificity rules in the
`lace-layout` layer and visually hides the source link only while an ambient
player is mounted; unlayered site CSS overrides it.

Published items include only the fields their kind shows, so typed components
narrow before describing an image:

```astro
{data.images.map((item) =>
  item.kind === "video"
    ? item.videoUrl !== undefined && <MyVideo url={item.videoUrl} title={item.videoTitle} />
    : item.media !== undefined && <LaceImage image={image(item.media, item.alt)} />,
)}
```

### Update an installed Gallery component

Run `lace add block gallery --site site --dry-run`, review the proposed
`GalleryBlock.astro`, `ListLayout.css` and `GalleryVideo.css`, then run without
`--dry-run`. For a connected site, pass that site's directory. A CSS or
component conflict protects the files and the item's lock revision. Use
`--write-new` to inspect proposed files and merge edits by hand; active files
are never overwritten. An edited copy must check `kind` and `media` as above.
Remove competing structural Gallery rules from site CSS as described above and
keep spacing through `--lace-list-gap: 1rem`. Verify draft, published and
hidden lists, links overriding lightboxes, every layout and a site build.

For mode-specific admin controls, adopt both `listLayoutSettings()` and block-level
`settingsVisibility: listLayoutSettingsVisibility()` from `@lacecms/content`.
Wrap items appears for flex and Grid preset for grid, with hidden values retained
and validated. Errors can reveal an inactive control. This optional metadata needs
ordinary sync; sync may request a build, but visibility requires no Astro/CSS
or content migration.

## Video embeds

New starters include `videoEmbed`. Existing sites can install it with
`pnpm exec lace add block videoEmbed --site site` (use your actual site path).
Use matching content/render/adapter/CLI packages. Review the component and its
`VideoEmbed.css` companion together; use `--dry-run` and `--write-new` to resolve
local source conflicts. Register `builtInBlocks.videoEmbed`, allow the type in
selected CMS models, advance their versions and run configuration sync.

The block accepts YouTube watch/share/shorts/embed URLs and Vimeo video/player
URLs. For example, `https://youtu.be/dQw4w9WgXcQ` or an unlisted Vimeo URL
`https://vimeo.com/76979871/abc123def` (substitute the owner's real privacy hash).
Title is required for accessibility; poster image and caption are optional.
Provider restrictions and media references are validated in the CMS.

In player mode, without a poster the component renders a lazy iframe. A poster uses LaceImage,
including existing image optimization/focal point, with an empty decorative alt
inside a named button. Activating it loads one iframe and moves focus there;
playback never autostarts and can need a second click on Play. No provider
requests or thumbnails are loaded before that activation. A source link remains
available without JavaScript or if embedding fails. Provider privacy/domain
restrictions must permit the site. URL playback/tracking parameters are not
forwarded; only a Vimeo privacy hash is retained.

The renderer is site-owned. It is the sole built-in with a small local activation and ambient mounting
script; there is no provider SDK or framework hydration. `VideoEmbed.css` reserves
the selected responsive aspect ratio (16:9 by default) in `@layer lace-layout`; site CSS owns decoration. Hooks:
`data-lace-part="preview|play|player|caption|source"` on the corresponding elements.
`describeVideoEmbed` from `@lacecms/render` supplies canonical player data without
network access. Source URLs are content strings; only posters use media storage.
Video-file upload support is separate deferred work.

Settings use choice cards: `aspectRatio` is `16:9` (default), `4:3`, `1:1`,
`4:5` or `9:16`; `playback` is `player` (default) or `ambient`. For example,
a square showcase video has `settings: { aspectRatio: "1:1", playback: "ambient" }`.
`data-lace-aspect-ratio` and `data-lace-playback` expose these values on the root.
The description supplies both `src` and `ambientSrc`; input URL playback options
never override either canonical URL.

Ambient mode mounts one lazy iframe after checking motion preferences: Vimeo
uses `background=1`; YouTube uses autoplay, mute, loop with a single-video
playlist, hidden controls and inline playback. The poster stays underneath and
its button becomes inert. The ambient iframe is not a keyboard stop. The source
link is visually hidden only under `data-lace-ambient="active"`, and reappears
on keyboard focus. No provider request happens before the browser decides.
Reduced motion and disabled JavaScript use normal player behavior, including a
non-autoplaying iframe without a poster and a preview button/source link with one.
The preference is checked on load, not watched for later changes.

Use posters and limit ambient blocks per page: lazy loading still costs bandwidth.
Browsers may block autoplay (for example in low-power mode); the provider can
show a still frame instead. Verify real playback with videos allowed on your domain.

**Motion accessibility:** ambient ships without a pause control and does not meet
WCAG 2.2.2 (Pause, Stop, Hide) for videos longer than five seconds. Prefer player
mode when this requirement applies, or add a pause/stop control to your site-owned
component. For example, place this button in the figure and add the handler to
its local script; it stops the ambient player and restores the player fallback
(restarting later starts from the beginning, rather than resuming):

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

To update an installed copy, run `pnpm exec lace add block videoEmbed --site site`
before building (substitute your site path); it updates the component and its
CSS. Use `--write-new` to review locally edited copies. A component that does not
match the synchronized block version fails with `block_version_mismatch`.

For an optional manual playback smoke check, publish an owner-approved public
YouTube video and a Vimeo video allowed on your domain, with and without a poster.
Open the published site, verify keyboard activation and then press the provider's
Play control. Automated tests stub provider frames and do not prove external
availability or permissions. Keep renderers deployed while published content uses
the type; rolling back to a site without its renderer will fail the build.

## Internal URL destinations

Ordinary URL content fields support **Manual URL** and **CMS entry** modes,
including nested model/global fields and block data. Choosing a published page
stores its ID, so its link follows later slug changes. Settings, rich-text links,
video provider URLs and SEO canonical URLs keep their existing grammar.
Missing destinations keep their IDs for repair; publishing requires valid
visible destinations. Delete/unpublish reviews incoming links and requires an
extra acknowledgment when published-visible links would stop navigating.

Use `site.link(value)`, `entry.link(value)` or a published global's `link(value)`
before generating an href. Only `state === "resolved"` provides `href`;
`unavailable` retains its label/image without navigation, and `empty` has no
value. The Link block supports button/text appearances and optional new-tab
navigation. Updated Hero/CTA/navigation/image/gallery sources use this helper.

Build export format 2 carries local `internalLinks` manifests and needs the
matching SDK. The loader reports bounded `linkDiagnostics` once per assembled view and performs
no per-link network requests. Manual URLs and anchors retain their limitations.
