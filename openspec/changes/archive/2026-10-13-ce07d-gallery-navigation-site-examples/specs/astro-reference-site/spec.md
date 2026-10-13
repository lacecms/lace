## MODIFIED Requirements

### Requirement: Starter models allow the complete built-in block vocabulary
The reference configuration's `home` and `about` page models and `posts` and
`notes` collection models SHALL permit each of the `hero`, `richText`,
`image`, `quote`, `cta`, `gallery` and `navigation` block types and SHALL
register all seven built-in definitions. Their model versions SHALL advance
when this permitted-block structure changes (`home` 5, `about` 4, `posts` 5,
`notes` 4). The reference fixture SHALL exercise every built-in block in
generated published routes while retaining the fixed home path and per-slug
blog route.

#### Scenario: Starter configuration is normalized
- **WHEN** the reference configuration is loaded after the expanded block lists
- **THEN** `home`, `about`, `posts` and `notes` allow all seven built-in block
  types at their incremented model versions

#### Scenario: Fixture build uses every built-in block
- **WHEN** the committed export fixture is built
- **THEN** its generated routes together render `hero`, `richText`, `image`,
  `quote`, `cta`, `gallery` and `navigation` inside entry content

### Requirement: Reference site renders the starter blocks deterministically
The reference site SHALL render the built-in block types for the starter
models through the Astro adapter's
block-list component, its block map file, and the registry block components,
preserving their exported order and the entry scopes, block roots, part hooks
and text emitted before the adapter migration. Its committed fixture export
SHALL use the public entry shape with a resolved media dictionary. It SHALL
create media links only through the published-site view so the emitted URL
retains the configured public base path, and image elements SHALL carry the
effective alt text, the media dimensions and, for media with a focal point, the
focal-point `object-position`. An unsupported block type, a block
schema-version mismatch, block data that fails publish validation, or a block
media reference missing from the media dictionary SHALL fail the build before
static output is accepted, and the failure SHALL identify the model key, entry
identifier, and block key.

#### Scenario: A starter entry contains each supported block type
- **WHEN** an exported entry supplies valid built-in blocks in a defined order
- **THEN** its static page renders each block in that order and uses the
  configured stable public-media URL for media references

#### Scenario: An exported block has no renderer
- **WHEN** an exported entry contains a block type outside the built-ins
- **THEN** the build fails with its model key, entry identifier, and block key

#### Scenario: Migration preserves markup
- **WHEN** the committed fixture is built after the adapter migration
- **THEN** the entry scopes, block roots, part hooks, text, and media URLs of
  the blocks that existed before the adapter migration equal the output of
  the pre-migration renderers

#### Scenario: Resolved media renders its description
- **WHEN** the fixture export's media dictionary gives the hero media alt text,
  dimensions and a focal point, and a post's image block overrides the alt text
- **THEN** the hero image carries the media alt text, `width`, `height` and the
  `object-position` style, and the post image carries the block's alt text

### Requirement: Reference site renders site settings from a global
The reference configuration SHALL declare a `settings` global labelled "Site
settings" with a required text field `siteName` and optional fields
`tagline` (text), `titleTemplate` (text), `description` (textarea) and `image`
(media), and SHALL declare `seoDefaults` on it mapping `siteName`,
`titleTemplate`, `description` and `image`. Every reference-site route SHALL render a site header from the
published `settings` global read through the packaged published-site view of
the same build export, with no additional CMS request. The header SHALL show
the published `siteName`, and the published `tagline` only when it is a
non-empty string. When the global is not published, or a value is missing or
not a non-empty string, the header SHALL fall back to static values defined in
site source. Site navigation SHALL follow the navigation global requirement.
The committed export fixture SHALL contain a published `settings` global.

#### Scenario: Fixture build with a published global
- **WHEN** the committed export fixture with a published `settings` global is
  built
- **THEN** every emitted route shows the fixture's site name and tagline in its
  site header

#### Scenario: Live build without a published global
- **WHEN** a live build reads an export that has no `globals` entry for
  `settings`
- **THEN** the build succeeds with one export read and every route shows the
  static fallback site name and no unpublished value

#### Scenario: A draft-only setting exists
- **WHEN** the CMS draft of `settings` has a site name that was never
  published
- **THEN** the generated site does not contain that draft value

### Requirement: Every built-in block exposes type and instance styling hooks
The root HTML element of each rendered built-in block (`hero`, `richText`, `image`, `quote`, `cta`, `gallery` and `navigation`) SHALL carry `data-lace-block` equal to its registered type and `data-lace-block-key` equal to its stable key. A block key SHALL be treated as unique within its entry scope, so a selector for one instance SHALL combine the entry scope and block key; blocks of a global rendered in the layout SHALL be selected through their block type and key outside the entry scope. Hooks SHALL preserve the block order and semantic root elements. Unsupported block types SHALL continue to fail the build as specified by the existing reference-site renderer requirement.

