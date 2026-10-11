## MODIFIED Requirements

### Requirement: Block maps resolve every rendered block type
The render core SHALL let a site define a block map keyed by block type whose values pair a block definition with an adapter-specific component. Defining a map SHALL fail when a key differs from its definition's type, and the defined map SHALL be immutable. Resolving a block SHALL return its map entry or fail with `unknown_block_type` naming the block type, model key, entry identifier, and block key. Inherited object properties SHALL never resolve as block types. The render core SHALL also prepare an entry's blocks in their given order, resolving and parsing each into the component and the props that adapters pass to it: the block, its parsed data, its context, the media URL builder, and the image describer.

#### Scenario: A site cannot render a published block
- **WHEN** an entry contains a `gallery` block and the site's map has no `gallery` key
- **THEN** preparation fails with `unknown_block_type` naming `gallery` and the block's model, entry, and key

#### Scenario: A map key does not match its definition
- **WHEN** a site maps key `banner` to the built-in hero definition
- **THEN** defining the map fails before any block renders

#### Scenario: An entry's blocks are prepared
- **WHEN** an entry with hero, quote, and call-to-action blocks is prepared with a map covering all three
- **THEN** three component-and-props pairs are returned in block order, each with parsed data, the block's context, the media URL builder and the image describer

## ADDED Requirements

### Requirement: Images are described from resolved media
The render core SHALL give block components an image describer that takes a media identifier and an optional usage alt text and returns an image description with `src`, `alt`, and, when known, `width`, `height`, `objectPosition` and `caption`. When the entry provides resolved media, the description SHALL use the resolved item's URL, dimensions and caption, the effective alt text (non-blank usage alt, then the media alt text, then an empty string), and an `objectPosition` of `X% Y%` derived from the focal point with at most two decimal places, omitted when the item has no focal point. When the entry provides resolved media but the identifier is not among them, describing SHALL fail with `missing_media` naming the media identifier, model key, entry identifier, and block key. When the entry provides no resolved media, the description SHALL use the media URL builder and the usage alt text or an empty string, without dimensions. Describing SHALL never fetch media or read image bytes.

#### Scenario: A described image with a focal point
- **WHEN** a block describes media of 1600 × 900 pixels with alt text `Office` and focal point `{x: 0.25, y: 0.4}` without usage alt text
- **THEN** the description has the resolved URL, alt `Office`, width 1600, height 900 and object position `25% 40%`

#### Scenario: Usage alt text wins
- **WHEN** a block describes the same media with usage alt text `Team at work`
- **THEN** the description's alt text is `Team at work`

#### Scenario: Referenced media is missing
- **WHEN** an entry with resolved media renders a block whose media identifier is not resolved
- **THEN** rendering fails with `missing_media` naming the identifier, model, entry, and block key
