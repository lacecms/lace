## MODIFIED Requirements

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

## ADDED Requirements

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
