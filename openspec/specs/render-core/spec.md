# render-core Specification

## Purpose
Defines the framework-neutral render core that every Lace site adapter shares: block data parsing against block definitions, block-map resolution, block component props, and a safe rich-text element description built on the CMS validation.

## Requirements

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
The render core SHALL let a site define a block map keyed by block type whose values pair a block definition with an adapter-specific component. Defining a map SHALL fail when a key differs from its definition's type, and the defined map SHALL be immutable. Resolving a block SHALL return its map entry or fail with `unknown_block_type` naming the block type, model key, entry identifier, and block key. Inherited object properties SHALL never resolve as block types. The render core SHALL also prepare an entry's blocks in their given order, resolving and parsing each into the component and the props that adapters pass to it: the block, its parsed data, its parsed settings, its anchor and class name when set, its context, the media URL builder, and the image describer. Preparation SHALL leave out every block marked hidden before resolving or parsing it, so a hidden block never renders and never fails preparation.

#### Scenario: A site cannot render a published block
- **WHEN** an entry contains a `gallery` block and the site's map has no `gallery` key
- **THEN** preparation fails with `unknown_block_type` naming `gallery` and the block's model, entry, and key

#### Scenario: A map key does not match its definition
- **WHEN** a site maps key `banner` to the built-in hero definition
- **THEN** defining the map fails before any block renders

#### Scenario: An entry's blocks are prepared
- **WHEN** an entry with hero, quote, and call-to-action blocks is prepared with a map covering all three
- **THEN** three component-and-props pairs are returned in block order, each with parsed data, parsed settings, the block's context, the media URL builder and the image describer

#### Scenario: A hidden block is skipped
- **WHEN** an entry has a visible hero, a hidden quote and a visible call to action
- **THEN** preparation returns only the hero and the call to action, in that order

#### Scenario: A hidden block the site cannot render
- **WHEN** a hidden block has a type missing from the map, an older schema version or invalid data
- **THEN** preparation succeeds without it

### Requirement: Rich text is described through the shared allowlist
The render core SHALL describe a rich-text document only after validating it with the content package's rich-text validation, so it accepts and rejects exactly the documents the CMS accepts and rejects, including link URLs. The description SHALL be a tree of text nodes and element nodes; each element SHALL carry a tag from a fixed allowlist (`p`, `h1`–`h4`, `ul`, `ol`, `li`, `blockquote`, `br`, `hr`, `pre`, `strong`, `em`, `s`, `code`, `a`), only safe attributes (a validated link `href`, optional `target: "_blank"` and renderer-derived `rel`), the originating node or mark name, and its children. Marks SHALL wrap text in the order listed, first mark outermost. The description SHALL contain no raw HTML string. Invalid documents SHALL fail with `invalid_rich_text` carrying the optional block context and the field path.

The description SHALL represent a horizontal rule as an empty `hr` and a plain
code block as `pre` containing `code` containing escaped-by-adapter text,
without language, styles or raw HTML. Both code elements SHALL originate from
`codeBlock`. Code text and whitespace SHALL be preserved. A link without target
or rel SHALL describe only href. Nofollow alone SHALL describe rel `nofollow`;
new-tab alone SHALL describe target `_blank` and rel `noopener noreferrer`;
both SHALL describe target `_blank` and rel `noopener noreferrer nofollow`.
The generated safety tokens SHALL NOT expand the stored-document allowlist.

#### Scenario: A formatted document is described
- **WHEN** a document has a heading, a paragraph with bold and linked text, and a bullet list
- **THEN** the description contains the matching elements with the link `href` as the only attribute

#### Scenario: Drifted site-local cases are rejected
- **WHEN** a document contains a link to `https:example.com`, a `mailto:` link without `@`, or a paragraph nested inside a paragraph
- **THEN** describing it fails with `invalid_rich_text`, exactly as content validation rejects it

#### Scenario: Validation parity
- **WHEN** any document in the shared parity corpus is validated by the content package and described by the render core
- **THEN** both accept it or both reject it

#### Scenario: All four link descriptions
- **WHEN** the four accepted combinations of new-tab and nofollow are described
- **THEN** each has exactly the attributes and deterministic rel token order specified above

#### Scenario: Plain code and rules
- **WHEN** a valid document has H4, a rule and code containing tabs, newlines and markup-like text
- **THEN** its description contains h4, empty hr and pre/code with the original text and no raw HTML

#### Scenario: Expanded validation parity
- **WHEN** expanded documents, unsupported attributes, malformed code children and unsafe URLs are validated and described
- **THEN** both paths accept or reject exactly the same inputs with path-aware errors

### Requirement: The render core is framework-neutral
The render core SHALL depend only on the content package. It SHALL import no UI framework, Node-only API, SDK transport, or REST contract, and SHALL accept a structural block input that the public contract block shape satisfies without conversion.

#### Scenario: A contract block is rendered
- **WHEN** a published block from the public build-export contract is passed to the render core
- **THEN** it type-checks as the render core's block input without mapping

