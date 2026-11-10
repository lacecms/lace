## ADDED Requirements

### Requirement: Gallery version 6 migrates rc2 galleries
The `gallery` definition SHALL declare exactly one migration, to version 6,
which configuration synchronization applies to stored version 5 drafts and
published snapshots (the rc2 shape). The migration SHALL replace the setting
`layoutPreset` `featured-first` with `columns-2` and, when the gallery holds at
least one item, set its first item's `placement` to `full`, whatever the
`layoutMode`. It SHALL write `playback` `player` to every video item without a
stored `playback`, so its playback is unchanged by the new default. It SHALL
change no other setting, item or value. Stored galleries older than version 5
SHALL be refused by synchronization as a missing migration step and left
unchanged.

#### Scenario: A featured-first gallery
- **WHEN** a version 5 gallery with `layoutPreset` `featured-first` and three
  image items is synchronized
- **THEN** it is stored at version 6 with `layoutPreset` `columns-2`, the
  first item has `placement` `full`, the other items are unchanged, and it
  renders the same composition as before

#### Scenario: A video item that used the old default
- **WHEN** a version 5 gallery holds one video item without `playback` and
  one with `playback` `ambient`
- **THEN** after synchronization the first has `playback` `player`, the second
  keeps `ambient`, and both render as before the upgrade

#### Scenario: An ordinary gallery
- **WHEN** a version 5 `columns-3` gallery of image items is synchronized
- **THEN** its settings and items are unchanged apart from the version

#### Scenario: A gallery older than rc2
- **WHEN** stored data holds a version 4 gallery
- **THEN** synchronization reports the missing migration step and changes no
  stored data

## MODIFIED Requirements

### Requirement: Gallery holds images and videos in one list
The built-in `gallery` block SHALL be at definition version 6 and SHALL be
defined only through the public block and field DSL. `gallery` SHALL contain an optional text `title` and an `images` list labelled
"Images and videos" whose default is an empty list, with a publication minimum
of 1 and a maximum of 50 items, each item a group of: a required select `kind`
with options `image` and `video`, default `image`, labelled "Type" with
choice-card presentation (an Image and a Video choice, each with a label and
description); required `media`; optional text `alt` that overrides the media
item's alt text; a required URL `videoUrl` restricted to YouTube and Vimeo,
labelled "Video URL"; a required text `videoTitle` with minimum length 1,
labelled "Video title", whose description says it names the video for
assistive technology; optional text `caption`; an optional URL `link`; and the
required select `aspectRatio` with exactly the options, default, label,
description and choice-card presentation of the `videoEmbed` setting of the
same name; a required select `playback` with exactly the options, label,
description and choice-card presentation of the `videoEmbed` `playback`
setting but the default `ambient`; the reusable list-layout `placement` field;
and a required select `size` with options `fill` and `natural`, default `fill`,
labelled "Size" with choice-card presentation, whose description states that a
natural image keeps its own width, never wider than its cell. The item group SHALL declare
`visibility` rules making `media`, `alt`, `link` and `size` depend on `kind`
values `["image"]`, and `videoUrl`, `videoTitle`, `playback` and `aspectRatio` depend
on `["video"]`; `kind`, `caption` and `placement` SHALL have no rule. The `caption`
description SHALL state that an empty image caption falls back to the media
item's caption. The list's item label SHALL be `caption`. Each `link` field
SHALL be labelled "Link" with a description stating that a selected image
opens the link instead of the full-screen view. The gallery description SHALL
mention images and videos.
Gallery SHALL declare a boolean setting `lightbox` labelled "Open full
screen" with a description and the default `false`, and the reusable
`layoutMode`, `layoutWrap` and `layoutPreset` scalar settings from the
list-layout contract, with defaults `grid`, `true` and `auto`, respectively.
Its Settings form SHALL place those fields in a Layout section before a
Behavior section containing lightbox, using ordinary settingsLayout metadata.
Arrangement SHALL remain visible. Wrap and preset controls SHALL follow the
shared mode-specific visibility and validation-error reveal contract.
The `kind` default SHALL make a gallery item without `kind` an image, and the
`placement` and `size` defaults SHALL make an item without them `auto` and
`fill`. The `videoEmbed` block's `playback` default SHALL remain `player`.

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
- **THEN** its `playback` is `ambient`, its `aspectRatio` is `16:9` and its
  `placement` is `auto`

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

#### Scenario: Layout settings share runtime validation
- **WHEN** Gallery settings use an unknown mode, a nonboolean wrap or an
  unknown preset, including one unused by the selected mode
- **THEN** both runtime adapters reject the value at its declared setting path
  using the same shared validation rules

#### Scenario: Gallery item without a kind is an image
- **WHEN** a version 6 `gallery` item holds `media`, `alt`, `caption` and
  `link` but no `kind`, `placement` or `size` and is validated in publish mode
- **THEN** validation succeeds, the parsed item has `kind` `image`,
  `placement` `auto` and `size` `fill`, and its `media`, `alt`, `caption` and
  `link` values are delivered

#### Scenario: Placement and size on items
- **WHEN** a gallery holds an image item with `placement` `end` and `size`
  `natural` and a video item with `placement` `full` and is published
- **THEN** the image item delivers both values, the video item delivers its
  `placement` and holds no `size`, and an item submitting `size` `cover`
  fails at its `size` path

### Requirement: The gallery component renders items in stored order
The `gallery` component SHALL render a `section` root with class `gallery`, a
`title` part heading only when the title is a non-empty string, and an
`items` part list holding one `item` part per stored item in stored order,
each carrying `data-lace-kind` equal to the item's effective kind and
`data-lace-placement` equal to its effective placement; each image item part
SHALL also carry `data-lace-size` equal to its effective size. Each image
item SHALL render a figure with a `media` part image described by the image
describer from the item's media and alt override (effective alt: the item's
alt text, then the media alt text, then an empty string), with `width`,
`height` and focal-point `object-position` when known and `loading="lazy"`,
and a `caption` part only when the item caption, falling back to the media
caption, is present. Video items SHALL render as specified by the gallery
video-item requirement. The `astro/gallery` registry item SHALL ship one component and the
stylesheet companions `ListLayout.css` and `GalleryVideo.css`.

#### Scenario: Gallery items follow the media fallbacks
- **WHEN** a site renders a gallery titled "Studio" with one item overriding
  the alt text and having no caption, whose media has a caption and a focal
  point, and one item without alt text or caption whose media has neither
- **THEN** the root is `section` with class `gallery`, the heading shows
  "Studio", the first image carries the override alt, dimensions,
  `object-position` and `loading="lazy"` with the media caption, and the
  second image carries `alt=""` and no `caption` part

#### Scenario: Gallery without a title
- **WHEN** a site renders a gallery with anchor `photos`, class name `wide`
  and no title
- **THEN** the root carries `id="photos"` and `class="gallery wide"` and has
  no `title` part

#### Scenario: Registry item includes a structural stylesheet
- **WHEN** the Gallery registry manifest is read
- **THEN** it declares exactly one component with role `component` and the
  companions `ListLayout.css` and `GalleryVideo.css` with role `stylesheet`,
  whose source bytes exist and are included in the bundled registry

#### Scenario: Item hooks for placement and size
- **WHEN** a site renders a gallery holding an image item with no placement
  or size, an image item with `placement` `end` and `size` `natural`, and a
  video item with `placement` `full`
- **THEN** the item parts carry `data-lace-placement` `auto`, `end` and `full`,
  the image item parts carry `data-lace-size` `fill` and `natural`, and the
  video item part carries no `data-lace-size`
