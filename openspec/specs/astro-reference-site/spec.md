# astro-reference-site Specification

## Purpose

Defines the reference Astro starter site that turns one published Lace export
into static routes and safely renders the starter content configuration.

## Requirements

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

### Requirement: Reference site derives all starter routes from one published export
The reference site SHALL build the starter home route and every published post
route from one validated Lace build export read through the packaged
published-site loader. In live mode it SHALL perform one authenticated
build-export read for the complete build and SHALL derive route parameters and
entry data from the loader's published view by CMS-resolved path, model, and
slug; it SHALL NOT issue page, collection, path, or per-entry requests and SHALL
NOT keep a local copy of loader, export-type, or route-derivation logic. In
fixture mode it SHALL read the committed export fixture through the same loader
and SHALL make no CMS request. Only entries in the build export SHALL be
eligible for rendered output.

#### Scenario: Live build receives a published export
- **WHEN** a live build is configured with a valid API base URL and build token
- **THEN** it performs one authenticated build-export read and statically emits
  the home route and one blog route for each exported `posts` entry

#### Scenario: Fixture build runs without CMS access
- **WHEN** the fixture build selects the committed export fixture and has no
  reachable CMS endpoint
- **THEN** it completes using that fixture alone and makes no network request

#### Scenario: A draft-only value exists outside the export
- **WHEN** a CMS draft contains a route or content value that is absent from the
  supplied build export
- **THEN** the generated site contains neither that route nor that value

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

### Requirement: Published routes expose a stable entry styling scope
Every static route emitted for a published `home`, `about`, `posts`, or `notes` entry SHALL have exactly one container around that entry's ordered blocks with `data-lace-model` equal to the stable model key and `data-lace-entry` equal to the stable entry identifier. These values SHALL come from the published build export and SHALL be HTML-attribute escaped. The styling scope SHALL NOT expose draft-only content or an automatically generated HTML `id`.

#### Scenario: Style one model or one collection entry
- **WHEN** the build export contains a published `home` page and two published `posts` entries
- **THEN** each emitted route has one entry scope, the `posts` routes share `data-lace-model="posts"`, and each has its own stable `data-lace-entry` value

#### Scenario: Draft differs from publication
- **WHEN** an entry has a later draft with changed blocks or slug
- **THEN** the static route and its styling attributes continue to reflect the published entry until another publication and build

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

### Requirement: Site owners can use the styling hooks from site-owned CSS
The reference site SHALL document its public `data-lace-*` selector contract and demonstrate selectors for all blocks of one type, all blocks of that type in one model, and one block in one entry. The example SHALL work from a site-owned stylesheet without modifying the block renderer or CMS data. The documentation SHALL identify HTML tag names and existing incidental classes as non-contractual styling details.

#### Scenario: Site owner changes CSS only
- **WHEN** a site owner edits the documented global stylesheet using the supported selectors and rebuilds the site
- **THEN** the static output can style the selected scope without changing block data, REST responses, or renderer source

### Requirement: Reference site renders rich text through an allowlist
The reference site SHALL render rich text through the Astro adapter's rich-text
component, which uses the shared safe Tiptap subset of `@lacecms/content`:
`doc`, `paragraph`, `text`, `heading`, `bulletList`, `orderedList`,
`listItem`, `blockquote`, and `hardBreak` nodes; and `bold`, `italic`,
`strike`, `code`, and `link` marks. It SHALL keep no site-local allowlist or URL
check. It SHALL not inject raw rich-text JSON or HTML. Unsupported nodes, marks,
attributes, invalid nesting, or unsafe link values SHALL fail the build and
SHALL not be emitted as executable or raw HTML content.

#### Scenario: Safe formatted rich text is exported
- **WHEN** a block contains an allowlisted rich-text document with supported
  formatting and links
- **THEN** the generated page contains the corresponding structural HTML and
  no serialized rich-text JSON

#### Scenario: Unsafe rich text reaches the renderer
- **WHEN** rich-text input contains an unsupported node, mark, attribute, or
  unsafe link value, including values the former site-local copy accepted such
  as `https:example.com`
- **THEN** the build fails and the generated output contains no executable
  markup or unsafe URL derived from that input

### Requirement: Live local site failures provide actionable diagnostics
Live development SHALL report a clear corrective action when the build token is missing or rejected, the configured API cannot be reached, or the published export lacks the starter home page. Loader failures SHALL carry the published-site loader's stable codes with hints naming the reference workspace's commands. Diagnostics and site output SHALL not reveal the plaintext build token. Fixture mode SHALL continue to build without an API request.