### Requirement: Images are described from resolved media
The render core SHALL give block components an image describer that takes a media identifier and an optional usage alt text and returns an image description with `src`, `alt`, and, when known, `width`, `height`, `objectPosition`, `caption`, `mimeType` and `sourceUrl`. When the entry provides resolved media, the description SHALL use the resolved item's URL, dimensions, caption and media type, the item's build source URL when the item has one, the effective alt text (non-blank usage alt, then the media alt text, then an empty string), and an `objectPosition` of `X% Y%` derived from the focal point with at most two decimal places, omitted when the item has no focal point. When the entry provides resolved media but the identifier is not among them, describing SHALL fail with `missing_media` naming the media identifier, model key, entry identifier, and block key. When the entry provides no resolved media, the description SHALL use the media URL builder and the usage alt text or an empty string, without dimensions, media type or build source URL. Describing SHALL never fetch media or read image bytes.

#### Scenario: A described image with a focal point
- **WHEN** a block describes media of 1600 × 900 pixels with alt text `Office` and focal point `{x: 0.25, y: 0.4}` without usage alt text
- **THEN** the description has the resolved URL, alt `Office`, width 1600, height 900 and object position `25% 40%`

#### Scenario: Usage alt text wins
- **WHEN** a block describes the same media with usage alt text `Team at work`
- **THEN** the description's alt text is `Team at work`

#### Scenario: Referenced media is missing
- **WHEN** an entry with resolved media renders a block whose media identifier is not resolved
- **THEN** rendering fails with `missing_media` naming the identifier, model, entry, and block key

#### Scenario: Media type and build source reach the description
- **WHEN** a block describes resolved `image/jpeg` media whose resolved item has a build source URL
- **THEN** the description carries `mimeType` `image/jpeg` and that `sourceUrl`, and its `src` remains the resolved public URL

#### Scenario: Resolved media without a build source
- **WHEN** a block describes resolved media whose item has no build source URL
- **THEN** the description has no `sourceUrl`

#### Scenario: Unresolved media fallback
- **WHEN** an entry without resolved media describes a media identifier
- **THEN** the description has the media URL builder's URL and no dimensions, media type or build source URL

### Requirement: Block components receive the block envelope
The render core SHALL give each prepared block's props the block's anchor and its normalized class name when the block has them, and SHALL leave both props out otherwise. It SHALL parse the block's settings against the definition's declared settings with every declared default applied, treating missing settings as an empty record, and SHALL type the parsed settings from the definition so that every declared setting key is present; a definition without settings SHALL yield an empty record. Preparation SHALL fail with `invalid_block_envelope` when an anchor is not a valid block anchor, when a class name does not normalize to a valid block class name, or when settings fail validation (including keys the definition does not declare); the failure SHALL name the model key, entry identifier, block key and the field path (`anchor`, `className`, or `settings` followed by the setting key), and SHALL keep a validation failure as its cause.

#### Scenario: Anchor and class reach the component
- **WHEN** a visible block with anchor `pricing` and class name `wide  dark` is prepared
- **THEN** its props carry anchor `pricing` and class name `wide dark`

#### Scenario: A block without an envelope
- **WHEN** a block has no anchor, no class name and no settings
- **THEN** its props carry no anchor or class name and an empty settings record

#### Scenario: Settings defaults apply
- **WHEN** a block whose definition declares a `layout` select setting defaulting to `wide` is prepared with settings `{}`
- **THEN** its props carry settings `{layout: "wide"}`, typed so `layout` is always present

#### Scenario: An undeclared setting
- **WHEN** a block's settings contain a key its definition does not declare
- **THEN** preparation fails with `invalid_block_envelope` naming the model, entry, block key and the `settings` field path

#### Scenario: An invalid anchor
- **WHEN** a block reaching the render core has anchor `Pricing Table`
- **THEN** preparation fails with `invalid_block_envelope` naming the block and the `anchor` field path

### Requirement: Composite block parsing shares publication validation
The render core SHALL parse nested block values with the content package's
publication rules, defaults, per-list and standalone block list budget and
return nested inferred component data. Invalid descendants SHALL produce
`invalid_block_data` with the existing context/cause and exact key/index path.
Nested media SHALL use the existing image describer. Hidden blocks SHALL still
be skipped before resolution and validation. Render SHALL not migrate data or
claim to validate an unseen complete snapshot's fields or hidden blocks.

#### Scenario: Nested component data
- **WHEN** a block has a list of groups with child defaults and a literal-select child
- **THEN** parsing applies those defaults and component props retain the inferred object array and literal union

#### Scenario: Leaf failure matches the CMS
- **WHEN** a visible block has an invalid URL at links item index 1
- **THEN** CMS and render validation reject it and render reports `links`, numeric index 1 and the URL child key in its field path

#### Scenario: Hidden composites are skipped
- **WHEN** a hidden block has incomplete composite data or an unknown block type
- **THEN** preparation skips it before parsing and produces no component for it
