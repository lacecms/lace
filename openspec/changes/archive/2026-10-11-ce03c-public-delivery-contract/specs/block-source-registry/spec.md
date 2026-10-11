## MODIFIED Requirements

### Requirement: The registry holds one canonical source per framework block
The repository SHALL keep block sources in a framework-keyed registry with an index listing every item. Each item SHALL declare its name, framework, block type, block definition version, item revision, required render-core and adapter package ranges, its files with source and target role, and its item dependencies. The registry SHALL contain `astro` items for the `hero`, `richText`, `image`, `quote`, and `cta` built-in blocks whose components consume parsed block props and the adapter's rich-text component and preserve every documented `data-lace-*` hook. The `image` and `hero` components SHALL render their media through the image describer: the image element SHALL always carry an `alt` attribute with the effective alt text (for `image`, the block's alt text, then the media alt text, then an empty string; for `hero`, the media alt text, then an empty string), SHALL carry `width` and `height` when the media dimensions are known, and SHALL carry an inline `object-position` style when the media has a focal point. The `image` caption SHALL be the block's caption, falling back to the media caption. Registry content SHALL never be imported by a package at runtime. The `@lacecms/cli` package SHALL bundle a byte-identical copy of the registry with each build, and the CLI SHALL read registry content only from that bundled copy, never over the network.

#### Scenario: Registry index is complete
- **WHEN** the registry index is read
- **THEN** it lists exactly one `astro` item per built-in block type, each item manifest exists, its block definition version equals the built-in definition version, and every declared file exists

#### Scenario: Item manifest is inconsistent
- **WHEN** an item declares a block type other than the one its block definition version refers to, or a file it does not contain
- **THEN** registry verification fails and names the item

#### Scenario: Bundled registry matches the repository
- **WHEN** the CLI package is built
- **THEN** its bundled registry files are byte-identical to the repository `registry/` files

#### Scenario: Image block without alt text renders an empty alt attribute
- **WHEN** a site renders a version 2 `image` block whose data has media and no alt text, and the media has no alt text
- **THEN** the rendered image element has an empty `alt` attribute and the documented `data-lace-*` hooks

#### Scenario: Image block inherits the media description
- **WHEN** a site renders an `image` block without alt text or caption whose media has alt text, a caption, dimensions and a focal point
- **THEN** the image element carries the media alt text, `width`, `height` and an `object-position` style, and the caption shows the media caption

#### Scenario: Hero uses the media alt text
- **WHEN** a site renders a `hero` block whose image media has alt text
- **THEN** the hero image element carries that alt text instead of an empty one
