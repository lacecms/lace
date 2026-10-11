## MODIFIED Requirements

### Requirement: The adapter ships Astro-bound code only
The adapter SHALL be published as Astro component source plus a compiled server module, SHALL declare `astro` as a peer dependency within the supported range, and SHALL depend only on the render core and SDK among Lace packages. It SHALL NOT ship visual block components, client scripts, an Astro integration, or re-exports of render, SDK, or content APIs. It SHALL be part of the alpha release set at the shared release version.

#### Scenario: Packed adapter
- **WHEN** the adapter is packed for release
- **THEN** the tarball contains the server module, its declarations, and the block-list, rich-text and SEO head components, and no block component such as a hero or image renderer

#### Scenario: Canonical import paths
- **WHEN** a site needs `defineBlockMap` or `BlockProps`
- **THEN** it imports them from the render core because the adapter does not re-export them

## ADDED Requirements

### Requirement: The adapter renders SEO head metadata
The adapter SHALL provide a head component that takes a resolved SEO value from the SDK and an optional Open Graph type (`website` by default, or `article`), and renders only head elements:

- `<title>` with the resolved title;
- `meta name="description"` when a description exists;
- `link rel="canonical"` when a canonical exists;
- `meta name="robots"` when a robots value exists;
- `og:title`, `og:type` and `og:site_name` (when a site name exists);
- `og:description` when a description exists;
- `og:url` when a canonical exists;
- `og:image`, `og:image:alt`, and `og:image:width` and `og:image:height` when known, when an image exists;
- `twitter:card` as `summary_large_image` with an image and `summary` without one.

All values SHALL be emitted as escaped attribute or text content. The component SHALL emit no script, no element outside the head vocabulary and no element for an absent value.

#### Scenario: Complete metadata
- **WHEN** the component renders a resolved value with a title, description, canonical, a 1200×630 image with alt text, a site name and type `article`
- **THEN** the output contains the title, description, canonical, `og:title`, `og:description`, `og:url`, `og:image`, `og:image:width` `1200`, `og:image:height` `630`, `og:image:alt`, `og:site_name`, `og:type` `article` and `twitter:card` `summary_large_image`, and no robots tag

#### Scenario: Minimal metadata
- **WHEN** the resolved value holds only a title
- **THEN** the output contains `<title>`, `og:title`, `og:type` `website` and `twitter:card` `summary`, and no description, canonical, robots, `og:url`, `og:image` or `og:site_name` element

#### Scenario: Excluded page
- **WHEN** the resolved value carries robots `noindex, follow`
- **THEN** the output contains `meta name="robots" content="noindex, follow"`

#### Scenario: Markup in values is escaped
- **WHEN** the resolved title is `<script>alert(1)</script> & co`
- **THEN** the output contains the escaped text and no script element

### Requirement: The adapter provides sitemap and robots responses
The adapter's server module SHALL provide a sitemap response helper and a robots response helper for user-owned Astro endpoints. The sitemap helper SHALL take the site view and the SDK sitemap options and return a `200` response with `application/xml; charset=utf-8` and the SDK sitemap text. When the site has no URL it SHALL return a `404` response without a body, so a static build writes no `sitemap.xml`, and it SHALL write one warning to the build output naming `LACE_BUILD_SITE_URL` and stating that the sitemap, canonical URLs and `og:url` are omitted. The robots helper SHALL return a `200` response with `text/plain; charset=utf-8` and the SDK robots text.

#### Scenario: Static build with a site URL
- **WHEN** a static Astro build with a configured site URL renders the sitemap and robots endpoints
- **THEN** it writes `sitemap.xml` and `robots.txt` with the SDK text

#### Scenario: Static build without a site URL
- **WHEN** a static Astro build without a site URL renders the sitemap endpoint
- **THEN** no `sitemap.xml` is written, the build succeeds, and the build output contains the warning naming `LACE_BUILD_SITE_URL`
