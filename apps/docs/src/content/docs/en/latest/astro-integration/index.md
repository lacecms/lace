---
title: Connect an Astro site
description: Install source-owned block components, read published content at build time and keep installed components up to date.
kind: guide
verifiedAgainst: 0.1.0-rc3
---

Lace does not render your website. Your Astro site reads published content from the CMS at build time through the Lace SDK and renders it with block components that are installed into the site as editable source. This guide connects a site, reads pages, collections and globals, renders blocks, rich text, images and video, and updates installed components safely.

Starter mode includes an editable Astro site in `site/`. Existing-site mode creates the CMS next to your Astro project without modifying it. No-site mode builds nothing until you connect a site. Run commands from the generated CMS directory unless stated otherwise.

## Before you start

- A generated Lace project with its CMS running and at least one published entry; see [Start with Lace](../getting-started/).
- A read-only build token created in Admin **Settings**.
- For an existing site: an Astro `^7.3.1` project with a committed lockfile, outside the CMS directory.
- Lace packages, CLI and images from the same release. Installed components target the block versions of that release.

## Install into an existing site

Starter projects are already connected; skip to [Read published content](#read-published-content). For an existing site, install the matching packages in the Astro project and commit its lockfile:

```sh
pnpm add @lacecms/astro@0.1.0-rc3 @lacecms/render@0.1.0-rc3 @lacecms/sdk@0.1.0-rc3 @lacecms/content@0.1.0-rc3 sharp
```

Upgrade these four Lace packages together. Then install the block components from the CMS root, using your site's actual relative path:

```sh
pnpm exec lace add block --all --site ../my-astro-site
```

The command writes components into the site, regenerates its block map and records them in the site's `lace.site.json`. It never edits the site's `package.json`; when a dependency is missing it prints the `pnpm add` command instead. Installed components are your source: customize them freely. Follow the generated `docs/lace-astro-site.md` for the loader file, TypeScript settings and the first routes; it matches your project's release.

## Read published content

Keep `LACE_API_BASE_URL` and `LACE_BUILD_TOKEN` in server-side build configuration, such as the site's ignored `.env`, and never prefix them with `PUBLIC_`. `LACE_PUBLIC_BASE_URL` sets the browser-facing media origin when it differs from the API origin. The generated loader file `src/lib/lace.ts` calls `createAstroSiteLoader` from `@lacecms/astro`; `getSite()` returns one published site view:

- `byPath(path)` returns a page entry; `entries(model)` lists a collection for `getStaticPaths`, and `bySlug(model, slug)` reads the current entry on each render.
- `records(model)` lists the published entries of a collection without a `route`. These records have a title, fields, blocks, `media()`/`image()` and `link()`, but no path, slug or SEO group, and they never appear in entry lookups or the sitemap. Render them in any page, for example a team list or testimonials; they need no route files.
- `global(model)` returns a published global such as site navigation, or `undefined` while it is unpublished. Provide a deliberate fallback for optional globals.
- `seo(entry)`, `url` and `urlFor(path)` give SEO metadata with fallbacks, canonical URLs and sitemap entries; see [SEO](../content-modeling/seo/).

A model in `lace.config.ts` does not create Astro routes. Every page and collection needs matching files in `src/pages/`; a collection listing page such as `/works/` is ordinary Astro code that calls `entries(model)`. When you replace the starter's models, delete route files for models you removed, such as `site/src/pages/blog/`: they would otherwise fail the build looking for content that no longer exists.

Import transport helpers from `@lacecms/sdk`, framework-neutral render helpers from `@lacecms/render`, block definitions from `@lacecms/content` and Astro components from `@lacecms/astro`; the Astro package does not re-export the others. The loader assembles the paged, version-bound build export for you. Code that reads the REST export directly must follow its pagination and format rules in the [API reference](../reference/api/).

Internal links between entries are resolved by the same view: call `site.link(value)`, `entry.link(value)` or a global's `link(value)` and render an anchor only when the result is `resolved`. [Internal links](../content-modeling/links/) explains destinations, unavailable links and the loader's link diagnostics.

Set `LACE_BUILD_SITE_URL` to your public site URL so pages get canonical URLs and the build writes `sitemap.xml`, and set `LACE_SITE_INDEXING=off` for staging builds.

## Render blocks and rich text

Render a page's ordered blocks with `LaceBlocks` from `@lacecms/astro` and the generated block map in `src/lace/blocks.ts`. Block data is validated with the CMS rules before a component receives it. A published block without a mapped component, invalid block data or a component that does not match the synchronized block version fails the build with model, entry and block identifiers instead of emitting an incomplete page.

The installed `RichTextBlock.astro` delegates to the common renderer:

```astro
---
import RichText from "@lacecms/astro/RichText.astro";
---
<RichText document={data.content} />
```

Keep this delegation; do not replace it with raw HTML or a copied allowlist. `RichText` emits only the shared element set: paragraphs, headings `h1`–`h4`, lists, block quotes, `hr`, links, emphasis, inline code and code blocks as `pre`/`code` with escaped, whitespace-preserving text. A link without options has only `href`; a new-tab link adds `target="_blank"` and `rel="noopener noreferrer"`; a nofollow link adds `nofollow` to `rel`.

To change the element for one node or mark, pass `components`; an override receives the validated element and its rendered children:

```astro
<RichText components={{ link: ExternalLink }} document={document} />
```

An override must keep the same grammar: forward the validated `href`, `target` and `rel` attributes, and note that a `codeBlock` override is called for both the `pre` and the `code` element. Style rich text through its block wrapper as described in [Style your site](styling/#style-rich-text).

## Optimize images

The generated starter already optimizes images. For an existing site, install `sharp` as above and add the image configuration to `astro.config.mjs`:

```js
import { laceImageConfig } from "@lacecms/astro";
import { defineConfig } from "astro/config";

export default defineConfig({
  image: laceImageConfig(process.env),
  output: "static",
});
```

The Astro configuration process needs `LACE_API_BASE_URL` too; if you use an environment file, load it explicitly as shown in the generated `docs/lace-astro-site.md`. The helper allows only that API's public media path. Originals must be reachable from the build environment.

`LaceImage.astro` builds WebP variants at 960 and 1920 pixels, each capped at the original width, with `srcset`, `sizes`, dimensions, alt text and focal point. GIF variants keep their animation. Eligible opaque images get a blurred placeholder; GIFs, transparent images and image services without local transforms omit it. Images load lazily, except Hero, which loads eagerly. A failed fetch or transform fails the build. Pass `optimizeImages: false` to the loader to use the original public media URLs instead.

Variants are written into the static output, but lightbox originals and URLs from `mediaUrl()` point at the CMS's public media path, so that path must stay reachable from readers' browsers.

Image and gallery components support an opt-in, script-free full-size lightbox for images. A block or gallery item link takes precedence: the image opens its link in the same tab and gets no lightbox. Copy the lightbox and link focus styles from a matching starter; see [Style your site](styling/#style-images-and-the-lightbox).

## Add video embeds

New starters include the `videoEmbed` block. To add it to an existing site, register `builtInBlocks.videoEmbed` in `lace.config.ts`, allow `"videoEmbed"` in the chosen models, raise their versions and run configuration sync (see [content modeling](../content-modeling/)). Then install the component and its stylesheet:

```sh
pnpm exec lace add block videoEmbed --site site
```

Use your actual site path. Review `VideoEmbedBlock.astro` and `VideoEmbed.css` together.

The block accepts YouTube watch, share, shorts and embed URLs and Vimeo video and player URLs, including unlisted Vimeo links with their privacy hash, for example `https://youtu.be/dQw4w9WgXcQ`. Title is required for accessibility; poster image and caption are optional. Settings choose `aspectRatio` (`16:9` default, `4:3`, `1:1`, `4:5`, `9:16`) and `playback` (`player` default, or `ambient`). A square showcase video has `settings: { aspectRatio: "1:1", playback: "ambient" }`.

The renderer is site-owned and the only built-in with a small local script for activation and ambient mounting; there is no provider SDK or framework hydration. `describeVideoEmbed` from `@lacecms/render` returns the canonical player URLs (`src` and `ambientSrc`) without network access. Playback and tracking parameters from the entered URL are never forwarded; only a Vimeo privacy hash is kept. Provider privacy and domain restrictions must allow your site. Player and ambient behavior, styling hooks and the missing pause control are described in [Style your site](styling/#style-video-embeds).

To check playback manually, publish a public YouTube video and a Vimeo video allowed on your domain, with and without a poster, then open the built site, activate each with the keyboard and press the provider's Play control. Keep the renderer deployed while published content uses the block: a site without it fails its build.

## Update installed components

Lace never overwrites a component you edited. Review an update first, then apply it:

```sh
pnpm exec lace add block image gallery hero --site site --dry-run
pnpm exec lace add block image gallery hero --site site
```

Unedited files are updated. An edited component, stylesheet or block map is reported as a conflict with a diff, and its files and lock revision stay unchanged. Add `--write-new` to write the proposed files next to yours as `.new` files and merge them by hand. Components must match the synchronized block versions before the next build; otherwise the build fails with `block_version_mismatch`.

The gallery registry item installs `GalleryBlock.astro`, `ListLayout.css` and `GalleryVideo.css` as one hash-guarded unit. Gallery items have a `kind`: published `image` items carry `media` and image fields, `video` items carry only video fields, so `media` can be absent. A gallery component you copied and edited must narrow by `kind` and check `media` before describing an image:

```astro
{data.images.map((item) =>
  item.kind === "video"
    ? item.videoUrl !== undefined && <MyVideo url={item.videoUrl} title={item.videoTitle} />
    : item.media !== undefined && <LaceImage image={image(item.media, item.alt)} />,
)}
```

When you upgrade from rc2, configuration sync keeps `player` playback on stored gallery video items that relied on the earlier default (new items start `ambient`) and rewrites the removed `featured-first` preset to `columns-2` with a `full` first item. Remove competing structural gallery rules from your CSS as described in [Style your site](styling/#lay-out-lists-and-galleries). Then check draft, published and hidden lists, links that override the lightbox, every layout and a site build.

## Develop and build

`pnpm dev` revalidates the export on each render, so published changes to existing routes appear on reload. Restart it after changing tokens or other environment values, after adding or renaming slugs, and when route data passes through `getStaticPaths` props. `pnpm build` writes a new static site to `dist/`. Hosting it is a separate step: [deployment](../deployment/) explains automatic and manual rebuilds after publication.

## Reference

- [CLI and environment](../reference/cli-environment/): `lace add block` options and the site build settings.
- [Configuration reference](../reference/configuration/): block definitions and model options.
- [API documentation](../reference/api/): the build export for code that reads REST directly.
