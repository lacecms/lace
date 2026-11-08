## REMOVED Requirements

### Requirement: Block registry identity and starter blocks
**Reason**: Built-in blocks no longer declare migrations from versions before rc1 (owner decision 11).
**Migration**: Replaced by "The registry has unique identities and ships the starter blocks", which keeps the current behavior.

### Requirement: Gallery adopts reusable mode-specific setting visibility
**Reason**: Built-in blocks no longer declare migrations from versions before rc1 (owner decision 11).
**Migration**: Replaced by "Gallery declares reusable mode-specific setting visibility", which keeps the current behavior.

## ADDED Requirements

### Requirement: The registry has unique identities and ships the starter blocks
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
`gallery` SHALL contain an optional text `title` and an `images` list labelled
"Images and videos" whose default is an empty list, with a publication minimum
of 1 and a maximum of 50 items, each item a group of: a required select `kind`
with options `image` and `video`, default `image`, labelled "Type" with
choice-card presentation (an Image and a Video choice, each with a label and
description); required `media`; optional text `alt` that overrides the media
item's alt text; a required URL `videoUrl` restricted to YouTube and Vimeo,
labelled "Video URL"; a required text `videoTitle` with minimum length 1,
labelled "Video title", whose description says it names the video for
assistive technology; optional text `caption`; an optional URL `link`; and the
required selects `playback` and `aspectRatio` with exactly the options,
defaults, labels, descriptions and choice-card presentation of the
`videoEmbed` settings of the same names. The item group SHALL declare
`visibility` rules making `media`, `alt` and `link` depend on `kind` values
`["image"]`, and `videoUrl`, `videoTitle`, `playback` and `aspectRatio` depend
on `["video"]`; `kind` and `caption` SHALL have no rule. The `caption`
description SHALL state that an empty image caption falls back to the media
item's caption. The list's item label SHALL be `caption`. Each `link` field
SHALL be labelled "Link" with a description stating that a selected image
opens the link instead of the full-screen view. The gallery description SHALL
mention images and videos. `navigation` SHALL contain an optional text
`name` and a `links` list whose default is an empty list, with a publication
minimum of 1 and a maximum of 20 items, each item a group of a required text
`label`, an optional `url` and an optional `children` list of at most 20 items,
each child a group of a required text `label` and a required `url`; both link
lists SHALL use `label` as their item label. URL values SHALL follow the ordinary URL-field target rules, including internal references; provider-restricted URLs SHALL retain provider validation.
`image` SHALL be at definition version 4 and `gallery` at definition version
5. Both SHALL declare
a boolean setting `lightbox` labelled "Open full screen" with a description
and the default `false`. Gallery SHALL additionally declare the reusable
`layoutMode`, `layoutWrap` and `layoutPreset` scalar settings from the
list-layout contract, with defaults `grid`, `true` and `auto`, respectively.
Its Settings form SHALL place those fields in a Layout section before a
Behavior section containing lightbox, using ordinary settingsLayout metadata.
Arrangement SHALL remain visible. Wrap and preset controls SHALL follow the
shared mode-specific visibility and validation-error reveal contract.
The `kind` default SHALL make a gallery item without `kind` an image.
`navigation` SHALL
be at definition version 1. Except for `link` and `videoEmbed`, the other built-ins SHALL stay at version 1 and
SHALL declare no settings. No built-in SHALL declare migrations: the oldest
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

#### Scenario: A video item
- **WHEN** a gallery item `{ kind: "video", videoUrl:
  "https://vimeo.com/76979871", videoTitle: "Studio tour", playback:
  "ambient", aspectRatio: "1:1", caption: "Spring 2026" }` is validated in
  publish mode
- **THEN** it is valid without `media`, and its published projection holds
  exactly `kind`, `videoUrl`, `videoTitle`, `playback`, `aspectRatio` and
  `caption`

#### Scenario: A video item applies its defaults
- **WHEN** a video item holds only `kind`, `videoUrl` and `videoTitle` and is
  parsed in publish mode
