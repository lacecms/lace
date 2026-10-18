## ADDED Requirements

### Requirement: The adapter renders build-time image variants
The adapter SHALL provide an image component that takes an image description from the render core, a `sizes` value (default `100vw`), a `loading` mode `lazy` (default) or `eager`, and extra attributes that it places on the image element. When the description has a build source URL, a width and a height, the component SHALL produce through the site's Astro image pipeline one WebP variant for each distinct width of `min(960, W)` and `min(1920, W)`, where `W` is the original width, each with the height `round(w × H / W)`, and SHALL render one image element whose `src` is the narrowest variant, whose `srcset` lists every variant with a `w` descriptor in ascending width, whose `sizes` is the given value, and whose `width` and `height` are the original dimensions. GIF sources SHALL follow the same rule and produce animated WebP variants. Without a build source URL or without known dimensions, the component SHALL render the description's `src` with no `srcset` and keep `width` and `height` when known. In every case the image element SHALL carry the effective `alt`, `decoding="async"`, the `loading` mode, `fetchpriority="high"` when eager, and the focal-point `object-position` when known. The site build SHALL fail, naming the source URL, when an original cannot be fetched or transformed.

#### Scenario: A large photo
- **WHEN** a 3000 × 2000 JPEG with a build source URL is rendered with sizes `(min-width: 64rem) 60rem, 100vw`
- **THEN** the image has WebP variants 960 × 640 and 1920 × 1280 under `/_astro/`, `src` is the 960 variant, `srcset` lists `960w` then `1920w`, `width="3000"`, `height="2000"`, `loading="lazy"` and `decoding="async"`

#### Scenario: An image narrower than both widths
- **WHEN** an 800 × 600 PNG with a build source URL is rendered
- **THEN** it has exactly one 800 × 600 WebP variant listed as `800w`

#### Scenario: An image between both widths
- **WHEN** a 1200 × 630 image with a build source URL is rendered
- **THEN** its variants are 960 × 504 and 1200 × 630

#### Scenario: An animated GIF
- **WHEN** an animated 600 × 400 GIF with a build source URL is rendered
- **THEN** it has one animated WebP variant of 600 × 400 with every frame

#### Scenario: Optimization switched off
- **WHEN** the description has no build source URL
- **THEN** the image element's `src` is the description's public URL, it has no `srcset` and it keeps `width`, `height`, `alt`, lazy loading and the object position

#### Scenario: Eager hero image
- **WHEN** an image is rendered with `loading` `eager`
- **THEN** the element carries `loading="eager"` and `fetchpriority="high"`

#### Scenario: Unreachable original
- **WHEN** the build cannot fetch an original from its build source URL
- **THEN** the build fails with an error naming that URL

### Requirement: The adapter inlines a blurred image placeholder
When the image component renders variants of a non-GIF source and the site's configured image service transforms images locally, it SHALL inline a placeholder on the image element: a WebP of `min(64, W)` pixels wide made from the original, embedded as base64 in an SVG data URL that applies a Gaussian blur, set as the inline `background-image` with `background-size: cover`, `background-repeat: no-repeat` and a `background-position` equal to the focal-point object position or `50% 50%`. The component SHALL leave the placeholder out when that WebP has an alpha channel, for GIF sources, without a build source URL, and when the image service cannot transform locally. Within one build process each original SHALL be fetched at most once for placeholders, however many times it is rendered, and the placeholder SHALL be cached on disk keyed by the build source URL so that a later build with the same cache produces it without fetching the original. The placeholder SHALL never appear in the lightbox.

#### Scenario: An opaque photo
- **WHEN** a 3000 × 2000 JPEG is rendered
- **THEN** its image element's style holds a `data:image/svg+xml` background containing a blur filter and a `data:image/webp;base64` image, with `background-size: cover`

#### Scenario: A transparent PNG
- **WHEN** a PNG with transparent pixels is rendered
- **THEN** its image element has no background placeholder

#### Scenario: One fetch per original
- **WHEN** the same media appears in an image block and in two galleries of one build
- **THEN** its original is fetched at most once for placeholders during that build

#### Scenario: A cached placeholder
- **WHEN** a second build runs with the first build's cache directory and the media origin no longer serves the original for placeholders
- **THEN** the placeholder is still inlined

### Requirement: The adapter renders a script-free lightbox
When the image component is rendered with `lightbox` enabled and a lightbox identifier, it SHALL wrap the image element in a `button` of type `button` with part `lightbox-trigger`, `command="show-modal"`, `commandfor` naming the identifier, `aria-haspopup="dialog"` and an accessible name "Open full-size image" followed by `: ` and the effective alt text when that is not empty. It SHALL render after the button a `dialog` with that identifier, part `lightbox`, `closedby="any"` and an `aria-label` equal to the effective alt text or "Full-size image", containing a `button` of type `button` with part `lightbox-close`, `command="close"`, `commandfor` naming the identifier and the text "Close", and an image with part `lightbox-media` whose `src` is the description's public URL, with the effective alt text, the original dimensions when known, `loading="lazy"` and `decoding="async"`. The lightbox SHALL use no script. Without `lightbox`, no button and no dialog SHALL be rendered.

#### Scenario: A gallery item opens full screen
- **WHEN** an image with alt `Studio desk` is rendered with lightbox identifier `lace-lightbox-e1-gallery-1-0`
- **THEN** the trigger button is named "Open full-size image: Studio desk" and names that identifier, and the dialog holds the close button and the original public URL with lazy loading

#### Scenario: Decorative image
- **WHEN** an image with empty alt text is rendered with a lightbox
- **THEN** the trigger is named "Open full-size image" and the dialog is labelled "Full-size image"

#### Scenario: Lightbox off
- **WHEN** an image is rendered without `lightbox`
- **THEN** the output contains no `button` and no `dialog`

### Requirement: The adapter allows the media origin for remote images
The adapter SHALL export `laceImageConfig(env)` returning an Astro image configuration whose `remotePatterns` hold exactly one pattern matching the protocol, host name, port and the `/api/v1/public/media/*` path under the base path of `LACE_API_BASE_URL`. Without a valid HTTP(S) `LACE_API_BASE_URL` it SHALL return empty `remotePatterns` and SHALL NOT throw. The Astro site loader SHALL forward an `optimizeImages` option to the published-site loader.

#### Scenario: API under a base path
- **WHEN** `LACE_API_BASE_URL` is `http://127.0.0.1:8787/lace`
- **THEN** the configuration allows `http`, host `127.0.0.1`, port `8787` and path `/lace/api/v1/public/media/*`, and no other remote

#### Scenario: Missing API URL
- **WHEN** `LACE_API_BASE_URL` is not set
- **THEN** `remotePatterns` is empty

## MODIFIED Requirements

### Requirement: The adapter ships Astro-bound code only
The adapter SHALL be published as Astro component source plus a compiled server module, SHALL declare `astro` as a peer dependency within the supported range, and SHALL depend only on the render core and SDK among Lace packages. It SHALL NOT ship visual block components, client scripts, an Astro integration, or re-exports of render, SDK, or content APIs. It SHALL be part of the alpha release set at the shared release version.

#### Scenario: Packed adapter
- **WHEN** the adapter is packed for release
- **THEN** the tarball contains the server module, its declarations, and the block-list, rich-text, SEO head and image components, and no block component such as a hero or image block renderer

#### Scenario: Canonical import paths
- **WHEN** a site needs `defineBlockMap` or `BlockProps`
- **THEN** it imports them from the render core because the adapter does not re-export them