#### Scenario: Reuse a block type across routes
- **WHEN** two published routes contain `hero` blocks with different keys
- **THEN** both roots expose `data-lace-block="hero"` and each exposes its own `data-lace-block-key`

#### Scenario: Same key appears in separate entries
- **WHEN** two published entries contain a block with the same stable key
- **THEN** the two routes remain addressable through their distinct entry scopes without requiring document-wide uniqueness of the block key

#### Scenario: Unknown renderer
- **WHEN** a published block has no site renderer
- **THEN** the build fails with the existing model, entry, and block diagnostic rather than emitting an unstyled or partially rendered block

### Requirement: Built-in blocks expose semantic part hooks
The built-in renderers SHALL use `data-lace-part` on their own rendered semantic parts. The supported values SHALL be: `hero` — `eyebrow`, `heading`, `body`, `media`, `action`; `richText` — `content`; `image` — `media`, `caption`; `quote` — `text`, `attribution`; `cta` — `heading`, `body`, `action`; `gallery` — `title`, `items`, `item`, `media`, `caption`; and `navigation` — `list`, `item`, `link`, `label`, `submenu`, `toggle`, `children`. An optional part SHALL be absent when its content is absent. The hooks SHALL NOT admit arbitrary content-supplied attributes or weaken the existing safe rich-text and URL rules.

#### Scenario: Fully populated starter blocks
- **WHEN** published blocks supply all supported fields
- **THEN** their output exposes the corresponding part hooks under the correct block root, including hooks around rich-text body or content fragments

#### Scenario: Optional content is absent
- **WHEN** a published `hero` omits its image and action, an `image` block omits its caption, or a `gallery` omits its title
- **THEN** the corresponding `media`, `action`, `caption`, or `title` part is absent, with no empty placeholder introduced solely for styling

#### Scenario: Unsafe rich-text input
- **WHEN** a rich-text value contains an unsupported node, mark, attribute, or unsafe URL
- **THEN** the styling hooks do not cause executable markup or unsafe URL to appear in the generated page

## ADDED Requirements

### Requirement: Reference site renders site navigation from a global
The reference configuration SHALL declare a `navigation` global labelled
"Navigation" with no fields that allows only the `navigation` block. Every
reference-site route SHALL render, in its site header and outside the entry
scope, the published `navigation` global's visible blocks through the
adapter's block list and the site's block map, read from the same
published-site view as the page, with no additional CMS request. When the
global is not published, the header SHALL render a static fallback
navigation defined in site source with an accessible name and links to the
home and about pages. A published global without visible blocks SHALL render
no site navigation. The site stylesheet SHALL lay the navigation out as a
horizontal list with dropdown submenus at wide viewports and as a vertical
list with inline submenus below `48rem`, without horizontal scrolling. The
committed export fixture SHALL contain a published navigation global whose
block has a submenu.

#### Scenario: Fixture build with published navigation
- **WHEN** the committed fixture is built
- **THEN** every route's header contains the global's navigation block root
  with its links and a `details` submenu, the link to the current route
  carries `aria-current="page"`, and no fallback navigation is emitted

#### Scenario: Live build without the navigation global
- **WHEN** a live build reads an export without a `navigation` global
- **THEN** the build succeeds with one export read and every route shows the
  static fallback navigation and no navigation block root in the header

#### Scenario: A draft-only navigation change exists
- **WHEN** the CMS draft of `navigation` has a link that was never published
- **THEN** the generated site does not contain that link

### Requirement: Reference site renders galleries and local navigation
The committed export fixture SHALL contain a published gallery with a title
and at least two images covering an item alt override, the media alt
fallback, an item caption and the media caption fallback, and a published
page whose content holds a navigation block linking to `#` anchors of blocks
on the same page. The fixture build SHALL render both inside the entry scope
through the same components as the layout.

#### Scenario: Gallery in a post
- **WHEN** the fixture post with a gallery is built
- **THEN** its gallery root holds one figure per item in order with the
  effective alt text, dimensions, lazy loading and captions of the
  registry requirement

#### Scenario: Local navigation in page content
- **WHEN** the home page with an "On this page" navigation block linking to
  `#get-started` is built
- **THEN** the entry scope contains a second `nav` element named "On this
  page" whose `href="#get-started"` target exists exactly once on the page, and
  the header still contains the site navigation