- **THEN** its `playback` is `player` and its `aspectRatio` is `16:9`

#### Scenario: Video fields are required only for videos
- **WHEN** an item with `kind` `video` lacks `videoUrl` and `videoTitle`,
  another has an empty `videoTitle`, and a third has a
  `https://example.com/clip` `videoUrl`
- **THEN** draft validation accepts the missing values while publish
  validation fails at the first item's `videoUrl` path, and both modes reject
  the empty title (its minimum length applies to drafts) and the
  non-provider URL at their paths

#### Scenario: Image values are hidden on video items
- **WHEN** a draft video item still holds a `media`, an `alt` and a `link`
  from when it was an image, and the entry is published
- **THEN** publication succeeds, the draft keeps those values, and the
  published item holds none of them

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

#### Scenario: Shared video descriptors keep videoEmbed identity
- **WHEN** a configuration registering `videoEmbed` without `gallery` is
  normalized after the gallery adopts the shared `playback` and `aspectRatio`
  descriptors
- **THEN** `videoEmbed` stays at version 2 and its structural and projection
  hashes equal those from before this change

#### Scenario: Layout settings share runtime validation
- **WHEN** Gallery settings use an unknown mode, a nonboolean wrap or an
  unknown preset, including one unused by the selected mode
- **THEN** both runtime adapters reject the value at its declared setting path
  using the same shared validation rules

#### Scenario: Embed definition uses only the public DSL
- **WHEN** the video embed built-in is resolved
- **THEN** it is version 2, its serializable fields are URL, title, poster and caption with the declared restrictions, its settings are `aspectRatio` and `playback` with their choices and defaults, and other definitions keep their versions

#### Scenario: Standalone link variants
- **WHEN** a Link block has a label and valid manual or internal URL with default settings or appearance `text`
- **THEN** it validates with a string URL and selected scalar presentation, and no second button block type is registered

#### Scenario: Link required values
- **WHEN** a Link draft omits its URL or label
- **THEN** draft mode permits the omission, while publication rejects it at that field path

#### Scenario: Gallery item without a kind is an image
- **WHEN** a version 5 `gallery` item holds `media`, `alt`, `caption` and
  `link` but no `kind` and is validated in publish mode
- **THEN** validation succeeds, the parsed item has `kind` `image`, and its
  `media`, `alt`, `caption` and `link` values are delivered

#### Scenario: A stored older built-in block is not migrated
- **WHEN** configuration synchronization finds a stored version 4 `gallery`
  block, a version 3 `image` block or a version 1 `videoEmbed` block
- **THEN** it reports `BLOCK_MIGRATION_MISSING` for each, naming the entry and
  block key, and changes no snapshot, block, published state or build work

#### Scenario: Built-ins declare no migrations
- **WHEN** the starter block registry is created
- **THEN** no built-in definition declares a migration, while a custom block
  definition at version 2 with a migration to version 2 is accepted

### Requirement: Gallery declares reusable mode-specific setting visibility
Gallery SHALL declare the shared list-layout visibility rules: `layoutMode`
always visible, `layoutWrap` visible for both flex modes, and `layoutPreset`
visible for grid, subject to generic validation-error reveal. An unrelated block
SHALL be able to reuse the same scalar settings and visibility rules without
admin changes. Layout/Behavior grouping, settings/defaults and
all image/link/lightbox semantics SHALL remain unchanged by this visibility
metadata, and gallery item kinds SHALL not change the settings or their
visibility rules. Setting visibility metadata SHALL not enter authored/public payloads
or change Astro registry source revisions or stylesheet ownership.

#### Scenario: Two adopters
- **WHEN** Gallery and a custom card-list block adopt shared layout settings and visibility
- **THEN** both expose the same mode-specific controls with independent retained scalar values through the ordinary editor

#### Scenario: Existing content and sites remain compatible
- **WHEN** Gallery gains setting visibility metadata
- **THEN** existing blocks, model structural versions, Astro components, CSS hashes and public settings retain their existing contracts
