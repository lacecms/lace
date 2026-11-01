## ADDED Requirements

### Requirement: Block parsing omits hidden block data
After publication-mode parsing, the render core SHALL remove block data
values hidden by the block's `visibility` rules, recursively through visible
groups and list items, using the shared published projection, before
returning component data. A hidden required target SHALL NOT cause
`invalid_block_data`; a visible required target that is absent SHALL fail as
today with its exact path. Parsed data types SHALL mark conditional targets
optional. Blocks without rules SHALL parse and type exactly as before.

#### Scenario: Stale value from an older export
- **WHEN** a block's data holds `kind: "image"`, a `media` value and a stale `videoUrl`
- **THEN** parsing succeeds and the component data holds `kind` and `media` and no `videoUrl`

#### Scenario: Visible required target missing
- **WHEN** a block's data holds `kind: "video"` and no `videoUrl`
- **THEN** parsing fails with `invalid_block_data` naming the `videoUrl` path

#### Scenario: Nested list items
- **WHEN** a block's list holds an `image` item and a `video` item with stale values for the other kind
- **THEN** the component data holds both items in order, each without the other kind's value
