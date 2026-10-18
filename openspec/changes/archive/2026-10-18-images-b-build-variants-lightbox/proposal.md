## Why

Every image on a Lace site is the uploaded original, served from the API at
full size: a portfolio page with a 50-image gallery downloads hundreds of
megabytes of JPEG and PNG, shows empty boxes while they load, and offers no
way to look at the original full screen. Step A (GIF upload and cache
validators) is archived, so the build can now fetch media cheaply and
revalidate it.

## Roadmap unit

**Step B of the three-change image-delivery plan** recorded in `backlog.md`
(selected 2026-10-18, replaces CE11):

- A — `images-a-media-format-caching`: done (archived 2026-10-18).
- **B — `images-b-build-variants-lightbox` (this change):** build-time WebP
  variants, inline blurred placeholder, lazy loading and an opt-in lightbox.
- C — deploy caching: 30-day caching of hashed `/_astro/` assets and
  persistent build caches.

B is verifiable alone through the reference-site fixture build, the adapter
and registry component tests, and a generated project build. C only changes
how long the files B produces are cached.

Owner decisions taken while planning (2026-10-18):

- GIF is not copied unchanged: Astro's pipeline cannot emit GIF, so GIFs go
  through the same pipeline and become **animated WebP** variants.
- The lightbox uses HTML **invoker commands** (`commandfor`/`command`) on a
  native `<dialog>`, with no script; browsers without invoker commands
  (before Chrome 135, Firefox 144, Safari 26.2) show the image without the
  full-screen action.
- The **hero** image also gets variants and a placeholder, loaded eagerly with
  high fetch priority and without a lightbox.

## What Changes

- **Build-time variants.** A new adapter component
  `@lacecms/astro/LaceImage.astro` renders one described image through the
  Astro image pipeline (`getImage` from `astro:assets`): WebP at 960 and
  1920 px wide, each capped at the original width, as `srcset` with `w`
  descriptors and a component-supplied `sizes`, plus `width`/`height`,
  `loading="lazy"` (or eager with `fetchpriority="high"`) and
  `decoding="async"`. Variants are written to `dist/_astro/` and reuse
  Astro's remote-image cache, which revalidates with the media `ETag` from
  step A.
- **Inline blurred placeholder.** The adapter fetches each original once per
  build process, makes a 64 px WebP through the configured image service and
  inlines it as a blurred SVG `background-image` on the `<img>`. It is left
  out for images with transparency, animated sources and image services
  without local transforms; a disk cache keyed by the media URL avoids
  re-downloading originals on later builds.
- **Build source URL.** Resolved media in the SDK site view gain `sourceUrl`,
  the public media path under `LACE_API_BASE_URL` that the build can always
  reach; `url` stays the public URL used by the site and the lightbox. A new
  loader option `optimizeImages: false` omits `sourceUrl`, and the adapter
  then renders the original URL as before. The render core's image
  description carries `mimeType` and `sourceUrl` when known.
- **Remote image allowance.** `laceImageConfig(env)` from `@lacecms/astro`
  returns Astro `image.remotePatterns` that allow exactly the public media
  path of `LACE_API_BASE_URL`; site `astro.config.mjs` uses it.
- **Lightbox.** `image` (definition version 3) and `gallery` (version 2)
  declare a boolean setting `lightbox`, default off, with identity
  migrations. When on, each image is wrapped in a button that opens a native
  modal `<dialog>` showing the original from its public URL, loaded only when
  opened, with a close button, Escape and light dismiss. Built-in blocks now
  declare settings (architecture §11 is updated).
- **Registry revisions.** `image` revision 5, `gallery` revision 2 and `hero`
  revision 4 render through `LaceImage`; components still carry no `<style>`
  or `<script>`.
- **Template 0.32.0.** Starter `lace.config.ts` bumps `home` and `posts` to
  version 3; the starter site gets the new components, `laceImageConfig` in
  `astro.config.mjs`, placeholder and lightbox styles and lock updates; the
  site guide and upgrade instructions describe adoption. The reference site
  and the existing-site fixture follow.

No database migration and no API change. **Breaking for sites:** content
synchronized with the new definitions requires the new registry components
(the old ones reject `image` version 3 and `gallery` version 2 with
`block_version_mismatch`), and the new components require the new adapter.

## Non-goals

- AVIF output, focal-point art-direction crops and per-block size options.
- Rich-text images (rich text has no image node) and SEO `og:image` (stays
  the original public URL).
- Long-lived caching headers and persistent CI build caches (step C).
- A script fallback for browsers without invoker commands.
- Image CDN services (Cloudflare Images) as the pipeline.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `render-core`: image descriptions carry the media type and build source URL.
- `published-site-loader`: resolved media carry `sourceUrl`; the
  `optimizeImages` option.
- `astro-adapter`: the `LaceImage` component (variants, placeholder,
  lightbox), `laceImageConfig`, and the packed component list.
- `block-registry`: `image` version 3 and `gallery` version 2 with the
  `lightbox` setting; built-ins may declare settings.
- `block-source-registry`: built-in image components render through
  `LaceImage`, with the lightbox when the setting is on.
- `astro-reference-site`: the reference build renders optimized images and
  lightboxes against a served fixture media origin.
- `project-generator`: template 0.32.0.
- `workspace-governance`: the Astro adapter may import `astro:` virtual
  modules and `node:` builtins (owner decision during apply, 2026-10-18: the
  placeholder disk cache needs `node:fs`).

## Impact

- Code: `packages/render` (`RenderableMedia`, `ImageDescription`),
  `packages/sdk` (`PublishedMedia.sourceUrl`, `optimizeImages`),
  `packages/astro` (`LaceImage.astro`, `images.ts`, `laceImageConfig`,
  package exports), `packages/content` (built-in `image` v3, `gallery` v2),
  `registry/astro/{image,gallery,hero}`, `packages/create-lace/templates`
  (config, site, docs, upgrade instructions), `apps/site`,
  `tests/fixtures/existing-astro-site`, root `lace.config.ts`.
- Tests and fixtures whose pinned model versions, hashes, block versions or
  rendered markup change: config projection fixture, API project-config and
  content-sync tests, Worker tests, CLI block/upgrade tests, generated-project
  fixtures, cross-runtime expectations.
- Docs: `docs/mvp-architecture.md` §11, §13.2–§13.5 and the built-in block
  list; `docs/site-styling.md`; `backlog.md` (B done); template
  `docs/lace-astro-site.md`.
- Dependencies: sites declare `sharp` (pinned `0.35.5`, the version Astro
  7.3 uses) because Astro's sharp image service is loaded from the site's own
  dependencies under pnpm's strict layout; no Lace package gains a dependency.
