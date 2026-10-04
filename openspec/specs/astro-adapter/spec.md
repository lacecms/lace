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
The adapter SHALL provide a block-list component that takes a published entry, a block map, and a media-URL builder, resolves and parses every block of the entry in order with the render core, and renders each mapped component with the block, its parsed data, its block context, and the media-URL builder as props. It SHALL add no wrapper markup of its own. A block whose type is absent from the map, whose schema version differs from its definition, or whose data fails publish validation SHALL fail rendering with the render core's coded error naming the model, entry, block key, and, when applicable, the field path.

#### Scenario: Ordered blocks
- **WHEN** an entry has `hero`, `richText`, and `cta` blocks in that order and the map contains all three
- **THEN** the output is exactly the three mapped components' output in that order, each receiving parsed data with definition defaults applied

#### Scenario: Unknown block type
- **WHEN** an entry contains a block type the map does not contain
- **THEN** rendering fails with code `unknown_block_type` and the model, entry, and block key

#### Scenario: Invalid block data
- **WHEN** a block's data violates its definition, such as an unsafe URL in a URL field or an unsafe link in a rich-text field
- **THEN** rendering fails with a render error naming the field path and no partial block markup is accepted

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
- **THEN** the tarball contains the server module, its declarations, and the block-list and rich-text components, and no block component such as a hero or image renderer

#### Scenario: Canonical import paths
- **WHEN** a site needs `defineBlockMap` or `BlockProps`
- **THEN** it imports them from the render core because the adapter does not re-export them
