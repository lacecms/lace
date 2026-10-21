## MODIFIED Requirements

### Requirement: Block registry identity and starter blocks
The system SHALL create a registry of block definitions and reject duplicate
block types or duplicate type/schema-version registrations. The registry SHALL
ship the `hero`, `richText`, `image`, `quote`, `cta`, `gallery` and
`navigation` built-ins, defined only through the public block and field DSL.
`hero` SHALL contain optional eyebrow,
required heading, optional rich-text body, optional media, and optional
primary-action label and URL; `richText` SHALL contain required rich-text data;
`image` SHALL contain required media plus optional alt text, optional
caption and an optional URL `link`, where the block's alt text overrides the
media item's alt text;
`quote` SHALL contain required quote text plus optional attribution; and `cta`
SHALL contain required heading, action label, and action URL plus optional body.
`gallery` SHALL contain an optional text `title` and an `images` list whose
default is an empty list, with a publication minimum of 1 and a maximum of 50
items, each item a group of required `media`, optional text `alt` that
overrides the media item's alt text, optional text `caption` and an optional
URL `link`; the list's item label SHALL be `caption`. Each `link` field SHALL
be labelled "Link" with a description stating that a selected image opens the
link instead of the full-screen view. `navigation` SHALL contain an optional text
`name` and a `links` list whose default is an empty list, with a publication
minimum of 1 and a maximum of 20 items, each item a group of a required text
`label`, an optional `url` and an optional `children` list of at most 20 items,
each child a group of a required text `label` and a required `url`; both link
lists SHALL use `label` as their item label. URL values SHALL follow the
existing safe URL rules.
`image` and `gallery` SHALL be at definition version 4. Both SHALL declare
a boolean setting `lightbox` labelled "Open full screen" with a description
and the default `false`. Gallery SHALL additionally declare the reusable
`layoutMode`, `layoutWrap` and `layoutPreset` scalar settings from the
list-layout contract, with defaults `grid`, `true` and `auto`, respectively.
Its Settings form SHALL place those fields in a Layout section before a
Behavior section containing lightbox, using ordinary settingsLayout metadata.
All three layout controls SHALL remain visible with mode-applicability guidance.
`image` SHALL declare migrations to versions 2, 3 and 4. Gallery SHALL retain
identity migrations to versions 2 and 3 and add the version 4 migration, which
returns stored data and settings unchanged; normal setting validation SHALL
supply any absent defaults. Migration SHALL preserve item order, media usage,
alt/caption/link overrides, lightbox values and block-envelope values, including
hidden blocks and both draft and published snapshots. `navigation` SHALL
be at definition version 1. The other built-ins SHALL stay at version 1 and
SHALL declare no settings.
Each built-in SHALL carry a non-empty human-readable label and a non-empty
one-sentence description, and its serializable metadata projection SHALL
include both. A block's label and description SHALL be display metadata: they
SHALL contribute to the configuration projection hash and SHALL NOT contribute
to the structural hash. Adding built-ins SHALL NOT change the normalized
configuration or hashes of a configuration that does not register them.

#### Scenario: Resolve each built-in by type
- **WHEN** the starter block registry is created
- **THEN** it resolves exactly one versioned definition each for `hero`,
  `richText`, `image`, `quote`, `cta`, `gallery` and `navigation` with
  serializable field metadata, a label, and a description

#### Scenario: Image alt text is optional
- **WHEN** `image` block data holds a media identifier and no alt text is
  validated in publish mode
- **THEN** the data is valid, and data that omits the media identifier is
  still rejected

#### Scenario: Version 1 image blocks migrate unchanged
- **WHEN** a version 1 `image` block with media, alt text and caption is
  migrated to the configured version 4
- **THEN** the migrated data equals the stored data, its settings are
  `{ lightbox: false }` after defaults, and only the block's schema version
  changes

#### Scenario: Version 1 gallery blocks migrate unchanged
- **WHEN** a version 1 `gallery` block is migrated to the configured version 4
- **THEN** the migrated data equals the stored data and its settings are
  `{ lightbox: false, layoutMode: "grid", layoutWrap: true, layoutPreset: "auto" }`
  after defaults

#### Scenario: Version 3 image blocks keep their lightbox setting
- **WHEN** a version 3 `image` block with settings `{ lightbox: true }` is
  migrated to version 4
- **THEN** its data and settings are unchanged and it has no `link`

#### Scenario: Image links follow the safe URL rules
- **WHEN** `image` data with `link` `/work/kitchen` and a gallery item with
  `link` `https://example.com/` are validated in publish mode
- **THEN** both are valid, data without `link` is valid, and a `link`
  `javascript:alert(1)` fails at the `link` path of the block or of that item

#### Scenario: The lightbox setting is validated
- **WHEN** `image` settings `{ lightbox: true }` and `{}` are validated
- **THEN** they parse as `{ lightbox: true }` and `{ lightbox: false }`, and
  settings `{ lightbox: "yes" }` or `{ zoom: true }` are rejected

#### Scenario: Image metadata exposes the setting
- **WHEN** the metadata projection of `image` or `gallery` is read
- **THEN** it lists the boolean `lightbox` setting with its label,
  description and default `false`

#### Scenario: A new gallery is a valid draft but not publishable
- **WHEN** `gallery` data `{}` is normalized
- **THEN** it becomes `{ images: [] }`, passes draft validation, and fails
  publish validation at `/images` for the list minimum

#### Scenario: Gallery item without media
- **WHEN** a gallery item omits `media` and the data is validated in publish
  mode
- **THEN** validation fails at that item's `media` path, while draft
  validation accepts it

#### Scenario: Gallery over its maximum
- **WHEN** a gallery's `images` list holds 51 items
- **THEN** both draft and publish validation fail at `/images`

#### Scenario: Navigation with one submenu level
- **WHEN** `navigation` data has a link `{ label: "Docs", children: [{ label:
  "Guide", url: "/guide" }] }` without its own URL
- **THEN** it passes publish validation, and a child without `url` or a
  child URL `javascript:alert(1)` fails at that child's `url` path

#### Scenario: Built-in navigation fits the entry list budget
- **WHEN** a navigation block holds 20 links with 20 children each
- **THEN** it counts 420 list elements and is accepted, while a 21st child in
  one link fails at that link's `children` path

#### Scenario: Reject a duplicate registry registration
- **WHEN** configuration supplies two definitions with the same block type and
schema version, or attempts to register a duplicate type
- **THEN** registry creation fails before application startup

#### Scenario: Block display metadata stays out of structural identity
- **WHEN** two otherwise identical configurations differ only in a block's
  label or description
- **THEN** their normalized configurations have different projection hashes
  and the same structural hash

#### Scenario: Existing configurations keep their hashes
- **WHEN** a configuration registering only `hero`, `richText`, `quote`, `cta`
  and `navigation` is normalized after the `image` and `gallery` versions
  changed
- **THEN** its structural and projection hashes equal the pinned values from
  before the change

#### Scenario: Version 3 Gallery preserves content and lightbox
- **WHEN** version 3 Gallery blocks, including a hidden block, are synchronized
  in draft and published snapshots with lightbox enabled and linked images
- **THEN** Gallery becomes version 4 with the three layout defaults, while
  content, item order, lightbox, links and envelope values are preserved under
  the existing guarded block-migration and final published-version/build rules

#### Scenario: Layout settings share runtime validation
- **WHEN** Gallery settings use an unknown mode, a nonboolean wrap or an
  unknown preset, including one unused by the selected mode
- **THEN** both runtime adapters reject the value at its declared setting path
  using the same shared validation rules
