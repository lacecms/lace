## Context

See proposal.md for motivation and the owner decisions. Current state:

- Registry components (`registry/astro/{image,gallery,hero}`) render
  `<img src={media.src}>` from the render core's `ImageDescription`
  (`src`, `alt`, `width`, `height`, `caption`, `objectPosition`). `src` is the
  resolved public media URL: `LACE_PUBLIC_BASE_URL` when set, else the
  export's URL (`packages/sdk/src/published-site.ts`, `buildSite`).
- `@lacecms/astro` ships `LaceBlocks.astro`, `RichText.astro`,
  `LaceSeo.astro` and a server module; no integration, no client script
  (architecture §13.4). Built-in components carry no `<style>`/`<script>`
  (§13.5). Built-in blocks declare no settings (§11).
- Astro 7.3 `getImage()` (`astro:assets`) accepts a remote URL with explicit
  `width`/`height`, requires the URL to match `image.remotePatterns`, emits
  `/_astro/*.webp` during a static build, and caches remote originals in
  `<cacheDir>/assets/` with the response's `expires`/`ETag`, revalidating
  with `If-None-Match` (step A answers `304`). Its sharp service opens
  sources with `pages: -1` and encodes GIF input to animated WebP with
  `loop: 0`. GIF is not an output format, so a GIF cannot be emitted
  unchanged; the owner chose animated WebP.
- `getConfiguredImageService()` and `imageConfig` are public `astro:assets`
  exports; a local service exposes `transform(bytes, options, imageConfig,
  logger)`.
- The reference site builds in fixture mode during `turbo run build` with an
  unreachable media host (`cms.example.test`); its fixture test also builds
  in live mode against a local HTTP server.
- Changing a block definition requires a block version bump, migrations and
  a version bump of every model that allows the block (§8, §11).

## Goals / Non-Goals

**Goals:** smaller, responsive WebP images with no layout shift and an
instant blurred preview; an opt-in full-screen original; reuse of Astro's
pipeline and cache; no client script; unchanged behavior when optimization is
switched off.

**Non-Goals:** AVIF, art direction, rich-text images, image CDNs, step C
caching, a script fallback for the lightbox.

## Decisions

### D1. One adapter component owns image rendering

`@lacecms/astro/LaceImage.astro` (new export, copied to `dist/` like the
other components) takes `image: ImageDescription`, `sizes` (default
`100vw`), `loading` (`lazy` | `eager`), `lightbox` (boolean) with
`lightboxId`, and spreads remaining attributes (`data-lace-part`, `class`)
onto the `<img>`. Registry components replace their `<img>` with it, so the
variant, placeholder and lightbox logic is maintained once and updated with
the adapter package rather than copied into user-owned files. It is not a
visual block and adds no script, so §13.4 holds. Logic that does not need
`astro:assets` lives in `packages/astro/src/images.ts` (variant widths, SVG
placeholder, WebP alpha check, placeholder cache), exported from the server
module so `LaceImage.astro` imports it by package name, like `LaceBlocks`
imports the render core. The component passes `getImage`,
`getConfiguredImageService` and `imageConfig` into those helpers, which keeps
them unit-testable without Astro.

*Alternative:* Astro's `<Picture>`/`<Image>` with `layout`. Rejected: it
picks its own breakpoint list, cannot inline a placeholder and would still
need the remote/source decisions below.

### D2. Build source URL separate from the public URL

The build must fetch originals from an origin it can reach. The SDK always
reaches `LACE_API_BASE_URL` (it read the export from there), while the public
URL (`LACE_PUBLIC_BASE_URL` or the export URL) may be a public domain the
builder container cannot resolve. `PublishedMedia` gains `sourceUrl =
apiClient.getPublicMediaUrl(id)` (the unauthenticated client on the API base,
never the token). `url` keeps its meaning and is used for the non-optimized
`src`, the lightbox original and SEO. `PublishedSiteLoaderOptions.optimizeImages`
(default `true`; forwarded by `createAstroSiteLoader`) omits `sourceUrl`.
`RenderableMedia` gains optional `mimeType` and `sourceUrl`;
`createImageDescriber` copies them into `ImageDescription`. The public wire
DTO is unchanged.

