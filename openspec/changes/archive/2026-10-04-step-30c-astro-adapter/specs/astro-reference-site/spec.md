## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Reference site is the engine playground, not the shipped template
`apps/site` SHALL be the engine's development playground and integration fixture: it MAY carry additional models and routes, custom blocks, edge-case content, the published-export fixture, fixture mode, and build tests, and nothing from it SHALL be copied into generated projects. It SHALL consume the same packages as the generated starter and SHALL hold its registry blocks, block map file, and `lace.site.json` exactly as the block-source registry defines them.

#### Scenario: Generated project contents
- **WHEN** a project is generated
- **THEN** its site contains no reference-site route, fixture, or test file, and its block sources are byte-identical to those of `apps/site`