#### Scenario: Live mode has no token
- **WHEN** the site starts in live mode without a build token
- **THEN** its local error identifies the missing configuration and how to create and provide a token

#### Scenario: The API rejects the token
- **WHEN** the build-export endpoint rejects a missing, invalid, expired, or revoked build token
- **THEN** the local error identifies credential setup or replacement as the corrective action without echoing the credential

#### Scenario: The API is unavailable
- **WHEN** the site cannot reach the configured API while reading the build export
- **THEN** the local error identifies the API endpoint and the local stack as the items to check

#### Scenario: The API recovers after an initial failure
- **WHEN** the first live export read fails before the local API is ready and a later read succeeds
- **THEN** the site retries the export instead of retaining the failed result

#### Scenario: No home page is published
- **WHEN** an otherwise valid published export contains no published entry at `/`
- **THEN** the local error directs the contributor to synchronize and publish the home page

### Requirement: Reference site serves additional code-owned published routes
The reference site SHALL provide an `about` page at `/about` and one `/notes/:slug` route per published `notes` entry. These routes SHALL use the existing ordered block renderer and SHALL derive content from the same validated build export used by the home and blog routes. A route SHALL NOT be emitted solely because its model or draft exists. The CMS SHALL NOT create or select Astro route files.

#### Scenario: Additional page and collection are published
- **WHEN** the build export contains a published `about` entry at `/about` and published `notes` entries with canonical paths
- **THEN** the static site emits `/about` and each corresponding `/notes/:slug` page with its published title and blocks

#### Scenario: Model or entry exists only as a draft
- **WHEN** the `about` page or a `notes` entry has no published snapshot
- **THEN** the corresponding route is absent from the generated site

#### Scenario: A later draft differs from publication
- **WHEN** a previously published entry has a subsequently saved draft with different content or slug
- **THEN** the generated route and HTML retain the current published path and content until the entry is published again

#### Scenario: Additional route has an unsupported block
- **WHEN** a published `about` or `notes` entry contains a block without a site renderer
- **THEN** the build fails with its model key, entry identifier, and block key

### Requirement: Reference site is the engine playground, not the shipped template
`apps/site` SHALL be the engine's development playground and integration fixture: it MAY carry additional models and routes, custom blocks, edge-case content, the published-export fixture, fixture mode, and build tests, and nothing from it SHALL be copied into generated projects. It SHALL consume the same packages as the generated starter and SHALL hold its registry blocks, block map file, and `lace.site.json` exactly as the block-source registry defines them.

#### Scenario: Generated project contents
- **WHEN** a project is generated
- **THEN** its site contains no reference-site route, fixture, or test file, and its block sources are byte-identical to those of `apps/site`

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

### Requirement: Reference site emits SEO metadata, a sitemap and robots
The reference configuration SHALL enable SEO on `home`, `about`, `posts` and
`notes`, with `notes` mapping its `summary` field as the description fallback.
Every reference-site route SHALL render its head metadata through the
adapter's SEO head component from `site.seo(entry)`, with `og:type` `article`
for posts and notes and `website` otherwise. The site SHALL provide
user-owned `sitemap.xml` and `robots.txt` endpoints built with the adapter's
helpers. The fixture data mode SHALL pass `LACE_BUILD_SITE_URL` and
`LACE_SITE_INDEXING` from the environment to the loader. The committed export
fixture SHALL contain the `seo` section, stored SEO values on at least one
entry, including one entry with `noindex`, and a published defaults global
with every mapped value.

#### Scenario: Fixture build with a site URL
- **WHEN** the fixture is built with `LACE_BUILD_SITE_URL=https://site.example/`
- **THEN** every route has a templated or stored title and Open Graph tags
  with the resolved image; every route without a stored canonical URL has a
  canonical URL under `https://site.example/`, while the entry with a stored
  canonical URL on another origin keeps it and is absent from `sitemap.xml`;
  the `noindex` entry has `noindex, follow` and is absent from `sitemap.xml`;
  and `robots.txt` names `https://site.example/sitemap.xml`

#### Scenario: Fixture build without a site URL and with indexing off
- **WHEN** the fixture is built without `LACE_BUILD_SITE_URL` and with
  `LACE_SITE_INDEXING=off`
- **THEN** only the entry with a stored canonical URL has a canonical link and
  `og:url`, every route has
  `noindex, nofollow`, no `sitemap.xml` is written, `robots.txt` disallows
  everything, and the build succeeds

