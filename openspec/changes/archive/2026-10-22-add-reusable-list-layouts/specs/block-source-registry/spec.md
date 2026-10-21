## MODIFIED Requirements

### Requirement: The registry holds one canonical source per framework block
The repository SHALL keep block sources in a framework-keyed registry with an index listing every item. Each item SHALL declare its name, framework, block type, block definition version, item revision, required render-core and adapter package ranges, its files with source and target role, and its item dependencies. The registry SHALL contain `astro` items for the `hero`, `richText`, `image`, `quote`, `cta`, `gallery` and `navigation` built-in blocks whose components consume parsed block props and the adapter's rich-text component and preserve every documented `data-lace-*` hook. The root element of every built-in component SHALL carry an `id` equal to the block's anchor when the block has one and SHALL add the block's class name to its `class` after the component's own classes when the block has one; without an anchor or class name the component SHALL emit no `id`; envelope omission SHALL not otherwise change markup, apart from the expressly versioned Gallery layout adoption described below. The `image` and `hero` components SHALL render their media through the image describer: the image element SHALL always carry an `alt` attribute with the effective alt text (for `image`, the block's alt text, then the media alt text, then an empty string; for `hero`, the media alt text, then an empty string), SHALL carry `width` and `height` when the media dimensions are known, and SHALL carry an inline `object-position` style when the media has a focal point. The `image` caption SHALL be the block's caption, falling back to the media caption. Built-in components SHALL carry no `<style>` or `<script>` element; presentation belongs to the site's stylesheet. Registry content SHALL never be imported by a package at runtime. The `@lacecms/cli` package SHALL bundle a byte-identical copy of the registry with each build, and the CLI SHALL read registry content only from that bundled copy, never over the network.

The `gallery` component SHALL render a `section` root with class `gallery`, a
`title` part heading only when the title is a non-empty string, and an
`items` part list holding one `item` part per image in stored order. Each item
SHALL render a figure with a `media` part image described by the image
describer from the item's media and alt override (effective alt: the item's
alt text, then the media alt text, then an empty string), with `width`,
`height` and focal-point `object-position` when known and `loading="lazy"`,
and a `caption` part only when the item caption, falling back to the media
caption, is present.

The `navigation` component SHALL render a `nav` root with class `navigation`
whose `aria-label` is the block's `name` when it is a non-empty string, and a
`list` part list with one `item` part per link in stored order. A link
without children SHALL render a `link` part anchor to its URL, or a `label`
part text element when it has no URL. A link with at least one child SHALL
render a `submenu` part `details` element whose `toggle` part `summary` shows
the link label, containing a `children` part list whose first item is a
`link` part anchor to the parent's own URL with the parent label when the
parent has a URL, followed by one `item` part with a `link` part anchor per
child. The component SHALL use no JavaScript. A `link` anchor whose URL is a
root-relative path without query or fragment equal to the current page path,
ignoring one trailing slash, SHALL carry `aria-current="page"`. Hrefs SHALL be
the stored, validated URLs.

#### Scenario: Registry index is complete
- **WHEN** the registry index is read
- **THEN** it lists exactly one `astro` item per built-in block type, each item manifest exists, its block definition version equals the built-in definition version, and every declared file exists

#### Scenario: Item manifest is inconsistent
- **WHEN** an item declares a block type other than the one its block definition version refers to, or a file it does not contain
- **THEN** registry verification fails and names the item

#### Scenario: Bundled registry matches the repository
- **WHEN** the CLI package is built
- **THEN** its bundled registry files are byte-identical to the repository `registry/` files

#### Scenario: Image block without alt text renders an empty alt attribute
- **WHEN** a site renders a version 2 `image` block whose data has media and no alt text, and the media has no alt text
- **THEN** the rendered image element has an empty `alt` attribute and the documented `data-lace-*` hooks

#### Scenario: Image block inherits the media description
- **WHEN** a site renders an `image` block without alt text or caption whose media has alt text, a caption, dimensions and a focal point
- **THEN** the image element carries the media alt text, `width`, `height` and an `object-position` style, and the caption shows the media caption

