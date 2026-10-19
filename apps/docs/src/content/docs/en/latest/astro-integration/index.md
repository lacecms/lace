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

Image and Gallery components support an opt-in, script-free full-size lightbox. A block/item link takes precedence and opens in the same tab. Adopt the starter's lightbox and link focus styles. After upgrading packages, review `lace add block image gallery hero --site <path> --dry-run`, update unedited files and merge customized components (`--write-new` provides `.new` proposals). Image/gallery schemas are now 4/3: raise affected model versions and synchronize content explicitly, with matching components ready before the next build. See [upgrade and rollback](../operations/#upgrade-and-roll-back).

## Style your components

Use public `data-lace-model`, `data-lace-entry`, `data-lace-block`, `data-lace-block-key` and `data-lace-part` hooks. Incidental tags/classes are not the styling contract. Gallery/navigation components ship source rather than a universal theme: provide your own layout, responsive CSS and accessible navigation behavior. Keep editor-chosen CSS classes in any purge safelist.

## Develop and deploy

Dev revalidates exports on render, but `getStaticPaths` and data passed through static path props may need a restart after publication. Token/environment or new/renamed route changes need restart. `pnpm build` creates a new static artifact. Host that artifact independently of the CMS; [deployment](../deployment/) explains automatic versus manual rebuilding.