### D3. Remote allowance derived from the API base URL

`laceImageConfig(env)` (server module) parses `LACE_API_BASE_URL` and returns
`{ remotePatterns: [{ protocol, hostname, port, pathname:
"<base path>/api/v1/public/media/*" }] }` (`port` omitted when default), or
`{ remotePatterns: [] }` for a missing or non-HTTP(S) value. Only the public
media path is allowed, so Astro's dev `/_image` endpoint cannot proxy other
API routes or hosts. Site `astro.config.mjs` builds `env` from `.env` (Node's
`util.parseEnv` on the file the site already uses through `envDir`) overlaid
by `process.env`, because Astro does not load `.env` into the config
process, and sets `image: laceImageConfig(env)`.

### D4. Variants

For a description with `sourceUrl`, `width` W and `height` H, widths are the
sorted distinct values of `min(960, W)` and `min(1920, W)`; each variant is
`getImage({ src: sourceUrl, width: w, height: round(w × H / W), format:
"webp" })`. The `<img>` gets `src` = narrowest variant, `srcset` = all
variants with `w` descriptors, `sizes`, and the original `width`/`height` (the
aspect ratio is what prevents layout shift; existing markup assertions keep
the original numbers). Quality stays Astro's default for the configured
service. GIFs take the same path and become animated WebP. A description
without `sourceUrl` or dimensions renders `src` unchanged. `loading` is
`lazy` by default; `eager` adds `fetchpriority="high"`; `decoding="async"`
always.

Fetch or transform failures surface from Astro during the build (variants)
or from the placeholder fetch (D5) and fail it; the previous deployment
stays live, as for any failed build.

### D5. Placeholder

`placeholderFor(sourceUrl, { width, height, mimeType })`:

1. Skip for `image/gif`, or when the configured service has no `transform`
   (external services).
2. Look up an in-process `Map<string, Promise<string | null>>` keyed by
   `sourceUrl`, so concurrent and repeated renders share one fetch.
