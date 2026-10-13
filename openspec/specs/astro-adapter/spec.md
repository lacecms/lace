# astro-adapter Specification

## Purpose
Defines the `@lacecms/astro` adapter package that connects Astro sites to the framework-neutral published-site loader and render core while leaving all visual block markup to user-owned source.

## Requirements

### Requirement: Astro loader glue maps the site environment to the published-site loader
The adapter SHALL provide a server-only loader factory that accepts an environment record (defaulting to the process environment when omitted), a development flag, an optional fetch implementation, and optional per-code hints, and SHALL return a published-site loader with the published-site loader's configuration, consistency, and error behavior. The development flag SHALL enable ETag revalidation on every call; without it the loader SHALL read one export per loader. The factory SHALL NOT read `import.meta.env` itself, and evaluating the adapter's server module in a browser SHALL fail before any loader is created. The build token SHALL never be emitted into static output or a client bundle.

#### Scenario: Static build
- **WHEN** a site passes its environment without the development flag and several routes call the loader during one build
- **THEN** exactly one authenticated export read is performed and every route receives the same published-site view

#### Scenario: Astro development
- **WHEN** the development flag is true and the loader is called again after a publication
- **THEN** it sends a conditional request with the last entity tag, reuses the view on not-modified, and returns the new publication otherwise

#### Scenario: Hints name the project's commands
- **WHEN** the site supplies a hint for `rejected_token` and the API rejects the token
- **THEN** the failure carries the loader's code and message followed by the hint, without the token value

#### Scenario: Browser evaluation
- **WHEN** the adapter's server module is evaluated where a browser `window` or `document` exists
- **THEN** evaluation fails with a server-only diagnostic

### Requirement: Block lists render through the site's block map
The adapter SHALL provide a block-list component that takes a published entry, a block map, and a media-URL builder, resolves and parses every block of the entry in order with the render core, and renders each mapped component with the block, its parsed data, its parsed settings, its anchor and class name when set, its block context, the media-URL builder, and the render core's image describer bound to the entry's resolved media as props. It SHALL render no hidden block. It SHALL add no wrapper markup of its own and SHALL place no anchor or class itself; block components place them on their own root element. A block whose type is absent from the map, whose schema version differs from its definition, whose data fails publish validation, or whose envelope is invalid SHALL fail rendering with the render core's coded error naming the model, entry, block key, and, when applicable, the field path.

#### Scenario: Ordered blocks
- **WHEN** an entry has `hero`, `richText`, and `cta` blocks in that order and the map contains all three
- **THEN** the output is exactly the three mapped components' output in that order, each receiving parsed data with definition defaults applied

#### Scenario: Unknown block type
- **WHEN** an entry contains a block type the map does not contain
- **THEN** rendering fails with code `unknown_block_type` and the model, entry, and block key

#### Scenario: Invalid block data
- **WHEN** a block's data violates its definition, such as an unsafe URL in a URL field or an unsafe link in a rich-text field
- **THEN** rendering fails with a render error naming the field path and no partial block markup is accepted

#### Scenario: A component describes an image
- **WHEN** a published-site entry is rendered and a block component calls the image describer for media in the export
- **THEN** it receives the resolved URL, effective alt text, dimensions and focal-point object position

#### Scenario: A component receives the envelope
- **WHEN** an entry's block has anchor `pricing`, class name `wide` and a declared setting, and its component renders those props
- **THEN** the output contains the anchor, the class name and the setting value with defaults applied, and no adapter-added wrapper element

#### Scenario: A hidden block is not rendered
- **WHEN** an entry passed to the block list contains a hidden block between two visible ones
- **THEN** the output contains only the two visible blocks' markup

### Requirement: Rich text renders only the validated element description
The adapter SHALL provide a rich-text component that validates its `document` with the render core's rich-text description and renders only the described allowlisted elements, safe attributes, and escaped text, preserving node and mark order and nesting. It SHALL never render raw HTML. It SHALL accept optional override components keyed by originating node or mark name; an override SHALL receive only the validated element description and its already-rendered children, and nodes or marks without an override SHALL render with their described tag. An optional block context SHALL be included in rich-text failures.

#### Scenario: Supported formatting
- **WHEN** a document contains headings, paragraphs, lists, a blockquote, a hard break, and bold, italic, strike, code, and link marks
- **THEN** the output contains the corresponding structural elements with link `href` values that passed the shared URL check and no serialized rich-text JSON

#### Scenario: Unsafe document
- **WHEN** a document contains an unsupported node, mark, or attribute, invalid nesting, or a link such as `javascript:alert(1)` or `https:example.com`
- **THEN** rendering fails with `invalid_rich_text` and no markup derived from the unsafe input is emitted

#### Scenario: Link override
- **WHEN** a site passes an override for `link`
- **THEN** every link renders through the override with the validated `href` in the element description and its rendered children, and other nodes and marks render unchanged

### Requirement: The adapter ships Astro-bound code only
The adapter SHALL be published as Astro component source plus a compiled server module, SHALL declare `astro` as a peer dependency within the supported range, and SHALL depend only on the render core and SDK among Lace packages. It SHALL NOT ship visual block components, client scripts, an Astro integration, or re-exports of render, SDK, or content APIs. It SHALL be part of the alpha release set at the shared release version.

#### Scenario: Packed adapter
- **WHEN** the adapter is packed for release
- **THEN** the tarball contains the server module, its declarations, and the block-list, rich-text and SEO head components, and no block component such as a hero or image renderer

#### Scenario: Canonical import paths
- **WHEN** a site needs `defineBlockMap` or `BlockProps`
- **THEN** it imports them from the render core because the adapter does not re-export them

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

### Requirement: Block lists render a published global's blocks
The block-list component SHALL accept a published global from the
published-site view as its entry, exactly as it accepts a published page or
collection entry, so a layout can render site-wide blocks through the site's
block map without an additional CMS request. Global blocks SHALL render in
their stored order with the same props, hidden-block rule, image describer
over the export's resolved media, and coded render errors, which SHALL name
the global's model key and entry identifier.

#### Scenario: A layout renders a navigation global
- **WHEN** a layout passes `site.global("navigation")` with two visible
  navigation blocks and one hidden block to the block list
- **THEN** the output is the two visible blocks' component output in order

#### Scenario: A global block fails validation
- **WHEN** a published global contains a block whose type the map does not
  contain
- **THEN** rendering fails with `unknown_block_type`, the global's model key,
  its entry identifier and the block key