### Requirement: Reference site renders block anchors and classes
The reference site's committed fixture export SHALL include published blocks
with an anchor, with a class name, and with both, and an in-page link whose
target is the `#` anchor of a block on the same page. The fixture build SHALL
render each anchor as the `id` of its block's root element, add each class
name to that root's `class`, and keep the link's `href` so that it resolves to
the anchored block on the emitted page. Blocks without an anchor or class name
SHALL keep the markup the site emitted before block envelopes. Every anchor
SHALL be unique within its page.

#### Scenario: An in-page anchor link
- **WHEN** the fixture's home hero links to `#get-started` and the home call
  to action has anchor `get-started` and class name `cta--highlight`
- **THEN** the built home page contains a link with `href="#get-started"` and
  exactly one element with `id="get-started"`, the call to action's root,
  whose `class` is `cta cta--highlight`

#### Scenario: A class name without an anchor
- **WHEN** a post's image block has class name `full-bleed` and no anchor
- **THEN** the built post's image root carries `class="full-bleed"` and no
  `id`

#### Scenario: Blocks without an envelope
- **WHEN** the about page and the note are built from blocks without anchors
  or class names
- **THEN** their block roots carry no `id` and the same classes as before

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

### Requirement: Reference site renders optimized images and lightboxes
The reference site SHALL configure Astro remote images with the adapter's
media allowance. In fixture mode with an explicitly configured API base URL it
SHALL keep image optimization on, so a fixture build against a served media
origin produces WebP variants, placeholders and lightboxes; in fixture mode
without an explicit API base URL it SHALL switch optimization off so the
default fixture build needs no media origin. The committed fixture SHALL hold
an `image` block with the lightbox on, a `gallery` block with the lightbox on
whose items include one with a `link`, an `image` block with the default
setting and a `link`, both at block version 4. The reference stylesheet SHALL
style the lightbox trigger, the dialog, its backdrop and close button, and the
image link's focus ring.

#### Scenario: Fixture build against a served media origin
- **WHEN** the fixture build runs with an API base URL whose public media
  path serves the fixture images
- **THEN** every block image has WebP variants under `/_astro/`, opaque
  images carry a placeholder, the lightbox-enabled blocks render their
  dialogs with the original public URLs, the default-setting image has no
  dialog, and the linked image and the linked gallery item render anchors to
  their links without dialogs

#### Scenario: Default fixture build without a media origin
- **WHEN** the fixture build runs without an API base URL
- **THEN** it succeeds without network access and every image keeps its
  public media URL without `srcset`

The maintained site SHALL load Gallery's installed neutral structural stylesheet
and keep its 1rem gallery spacing and 4:3 image crop in site-owned theme CSS.
Competing unlayered rules that force every Gallery into the old grid SHALL be
removed. The default `grid`/`auto` layout SHALL retain the reference appearance,
while all other modes and presets SHALL remain selectable and CSS-overridable.

#### Scenario: Layout adoption preserves the default theme
- **WHEN** the updated fixture with Gallery version 4 and default layout settings
  is rendered
- **THEN** it retains the existing gallery image proportions, spacing, caption
  and link/lightbox behavior while exposing the shared layout hooks

#### Scenario: Site theme does not force grid for flex
- **WHEN** a Gallery fixture chooses horizontal flex and then vertical flex
- **THEN** its computed display and direction follow its settings, and the
  reference theme does not override them back to the former grid

### Requirement: Maintained sites exercise stable links and the standalone Link block
The reference and generated starter SHALL register/install version 1 `link`
and allow it on their routable starter models, advancing model/template versions
where existing ownership rules require it. Site-owned layouts and components
SHALL resolve ordinary URL fields through the shared helper, including global
navigation and model-level nested URL examples. Fixtures SHALL exercise manual
URLs, internal links, both Link appearances, slug change, hidden references,
confirmed target removal and recovery. Builds SHALL use one complete export
traversal and no per-link requests. Existing videoEmbed, image optimization,
lightbox, envelope, source ownership and CSS hook behavior SHALL be retained.

#### Scenario: Packed generated starter
- **WHEN** a packed fresh starter is synchronized, populated and built from a format 2 export
- **THEN** image, gallery, navigation, Hero/CTA and both Link appearances use resolved paths, and no href contains `entry:`

#### Scenario: Target disappears and returns
- **WHEN** a fixture removes then restores a target under the same ID and a new path
- **THEN** its builds first preserve non-navigating content and diagnostics, then restore links, without changing source tokens
