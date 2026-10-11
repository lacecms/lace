## MODIFIED Requirements

### Requirement: Reference site renders the starter blocks deterministically
The reference site SHALL render the `hero`, `richText`, `image`, `quote`, and
`cta` built-in block types for the starter models through the Astro adapter's
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
- **WHEN** an exported entry contains a block type outside the five built-ins
- **THEN** the build fails with its model key, entry identifier, and block key

#### Scenario: Migration preserves markup
- **WHEN** the committed fixture is built after the adapter migration
- **THEN** the entry scopes, block roots, part hooks, text, and media URLs equal
  the output of the pre-migration renderers

#### Scenario: Resolved media renders its description
- **WHEN** the fixture export's media dictionary gives the hero media alt text,
  dimensions and a focal point, and a post's image block overrides the alt text
- **THEN** the hero image carries the media alt text, `width`, `height` and the
  `object-position` style, and the post image carries the block's alt text