3. Read `<cwd>/node_modules/.astro/lace/placeholders/<sha256(sourceUrl +
   "|v1")>.txt` (Astro's default cache directory, which step C persists).
   The file holds the data URL or `none`. Media bytes are immutable per
   identifier (step A, D3), so the key never goes stale.
4. Otherwise `fetch(sourceUrl)` (non-2xx → error naming the URL and status),
   then `service.transform(bytes, { src, width: min(64, W), height,
   format: "webp", quality: 50 }, imageConfig, logger)`.
5. If the WebP has alpha (`VP8X` flags bit `0x10`, or the `VP8L` header's
   alpha bit) the result is `none`; else an SVG
   `viewBox="0 0 w h"` with an `feGaussianBlur` (and an opaque-alpha
   component transfer so edges do not fade) over
   `<image href="data:image/webp;base64,…">`, escaped for a CSS `url("…")`.
6. Write the cache file; write failures only warn.

The `<img>` style gets `background-image`, `background-size: cover`,
`background-repeat: no-repeat` and `background-position` (focal point or
`50% 50%`) next to `object-position`. An opaque loaded image covers the
background, so no script is needed to remove it; transparent images are
exactly the case that is skipped.

The boundary check previously forbade every Node builtin in the adapter (the
`astro-node` fixture). The owner chose during apply to allow `node:`-scheme
builtins and `astro:` virtual modules there, since the adapter is server-only
and runs only in Node site builds; bare builtin specifiers stay forbidden.
The repository's TypeScript-scanner-based checker stalls on a regex literal
containing `#`, so the SVG escaping uses `replaceAll`.

*Alternatives:* a placeholder generated by the CMS at upload (impossible on
Workers without an image decoder); a separate tiny file in `/_astro/`
(rejected by the owner: an extra request); direct `sharp` (a new dependency
next to Astro's own; the configured service keeps one pipeline).

### D6. Lightbox through invoker commands

```html
<button type="button" command="show-modal" commandfor="ID"
        aria-haspopup="dialog" aria-label="Open full-size image: ALT"
        data-lace-part="lightbox-trigger"><img …></button>
<dialog id="ID" closedby="any" aria-label="ALT" data-lace-part="lightbox">
  <button type="button" command="close" commandfor="ID"
          data-lace-part="lightbox-close">Close</button>
  <img src="PUBLIC URL" alt="ALT" width height loading="lazy"
       decoding="async" data-lace-part="lightbox-media">
</dialog>
```

`<dialog>` gives modality, focus return and Escape; `closedby="any"` adds
backdrop clicks where supported. A lazy image inside a closed dialog is not
fetched until the dialog opens. Identifiers are
`lace-lightbox-<entry id>-<block key>[-<index>]`, unique per page because an
entry's block keys are unique and layouts render other entries with other
identifiers. The site stylesheet sizes the dialog to its content (so the
backdrop stays clickable), constrains the image to the viewport with
`object-fit: contain`, resets the trigger button and shows a focus ring.
Browsers without invoker commands render an inert button; this is
documented.

*Alternative:* `:target` CSS lightbox — works everywhere but changes the URL
and history and has no focus management. Rejected.

### D7. Block versions and settings

`image` v3 and `gallery` v2 declare `settings: { lightbox: field.boolean({
defaultValue: false, label: "Open full screen", description: "Opens the
original image full screen when it is selected." }) }` with identity
migrations (`(block) => block`; the result keeps the stored, empty settings
and validation applies the default). Settings enter the structural hash, so
the root configuration (`home` 6, `about` 5, `posts` 6, `notes` 5) and the
starter (`home` 3, `posts` 3) bump their model versions. The admin renders
the setting through the existing generic Settings tab; no admin code changes.
Architecture §11 changes from "Built-in blocks declare no settings" to
naming the two settings.

### D8. Registry, starter and reference site

Item revisions: `image` 5 (blockVersion 3), `gallery` 2 (blockVersion 2),
`hero` 4. The starter, the reference site and the existing-site fixture copy
the components byte-identically and update their locks. Starter and
reference stylesheets gain the lightbox rules. The starter, the reference
site and the existing-site fixture declare `sharp`: Astro's bundled sharp
service imports it from the site, and pnpm does not expose Astro's optional
dependency there (found during apply: builds failed with `MissingSharp`). The reference site's fixture
mode sets `optimizeImages` only when `LACE_API_BASE_URL` is explicitly set,
so `turbo run build` keeps working offline; its fixture test starts a local
server that serves generated fixture images (an opaque JPEG, a transparent
PNG, an animated GIF) at the public media path and builds against it.
Template version 0.32.0 with upgrade instructions and the site guide.

## Risks / Trade-offs

- [The first build of a large gallery downloads every original twice: once
  by Astro, once for placeholders] → later builds revalidate Astro's cache
  with `304` and read placeholders from disk; step C persists both caches.
- [`service.transform` is a lower-level Astro API whose signature changed
  in Astro 7 (logger argument)] → used only for placeholders behind the
  `^7.3.1` peer range; a missing `transform` skips placeholders; adapter
  tests run against the pinned Astro.
- [Animated GIF transcoding of large files lengthens builds] → bounded by the
  10 MiB upload limit and cached across builds.
- [Inline placeholders grow HTML by roughly 1–2 KB per image] → accepted by
  the owner; a 50-image gallery adds under 100 KB before compression.
- [Old registry components fail after sync migrates blocks] → upgrade
  instructions order sync, component update and build; the render core's
  `block_version_mismatch` names the block.
- [Registry items keep requiring the current alpha version] → the next
  release change raises every item's `requires` together with the packages.

## Migration Plan

No database migration. Content sync migrates stored `image` and `gallery`
blocks to the new versions without changing data. Sites must update the three
components, the Astro config and stylesheet before their next build. Rollback:
revert packages and configuration, then roll the content back by restoring
the database backup, because sync refuses stored block versions newer than
the configuration.
