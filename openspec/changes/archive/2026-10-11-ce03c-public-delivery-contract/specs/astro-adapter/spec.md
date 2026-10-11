## MODIFIED Requirements

### Requirement: Block lists render through the site's block map
The adapter SHALL provide a block-list component that takes a published entry, a block map, and a media-URL builder, resolves and parses every block of the entry in order with the render core, and renders each mapped component with the block, its parsed data, its block context, the media-URL builder, and the render core's image describer bound to the entry's resolved media as props. It SHALL add no wrapper markup of its own. A block whose type is absent from the map, whose schema version differs from its definition, or whose data fails publish validation SHALL fail rendering with the render core's coded error naming the model, entry, block key, and, when applicable, the field path.

#### Scenario: Ordered blocks
- **WHEN** an entry has `hero`, `richText`, and `cta` blocks in that order and the map contains all three
- **THEN** the output is exactly the three mapped components' output in that order, each receiving parsed data with definition defaults applied

#### Scenario: Unknown block type
- **WHEN** an entry contains a block type the map does not contain
- **THEN** rendering fails with code `unknown_block_type` and the model, entry, and block key

#### Scenario: Invalid block data
- **WHEN** a block's data violates its definition, such as an unsafe URL in a URL field or an unsafe link in a rich-text field
- **THEN** rendering fails with a render error naming the field path and no partial block markup is accepted

#### Scenario: A component describes an image
- **WHEN** a published-site entry is rendered and a block component calls the image describer for media in the export
- **THEN** it receives the resolved URL, effective alt text, dimensions and focal-point object position