#### Scenario: Hero uses the media alt text
- **WHEN** a site renders a `hero` block whose image media has alt text
- **THEN** the hero image element carries that alt text instead of an empty one

#### Scenario: An anchored block with a class name
- **WHEN** a site renders a `cta` block with anchor `get-started` and class name `cta--highlight`
- **THEN** its root element carries `id="get-started"` and `class="cta cta--highlight"` beside its `data-lace-block` and `data-lace-block-key` hooks

#### Scenario: A component without its own class
- **WHEN** a site renders an `image` block with class name `full-bleed` and no anchor
- **THEN** its root element carries `class="full-bleed"` and no `id`

#### Scenario: A block without an envelope keeps its markup
- **WHEN** a site renders any built-in block without an anchor or class name
- **THEN** its markup equals the output of the previous item revision except
  for Gallery's declared layout attributes and stylesheet import in its layout
  adoption revision

#### Scenario: Gallery items follow the media fallbacks
- **WHEN** a site renders a gallery titled "Studio" with one item overriding
  the alt text and having no caption, whose media has a caption and a focal
  point, and one item without alt text or caption whose media has neither
- **THEN** the root is `section` with class `gallery`, the heading shows
  "Studio", the first image carries the override alt, dimensions,
  `object-position` and `loading="lazy"` with the media caption, and the
  second image carries `alt=""` and no `caption` part

#### Scenario: Gallery without a title
- **WHEN** a site renders a gallery with anchor `photos`, class name `wide`
  and no title
- **THEN** the root carries `id="photos"` and `class="gallery wide"` and has
  no `title` part

#### Scenario: Navigation with a submenu
- **WHEN** a site renders a navigation block named "Main" with a link
  "Home" to `/`, a link "Docs" to `/docs` with children "Guide" `/guide` and
  "API" `https://api.example/`, and a link "Company" without a URL whose
  child is "About" `/about`
- **THEN** the `nav` root has `aria-label="Main"`, "Home" is a `link` anchor,
  "Docs" and "Company" are `details` disclosures with their labels in the
  `summary`, the "Docs" submenu lists links "Docs" `/docs`, "Guide" and "API"
  in that order, and the "Company" submenu lists only "About"

#### Scenario: Navigation marks the current page
- **WHEN** the navigation is rendered on the page `/about/` and holds links
  to `/about`, `/about#team` and `https://site.example/about`
- **THEN** only the `/about` link carries `aria-current="page"`

#### Scenario: Navigation link without URL or children
- **WHEN** a link has a label and neither a URL nor children
- **THEN** it renders as a `label` part text element and no anchor or
  disclosure

#### Scenario: Registry item includes a structural stylesheet
- **WHEN** the Gallery registry manifest is read
- **THEN** it declares exactly one component with role `component` and its
  companion `ListLayout.css` with role `stylesheet`, whose source bytes exist
  and are included in the bundled registry

### Requirement: Built-in image components render through the adapter image component
The `image` registry item (revision 6, block version 4), the `gallery` item
(revision 4, block version 4) and the `hero` item (revision 4, block version 1)
SHALL render every media image through the adapter's image component, keeping
the image element's `media` part, effective alt text, dimensions and
focal-point object position, and adding the component's variants and
placeholder. `image` SHALL pass the sizes `(min-width: 64rem) 60rem, 100vw`,
`gallery` the sizes `(min-width: 64rem) 20rem, (min-width: 32rem) 50vw, 100vw`
for `grid` with `auto`, and the conservative sizes `100vw` for all other layout
combinations, and `hero` the sizes `(min-width: 64rem) 60rem, 100vw` with eager loading. When
the block's `lightbox` setting is `true`, `image` and each `gallery` item SHALL
enable the lightbox with the identifier `lace-lightbox-<entry id>-<block key>`
for `image` and `lace-lightbox-<entry id>-<block key>-<item index>` for each
gallery item; with the setting `false` they SHALL render no button and no
dialog. When an `image` block or a `gallery` item has a `link`, its `media`
image SHALL be wrapped in an anchor with that `href` and the part `link`,
opening in the same browsing context, and that image SHALL render no
lightbox button or dialog even when the setting is `true`; the anchor's
accessible name SHALL be the effective alt text, or the caption when the alt
text is empty, or the link URL when both are empty. Images without a `link`
SHALL keep the lightbox behavior above. `hero` SHALL never render a lightbox. The components SHALL still carry
no `<style>` or `<script>` element.

