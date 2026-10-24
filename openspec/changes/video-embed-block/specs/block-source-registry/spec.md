## MODIFIED Requirements

### Requirement: The registry holds one canonical source per framework block
The repository SHALL keep block sources in a framework-keyed registry with an index listing every item. Each item SHALL declare its name, framework, block type, block definition version, item revision, required render-core and adapter package ranges, its files with source and target role, and its item dependencies. The registry SHALL contain `astro` items for the `hero`, `richText`, `image`, `quote`, `cta`, `gallery`, `navigation`, `videoEmbed` and `link` built-in blocks whose components consume parsed block props and the adapter's rich-text component and preserve every documented `data-lace-*` hook. The root element of every built-in component SHALL carry an `id` equal to the block's anchor when the block has one and SHALL add the block's class name to its `class` after the component's own classes when the block has one; without an anchor or class name the component SHALL emit no `id`; envelope omission SHALL not otherwise change markup, apart from the expressly versioned Gallery layout adoption and CE10 link-resolution adoption described below. The `image` and `hero` components SHALL render their media through the image describer: the image element SHALL always carry an `alt` attribute with the effective alt text (for `image`, the block's alt text, then the media alt text, then an empty string; for `hero`, the media alt text, then an empty string), SHALL carry `width` and `height` when the media dimensions are known, and SHALL carry an inline `object-position` style when the media has a focal point. The `image` caption SHALL be the block's caption, falling back to the media caption. Built-in components SHALL carry no `<style>` element; presentation belongs to the site's stylesheet. Only `videoEmbed` SHALL be allowed a local activation `<script>` implementing the video-embeds preview contract, with no external player SDK or framework hydration; all other built-ins SHALL carry no `<script>` element. Registry content SHALL never be imported by a package at runtime. The `@lacecms/cli` package SHALL bundle a byte-identical copy of the registry with each build, and the CLI SHALL read registry content only from that bundled copy, never over the network.

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
ignoring one trailing slash, SHALL carry `aria-current="page"`. Hrefs SHALL be safe resolved URLs from the shared link resolver. Unavailable parent/child targets SHALL render label text while retaining valid descendants and native disclosure behavior.

The `astro/videoEmbed` registry item SHALL ship a site-owned component consuming
parsed block props and the pure embed description, plus a structural stylesheet
companion reserving the responsive player area. It SHALL preserve block anchor,
class name, `data-lace-block` and `data-lace-block-key` hooks and expose
`data-lace-part` values `preview`, `play`, `player`, `caption` and `source` on
applicable elements. Preview media SHALL use the image describer and existing
Astro image component. It SHALL implement the video-embeds activation and source
fallback contract. Installation and update SHALL use existing manifest, lock,
conflict protection and `.new` recovery behavior for all item files.

The `astro/link` item SHALL provide a site-owned component preserving anchor,
class and root block hooks, with `data-lace-part=link` for a resolved anchor and
`data-lace-part=label` for unresolved plain text. Its root SHALL have class `link`
and `data-lace-appearance` equal to the selected appearance. An unavailable label
SHALL NOT have active button styling, role button/link, tabindex or click action.
Resolved anchors SHALL use the authored label and safe href; `newTab` SHALL emit
`target=_blank` and `rel="noopener noreferrer"` only when true. Presentation
SHALL live in the site's stylesheet, without new scripts or inline style blocks.
Image, gallery, navigation, Hero and CTA registry sources SHALL call the shared
resolver before writing URL-field hrefs, following internal-url-links fallback
rules; accessible image labels SHALL use resolved hrefs instead of tokens.
Updated items SHALL declare compatible package ranges and advance item revisions
without changing existing block schema versions solely for resolver adoption.
Install/update SHALL retain hash guards, locks and `.new` recovery.

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
  for Gallery's declared layout adoption and the explicit CE10 link-resolution adoption

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

#### Scenario: Embed install and conflict handling
- **WHEN** the embed item is installed or updated with a locally modified component or stylesheet
- **THEN** ordinary installation succeeds for clean targets and conflicts preserve the active component, stylesheet, map and lock according to the existing CLI contract

#### Scenario: Unavailable link and image
- **WHEN** a Link target and an image target are absent from a valid export
- **THEN** Link emits plain label text, the image emits no anchor and retains enabled lightbox behavior, and neither emits an entry-token href

#### Scenario: Link opens a new tab safely
- **WHEN** a resolved Link has `newTab=true`
- **THEN** it is an anchor with the safe href, `_blank` target and `noopener noreferrer`, while newTab=false omits both attributes
