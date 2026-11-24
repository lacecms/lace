## Why

Astro already shows a blurred preview while an image loads, but the build separately downloads the full original to produce that preview. The durable WebP thumbnails shipped in [MP1](../2026-11-24-add-admin-media-thumbnails/) give the build a smaller input and let the preview appear with the page on a slow connection.

## What Changes

- Read the existing CMS derivative on demand for images rendered by `LaceImage.astro` in an optimized published build. Authorize the read with the build token and the media's current publication eligibility.
- Downsample the thumbnail at build time and inline a blurred background on eligible opaque still images. Visitors see it while the image loads, without a preview request or client script.
- Render the image without blur when its thumbnail cannot be used, including when a newer site builds against an older API. The build still reports failures fetching or transforming the original for responsive variants.
- Cover Hero, Image, Gallery image items, video posters and custom uses of `LaceImage` with published media descriptions. The lightbox continues to load the public original.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `media-use-cases` adds published-media eligibility for build reads of the stored derivative.
- `hono-app-factory` adds the build-token thumbnail route and its OpenAPI contract.
- `authentication-and-actor-boundary` extends the build credential challenge to the thumbnail route.
- `bootstrap-user-token-abuse-controls` covers use of the existing verifier and its usage timestamp on both authorized build reads.
- `prepublication-consumer-security` records the published-thumbnail scope while preserving the release acceptance boundary for drafts and admin resources.
- `public-sdk` reads bounded thumbnail bytes with the same credential isolation as the build export.
- `published-site-loader` attaches lazy thumbnail access to resolved media used in optimized builds.
- `render-core` carries optional thumbnail access through the pure image describer.
- `astro-adapter` uses the thumbnail for the existing inline blur and handles missing previews independently of variants.

## Impact

MP2, published Astro image placeholders, is one maintenance session following MP1 in the [extensibility roadmap](../../../../docs/extensibility-roadmap.md). Implementation starts by recording MP2 there and updating [architecture §§12–14](../../../../docs/architecture/README.md) for the build-only HTTP and rendering boundaries. The existing private derivative lifecycle supplies both Node/SILO and Worker/R2 builds.

The session relies on the existing build token, thumbnail recipe and Astro image service. It adds no second stored derivative, schema migration, export field, browser script or setting. The renderers already using `LaceImage` adopt the change through the adapter. Protected draft preview, standalone image descriptions, rich-text overrides that do not use `LaceImage`, and changes to the public original delivery pipeline are outside this session.