#### Scenario: Image block with the lightbox on
- **WHEN** a site renders a version 4 `image` block with key `photo` of entry
  `e1` whose settings are `{ lightbox: true }`
- **THEN** its figure holds the `lightbox-trigger` button wrapping the `media`
  image, the dialog `lace-lightbox-e1-photo` with the original public URL, and
  the caption after them

#### Scenario: Gallery with the lightbox off
- **WHEN** a site renders a version 4 `gallery` block with the default settings
- **THEN** each item's figure holds only the optimized `media` image and its
  caption, with no button or dialog

#### Scenario: Gallery items open their own dialogs
- **WHEN** a gallery with key `shots` of entry `e1` and two items has the
  lightbox on
- **THEN** the items open `lace-lightbox-e1-shots-0` and
  `lace-lightbox-e1-shots-1` respectively

#### Scenario: Linked image takes precedence over the lightbox
- **WHEN** a version 4 `image` block with `link` `/work/kitchen`, alt text
  `Kitchen` and settings `{ lightbox: true }` is rendered
- **THEN** its figure holds an anchor `href="/work/kitchen"` with part `link`
  and accessible name `Kitchen` wrapping the `media` image, and no
  `lightbox-trigger` button or dialog

#### Scenario: Gallery mixes linked and lightbox items
- **WHEN** a gallery with key `shots` of entry `e1`, the lightbox on, and two
  items of which only the second has a `link` is rendered
- **THEN** the first item opens `lace-lightbox-e1-shots-0` and the second
  item is an anchor to its link with no dialog

#### Scenario: Linked image without alt text
- **WHEN** a linked gallery item has an empty effective alt text and the
  caption `Before`
- **THEN** its anchor carries the accessible name `Before`; without a caption
  the accessible name is the link URL

#### Scenario: Hero image loads eagerly
- **WHEN** a site renders a `hero` block with an image
- **THEN** the image element carries `loading="eager"` and
  `fetchpriority="high"` and no lightbox

#### Scenario: Gallery applies the shared list contract without theming
- **WHEN** a version 4 Gallery renders any layout mode and preset
- **THEN** its existing section is marked as the layout container, its items
  list and direct items expose the shared list-layout hooks, its source imports
  `./ListLayout.css`, and it adds no inline layout styles, image aspect ratio,
  cropping or decorative styles; existing title/media/link/lightbox behavior remains

#### Scenario: Nondefault Gallery layout uses conservative image sizing
- **WHEN** Gallery uses horizontal flex or a featured-first grid
- **THEN** optimized images receive sizes `100vw` and retain the existing
  resolution, placeholder, loading and media-fallback behavior

## ADDED Requirements

### Requirement: Registry stylesheet companions are portable source files
Registry items SHALL accept exactly one `component` file and zero or more
`stylesheet` files with `.css` source and target paths, retaining safe relative
paths and case-insensitively unique targets. Unsupported roles, absent files,
multiple components, escaping paths and colliding targets across selected or
already installed items SHALL fail before writes. Stylesheets SHALL be site-owned source,
not runtime exports from a Lace package; the importing component SHALL reference
its installed companion with a matching relative import. Old one-component
items SHALL remain valid without manifest/lock schema-version changes.

#### Scenario: Existing item stays valid
- **WHEN** a registry item contains only its original component
- **THEN** it validates and installs with its existing manifest shape

#### Scenario: Reject unsafe or ambiguous companions
- **WHEN** an item has two components, a stylesheet target outside the site,
  a non-CSS stylesheet or a target shared by selected/already installed items
- **THEN** registry/installation validation rejects the item set before writes
