## MODIFIED Requirements

### Requirement: The adapter inlines a blurred image placeholder
When an optimized image description offers a build thumbnail reader, the adapter SHALL use that reader as the sole source for the placeholder. It SHALL produce a static, aspect-preserving WebP with a longest edge of at most 64 pixels and a body of at most 4 KiB without upscaling the derivative. It SHALL inline a data URL that blurs that WebP as an image background with `background-size: cover`, `background-repeat: no-repeat` and the focal-point position or `50% 50%`. The placeholder SHALL be decorative and available in the initial HTML without browser JavaScript or an HTTP request for thumbnail bytes. It SHALL never appear in the lightbox.

The adapter SHALL omit the placeholder for GIF sources, a WebP with alpha, unknown dimensions, a disabled build source, or an image service without local transforms. When a build thumbnail cannot be acquired or used, including denial, an older API, timeout, malformed data and transform failure, the adapter SHALL omit the placeholder and proceed with the normal original and variant flow. It SHALL never fetch an original for the published-media placeholder. Existing sourced descriptions that do not offer build thumbnail access, including protected draft preview, SHALL retain the existing original-based behavior for opaque non-GIF images. That behavior creates a WebP `min(64, W)` pixels wide, inlines it using an SVG data URL with Gaussian blur, and fetches each original at most once per build for placeholders, with a disk cache keyed by source URL.

The adapter SHALL reuse the result for repeat uses of the same media within a static build and share in-flight work. It SHALL revalidate a persistent cached build thumbnail placeholder against the configured API with its derivative validator before using it in a new build. A confirmed 304 SHALL reuse the cached placeholder without downloading or transforming the thumbnail again. Failure to revalidate SHALL NOT inline stale content. Temporary failures SHALL NOT become persistent negative cache entries. Only media rendered through the image component and eligible for the placeholder SHALL trigger requests.

#### Scenario: An opaque photo loads on a slow connection
- **WHEN** a built page is opened in a browser with JavaScript disabled and the responsive asset response is delayed
- **THEN** the inline blur is visible within the reserved image box before the responsive asset is delivered, and the decoded image covers the blur without shifting layout or making a thumbnail request

#### Scenario: Transparent or animated media renders
- **WHEN** an image has an alpha-bearing thumbnail or the original is a GIF
- **THEN** the component renders without a blurred background and preserves the normal responsive output, including animation for GIFs

#### Scenario: The same image appears in several blocks
- **WHEN** a static build renders the same eligible media in Hero, Image, Gallery or a video poster
- **THEN** the thumbnail is requested and transformed at most once, and each use preserves its own placement, focal position and loading attributes

#### Scenario: A subsequent build has a cached placeholder
- **WHEN** a build uses an existing placeholder cache and the authorized API confirms the derivative's ETag with 304
- **THEN** the same blur is inlined without fetching its WebP body or transforming it
- **AND** if the API subsequently reports the media is no longer eligible, the cached blur is omitted

#### Scenario: The API supports originals but the thumbnail is unavailable
- **WHEN** the API serves the published original but the thumbnail is denied, missing, times out or cannot be transformed
- **THEN** Astro emits its normal responsive image without the blur, and placeholder preparation makes no request for the original
- **AND** if the original needed for the variants also fails, the variant build error still names its source

#### Scenario: An image has no build source
- **WHEN** the build runs with optimization off
- **THEN** the component renders the public image URL and makes no thumbnail request

#### Scenario: A protected preview uses its private original
- **WHEN** a protected saved-draft build optimizes a still image from its private media origin
- **THEN** the existing original-based placeholder can be generated within that build and it makes no build thumbnail request

#### Scenario: An opaque photo
- **WHEN** a 3000 × 2000 JPEG is rendered with an available opaque build thumbnail
- **THEN** its image style holds a blurred data URL as a cover background with an embedded static WebP

#### Scenario: A transparent PNG
- **WHEN** a PNG with transparent pixels is rendered with a corresponding alpha-bearing thumbnail
- **THEN** its image element has no background placeholder

#### Scenario: One fetch per original
- **WHEN** the same standalone sourced image without a build thumbnail reader appears in an image block and in two galleries
- **THEN** its original is fetched at most once for placeholders during that build

#### Scenario: A cached placeholder
- **WHEN** a second build renders the same standalone sourced image without a build thumbnail reader and its original-based placeholder is cached
- **THEN** the placeholder is still inlined without fetching the original for it
