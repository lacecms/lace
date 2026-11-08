## REMOVED Requirements

### Requirement: The registry has unique identities and ships the starter blocks
**Reason**: Gallery-specific definition text and scenarios move to `gallery-block` (RF8B).
**Migration**: Replaced by "The registry has unique identities and ships the built-in blocks"; the gallery parts by `gallery-block` "Gallery holds images and videos in one list".

### Requirement: Gallery declares reusable mode-specific setting visibility
**Reason**: Gallery requirements are owned by `gallery-block` (RF8B).
**Migration**: Moved unchanged to `gallery-block` as "Gallery declares reusable mode-specific setting visibility".

## ADDED Requirements

### Requirement: The registry has unique identities and ships the built-in blocks
The system SHALL create a registry of block definitions and reject duplicate
block types or duplicate type/schema-version registrations. The registry SHALL
ship the `hero`, `richText`, `image`, `quote`, `cta`, `gallery`,
`navigation`, `videoEmbed` and `link` built-ins, defined only through the public block and field DSL.
`hero` SHALL contain optional eyebrow,
required heading, optional rich-text body, optional media, and optional
primary-action label and URL; `richText` SHALL contain required rich-text data;
`image` SHALL contain required media plus optional alt text, optional
caption and an optional URL `link`, where the block's alt text overrides the
media item's alt text;
`quote` SHALL contain required quote text plus optional attribution; and `cta`
SHALL contain required heading, action label, and action URL plus optional body.
`navigation` SHALL contain an optional text
`name` and a `links` list whose default is an empty list, with a publication
minimum of 1 and a maximum of 20 items, each item a group of a required text
`label`, an optional `url` and an optional `children` list of at most 20 items,
each child a group of a required text `label` and a required `url`; both link
lists SHALL use `label` as their item label. URL values SHALL follow the ordinary URL-field target rules, including internal references; provider-restricted URLs SHALL retain provider validation.
`image` SHALL be at definition version 4 and SHALL declare a boolean setting
`lightbox` labelled "Open full screen" with a description and the default
`false`. The `gallery` definition, version and settings are specified by
`gallery-block`. `hero`, `richText`, `quote`, `cta` and `navigation` SHALL be
at definition version 1 and SHALL declare no settings. No built-in SHALL declare migrations: the oldest
supported state is the current definition version of each built-in. A stored
built-in block whose schema version is below its definition version SHALL NOT
be migrated; configuration synchronization SHALL report it with
`BLOCK_MIGRATION_MISSING`, naming the entry and block, and SHALL write
nothing. The block migration mechanism SHALL remain available to custom block
definitions.
Each built-in SHALL carry a non-empty human-readable label and a non-empty
one-sentence description, and its serializable metadata projection SHALL
include both. A block's label and description SHALL be display metadata: they
SHALL contribute to the configuration projection hash and SHALL NOT contribute
to the structural hash. Adding built-ins SHALL NOT change the normalized
configuration or hashes of a configuration that does not register them.

`videoEmbed` SHALL be version 2 with a non-empty label and description,
required `url` restricted to YouTube and Vimeo, required text `title` with
minimum length 1, optional image-media `poster` and optional text `caption`.
It SHALL declare two required select settings with choice-card presentation:
`aspectRatio` with choices `16:9`, `4:3`, `1:1`, `4:5` and `9:16` and default
`16:9`, and `playback` with choices `player` and `ambient` and default
`player`, each choice with a label and description. Field and setting labels
and guidance SHALL explain the supported providers, accessible title, optional
poster, deferred player loading and the muted, looping, control-free ambient
mode. Registering the built-in SHALL NOT change configurations that do not
select it.

The `link` built-in SHALL be version 1, label `Link`, with a non-empty description,
required `label` text (minLength 1, maxLength 200), required ordinary `url`, and
required scalar settings `appearance` (select `button` or `text`, default
`button`) and `newTab` (boolean, default false).
Fields SHALL be ordered label then destination. Both appearances SHALL implement
navigation rather than form submission or arbitrary actions. Empty required
values SHALL follow normal draft/publication validation.

#### Scenario: Resolve each built-in by type
- **WHEN** the starter block registry is created
- **THEN** it resolves exactly one versioned definition each for `hero`,
  `richText`, `image`, `quote`, `cta`, `gallery`, `navigation`, `videoEmbed` and `link` with
  serializable field metadata, a label, and a description

#### Scenario: Image alt text is optional
- **WHEN** `image` block data holds a media identifier and no alt text is
  validated in publish mode
- **THEN** the data is valid, and data that omits the media identifier is
  still rejected

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

#### Scenario: Shared video descriptors keep videoEmbed identity
- **WHEN** a configuration registering `videoEmbed` without `gallery` is
  normalized after the gallery adopts the shared `playback` and `aspectRatio`
  descriptors
- **THEN** `videoEmbed` stays at version 2 and its structural and projection
  hashes equal those from before this change

#### Scenario: Embed definition uses only the public DSL
- **WHEN** the video embed built-in is resolved
- **THEN** it is version 2, its serializable fields are URL, title, poster and caption with the declared restrictions, its settings are `aspectRatio` and `playback` with their choices and defaults, and other definitions keep their versions

#### Scenario: Standalone link variants
- **WHEN** a Link block has a label and valid manual or internal URL with default settings or appearance `text`
- **THEN** it validates with a string URL and selected scalar presentation, and no second button block type is registered

#### Scenario: Link required values
- **WHEN** a Link draft omits its URL or label
- **THEN** draft mode permits the omission, while publication rejects it at that field path

#### Scenario: A stored older built-in block is not migrated
- **WHEN** configuration synchronization finds a stored version 4 `gallery`
  block, a version 3 `image` block or a version 1 `videoEmbed` block
- **THEN** it reports `BLOCK_MIGRATION_MISSING` for each, naming the entry and
  block key, and changes no snapshot, block, published state or build work

#### Scenario: Built-ins declare no migrations
- **WHEN** the starter block registry is created
- **THEN** no built-in definition declares a migration, while a custom block
  definition at version 2 with a migration to version 2 is accepted
