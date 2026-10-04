## Purpose

Defines the framework-neutral render core that every Lace site adapter shares: block data parsing against block definitions, block-map resolution, block component props, and a safe rich-text element description built on the CMS validation.

## ADDED Requirements

### Requirement: Block parsing reuses CMS block validation
The render core SHALL parse a block's data against a block definition using the content package's block validation in publish mode, applying the definition's defaults, and SHALL return the typed data values. It SHALL work identically for built-in blocks and user-defined blocks. It SHALL fail with `unknown_block_type` when the block's type differs from the definition's type, with `block_version_mismatch` when the block's schema version differs from the definition's version, and with `invalid_block_data` when validation fails. It SHALL NOT migrate block data. Every failure SHALL name the model key, entry identifier, block key, and, for data failures, the field path, and SHALL keep the validation failure as its cause.

#### Scenario: A built-in block parses
- **WHEN** a published hero block with a heading, rich-text body, image, and action is parsed with the built-in hero definition
- **THEN** the typed values are returned with the rich text already validated

#### Scenario: A user-defined block applies defaults
- **WHEN** a block of a user-defined type omits a field that the definition's default supplies
- **THEN** the returned values contain the default

#### Scenario: Required data is missing
- **WHEN** a hero block lacks its required heading
- **THEN** parsing fails with `invalid_block_data` naming the model, entry, block key, and the `heading` field path

#### Scenario: A block was written with an older definition version
- **WHEN** a block's schema version is 1 and the site's definition version is 2
- **THEN** parsing fails with `block_version_mismatch` naming both versions

### Requirement: Block maps resolve every rendered block type
The render core SHALL let a site define a block map keyed by block type whose values pair a block definition with an adapter-specific component. Defining a map SHALL fail when a key differs from its definition's type, and the defined map SHALL be immutable. Resolving a block SHALL return its map entry or fail with `unknown_block_type` naming the block type, model key, entry identifier, and block key. Inherited object properties SHALL never resolve as block types. The render core SHALL also prepare an entry's blocks in their given order, resolving and parsing each into the component and the props that adapters pass to it: the block, its parsed data, its context, and the media URL builder.

#### Scenario: A site cannot render a published block
- **WHEN** an entry contains a `gallery` block and the site's map has no `gallery` key
- **THEN** preparation fails with `unknown_block_type` naming `gallery` and the block's model, entry, and key

#### Scenario: A map key does not match its definition
- **WHEN** a site maps key `banner` to the built-in hero definition
- **THEN** defining the map fails before any block renders

#### Scenario: An entry's blocks are prepared
- **WHEN** an entry with hero, quote, and call-to-action blocks is prepared with a map covering all three
- **THEN** three component-and-props pairs are returned in block order, each with parsed data and the block's context

### Requirement: Rich text is described through the shared allowlist
The render core SHALL describe a rich-text document only after validating it with the content package's rich-text validation, so it accepts and rejects exactly the documents the CMS accepts and rejects, including link URLs. The description SHALL be a tree of text nodes and element nodes; each element SHALL carry a tag from a fixed allowlist (`p`, `h1`–`h3`, `ul`, `ol`, `li`, `blockquote`, `br`, `strong`, `em`, `s`, `code`, `a`), only safe attributes (a link `href` that passed URL validation), the originating node or mark name, and its children. Marks SHALL wrap text in the order listed, first mark outermost. The description SHALL contain no raw HTML string. Invalid documents SHALL fail with `invalid_rich_text` carrying the optional block context and the field path.

#### Scenario: A formatted document is described
- **WHEN** a document has a heading, a paragraph with bold and linked text, and a bullet list
- **THEN** the description contains the matching elements with the link `href` as the only attribute

#### Scenario: Drifted site-local cases are rejected
- **WHEN** a document contains a link to `https:example.com`, a `mailto:` link without `@`, or a paragraph nested inside a paragraph
- **THEN** describing it fails with `invalid_rich_text`, exactly as content validation rejects it

#### Scenario: Validation parity
- **WHEN** any document in the shared parity corpus is validated by the content package and described by the render core
- **THEN** both accept it or both reject it

### Requirement: The render core is framework-neutral
The render core SHALL depend only on the content package. It SHALL import no UI framework, Node-only API, SDK transport, or REST contract, and SHALL accept a structural block input that the public contract block shape satisfies without conversion.

#### Scenario: A contract block is rendered
- **WHEN** a published block from the public build-export contract is passed to the render core
- **THEN** it type-checks as the render core's block input without mapping
