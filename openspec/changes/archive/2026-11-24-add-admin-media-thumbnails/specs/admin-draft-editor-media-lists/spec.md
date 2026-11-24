## MODIFIED Requirements

### Requirement: Collapsed list items summarize with field previews
A collapsed group item SHALL show a primary summary line and, when available,
a muted secondary line, a leading preview and advisory indicators. The
primary line SHALL use the existing summary order: nonblank `itemLabel` text,
then the first useful text/textarea, rich-text plain text, URL or select
value. A field type SHALL be able to provide a preview. The row SHALL take its preview from
the first direct child leaf of the item, in rendered field order, whose type
provides a preview and whose value is present. When no text summary exists,
the preview's title SHALL be the primary line; otherwise the preview's title
SHALL be the secondary line. When the preview's title is the primary line,
its detail SHALL be the secondary line. Without a preview, the secondary line
SHALL be the next useful text, URL or select value from a different field.
When a media value exists but no preview is available or the media item is
unresolved, the existing generic media-selected label SHALL remain the
fallback, and Empty item SHALL remain the last fallback. Summaries and
previews SHALL derive only from schema metadata, the item's values and
resolved media metadata. They SHALL contain no per-block presentation rules,
SHALL NOT expose media IDs or raw rich-text JSON and SHALL NOT dirty the draft.

A media leaf SHALL use the static media thumbnail from the authenticated
admin thumbnail endpoint as its leading visual, the filename as its title
and the type and dimensions as its detail. When the media leaf's item group has exactly one
media field and a text field keyed `alt`, that `alt` is blank, and the
resolved media item has no alt text, the preview SHALL add an advisory "No
alt" indicator. The indicator SHALL NOT block saving or publishing.
Unresolvable, missing or pending-deletion media SHALL show a neutral
placeholder visual and an accessible state instead of the thumbnail.

#### Scenario: Gallery item with caption
- **WHEN** a gallery item holds media `photo.jpeg` with alt text and the
  caption "Blue portrait"
- **THEN** its collapsed row shows the thumbnail, "Blue portrait" as primary
  line and `photo.jpeg` as secondary line, with no "No alt" indicator

#### Scenario: Gallery item without caption or alt text
- **WHEN** a gallery item holds media `(3).jpeg`, a 675×1200 JPEG without alt
  text, and has blank caption and alt
- **THEN** its collapsed row shows the thumbnail, `(3).jpeg` as primary line,
  "JPEG · 675×1200" as secondary line and a "No alt" indicator, and the
  draft can be saved and published

#### Scenario: Item alt text removes the indicator
- **WHEN** the writer opens that item, types alt text and collapses it again
- **THEN** the "No alt" indicator is gone and the draft becomes dirty only
  through the typed alt text

#### Scenario: Items without previewable leaves
- **WHEN** a navigation link item has label "Blog" and URL `/blog`
- **THEN** its collapsed row shows "Blog" as primary line, `/blog` as
  secondary line, its one-based position as leading visual and no thumbnail

#### Scenario: Missing media in a gallery item
- **WHEN** a gallery item's media read reports that the item no longer exists
- **THEN** the row shows a placeholder visual with an accessible missing-media
  state and the generic media-selected label, without the media identifier
