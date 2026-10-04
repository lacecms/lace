# astro-reference-site Specification

## Purpose

Defines the reference Astro starter site that turns one published Lace export
into static routes and safely renders the starter content configuration.

## Requirements

### Requirement: Starter models allow the complete built-in block vocabulary
The starter `home` page model and `posts` collection model SHALL permit each
of the `hero`, `richText`, `image`, `quote`, and `cta` block types. Their model
versions SHALL advance when this permitted-block structure changes. The
reference fixture SHALL exercise every built-in block in generated published
routes while retaining the fixed home path and per-slug blog route.

#### Scenario: Starter configuration is normalized
- **WHEN** the starter configuration is loaded after the expanded block lists
- **THEN** both `home` and `posts` allow all five built-in block types at their
  incremented model versions

#### Scenario: Fixture build uses every built-in block
- **WHEN** the committed export fixture is built
- **THEN** its generated home and blog output together render `hero`,
  `richText`, `image`, `quote`, and `cta`

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
The reference site SHALL render the `hero`, `richText`, `image`, `quote`, and
`cta` built-in block types for the starter models through the Astro adapter's
block-list component, its block map file, and the registry block components,
preserving their exported order and the markup emitted before the adapter
migration. It SHALL create media links only through the public-media URL helper
so the emitted URL retains the configured API base path. An unsupported block
type, a block schema-version mismatch, or block data that fails publish
validation SHALL fail the build before static output is accepted, and the
failure SHALL identify the model key, entry identifier, and block key.

#### Scenario: A starter entry contains each supported block type
- **WHEN** an exported entry supplies valid built-in blocks in a defined order
- **THEN** its static page renders each block in that order and uses the
  configured stable public-media URL for media references

#### Scenario: An exported block has no renderer
- **WHEN** an exported entry contains a block type outside the five built-ins
- **THEN** the build fails with its model key, entry identifier, and block key

#### Scenario: Migration preserves markup
- **WHEN** the committed fixture is built after the adapter migration
- **THEN** the entry scopes, block roots, part hooks, text, and media URLs equal
  the output of the pre-migration renderers

### Requirement: Published routes expose a stable entry styling scope
Every static route emitted for a published `home`, `about`, `posts`, or `notes` entry SHALL have exactly one container around that entry's ordered blocks with `data-lace-model` equal to the stable model key and `data-lace-entry` equal to the stable entry identifier. These values SHALL come from the published build export and SHALL be HTML-attribute escaped. The styling scope SHALL NOT expose draft-only content or an automatically generated HTML `id`.

#### Scenario: Style one model or one collection entry
- **WHEN** the build export contains a published `home` page and two published `posts` entries
- **THEN** each emitted route has one entry scope, the `posts` routes share `data-lace-model="posts"`, and each has its own stable `data-lace-entry` value

#### Scenario: Draft differs from publication
- **WHEN** an entry has a later draft with changed blocks or slug
- **THEN** the static route and its styling attributes continue to reflect the published entry until another publication and build

### Requirement: Every built-in block exposes type and instance styling hooks
The root HTML element of each rendered `hero`, `richText`, `image`, `quote`, and `cta` block SHALL carry `data-lace-block` equal to its registered type and `data-lace-block-key` equal to its stable key. A block key SHALL be treated as unique within its entry scope, so a selector for one instance SHALL combine the entry scope and block key. Hooks SHALL preserve the block order and semantic root elements. Unsupported block types SHALL continue to fail the build as specified by the existing reference-site renderer requirement.

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
The built-in renderers SHALL use `data-lace-part` on their own rendered semantic parts. The supported values SHALL be: `hero` — `eyebrow`, `heading`, `body`, `media`, `action`; `richText` — `content`; `image` — `media`, `caption`; `quote` — `text`, `attribution`; and `cta` — `heading`, `body`, `action`. An optional part SHALL be absent when its content is absent. The hooks SHALL NOT admit arbitrary content-supplied attributes or weaken the existing safe rich-text and URL rules.

#### Scenario: Fully populated starter blocks
- **WHEN** published blocks supply all supported fields
- **THEN** their output exposes the corresponding part hooks under the correct block root, including hooks around rich-text body or content fragments

#### Scenario: Optional content is absent
- **WHEN** a published `hero` omits its image and action or an `image` block omits its caption
- **THEN** the corresponding `media`, `action`, or `caption` part is absent, with no empty placeholder introduced solely for styling

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
