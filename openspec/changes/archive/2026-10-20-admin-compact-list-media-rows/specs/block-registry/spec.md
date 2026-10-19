## ADDED Requirements

### Requirement: Built-in image fields declare media first
The built-in `image` block SHALL declare its fields in the order `media`,
`alt`, `caption`, `link`, and the `gallery` list item group SHALL declare its
fields in the same order, so generic editors that follow declaration order
present the image before the values that override or extend it. Field
declaration order SHALL be presentation only: it SHALL NOT change field keys,
paths, constraints, defaults, required status, definition versions,
migrations, structural hashes or projection hashes, and stored block data
SHALL remain valid without migration.

#### Scenario: Image fields are projected media first
- **WHEN** the starter registry's `image` block and `gallery` block metadata
  are projected for the admin
- **THEN** the first key of the `image` fields and of the gallery item group's
  fields is `media`, followed by `alt`, `caption` and `link`

#### Scenario: Reordering keeps identity and versions
- **WHEN** a configuration registering `image` and `gallery` is normalized
  with the media-first declaration order and compared with the same
  configuration declared in the earlier alphabetical order
- **THEN** both blocks keep versions 4 and 3, and every model and
  whole-configuration structural and projection hash is equal

#### Scenario: Existing data stays valid
- **WHEN** a saved `image` block or gallery item from before the reordering is
  loaded and validated in draft and publish modes
- **THEN** it validates exactly as before and no migration runs
