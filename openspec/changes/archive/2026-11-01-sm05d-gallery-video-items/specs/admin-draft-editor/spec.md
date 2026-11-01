## ADDED Requirements

### Requirement: Eligible media lists add items for choices that hide their media
An eligible media list whose group item's media field has a `visibility`
rule with a `select` controller SHALL offer, for a writer, one additional Add
button for each controller option, in option order, that the rule's `values`
do not list. Each button's visible text SHALL be "Add " followed by that
option's choice-card label, or the option value when the controller declares
no presentation, and its accessible name SHALL name the option and the list
(for the gallery, "Add Video" and "Add Video item to Images and videos"). The
buttons SHALL follow the media Add button, which keeps opening the media
picker. Lists that are not eligible media lists, media fields without a rule
and rules whose controller is a `boolean` SHALL show no additional buttons.
The buttons SHALL be derived from the validated field metadata alone and
SHALL apply at any depth of model, page, global and block data.

Activating such a button SHALL append exactly one item after the existing
items, as one list change: an independent copy of the starting value the
ordinary Add would use (the declared item default, otherwise a draft-valid
group with child defaults) with the controller set to that option. The item
SHALL receive a new editing identity, SHALL open, SHALL receive focus and SHALL
be announced exactly as the ordinary Add of an ineligible list does, leaving
other items' open state unchanged. Required fields that remain empty SHALL be
publication-only problems and SHALL NOT prevent saving. Appending SHALL make
the draft dirty and SHALL NOT save it. The buttons SHALL share the media Add
limits: they SHALL be disabled with the same explanation when the list
maximum or the 500-element snapshot budget leaves no room for one item, SHALL
be unavailable while the editor is busy, and SHALL be absent for viewers. The
server SHALL remain authoritative for list maxima, the snapshot budget and
conditional rules.

#### Scenario: Add a video to a gallery
- **WHEN** a writer activates "Add Video" on a gallery's Images and videos
  list holding two images
- **THEN** a third item opens with Type set to Video and its Video URL,
  Video title, Caption, Playback and Aspect ratio controls shown, focus moves
  into it, the addition is announced, the draft is dirty, and the next save
  sends the item with `kind` `video`, `playback` `player` and `aspectRatio`
  `16:9`

#### Scenario: Images still come from the picker
- **WHEN** the writer activates Add on the same list
- **THEN** the media picker opens in multiple mode and confirmed images are
  appended with `kind` `image`

#### Scenario: A full list disables every Add
- **WHEN** a gallery holds 50 of at most 50 items
- **THEN** Add and "Add Video" are disabled with the explanation that the list
  allows at most 50 items

#### Scenario: Custom block with several hiding options
- **WHEN** a custom block's eligible list item has select `source` with
  options `upload`, `embed` and `none` (no presentation), and its required
  media field is visible for `["upload"]`
- **THEN** the list shows Add, "Add embed" and "Add none" in that order, and
  "Add embed" appends one open item with `source` `embed`

#### Scenario: No additional buttons without a select rule
- **WHEN** an eligible list's media field has no rule, or depends on a
  boolean controller
- **THEN** the list shows only Add

#### Scenario: Viewers see no Add buttons
- **WHEN** a viewer opens an entry with a gallery
- **THEN** neither Add nor "Add Video" is shown

### Requirement: Embed URL leaves provide a collapsed-row preview
A URL leaf restricted to embed providers SHALL provide a collapsed-row
preview when its value is a supported provider URL: a neutral video icon as
the leading visual and "YouTube video" or "Vimeo video" as the title, with no
detail and no indicators. The preview SHALL follow the existing collapsed-row
rules: it is chosen only when it is the first shown direct child leaf with a
preview and a present value, its title is the secondary line when a text
summary exists and the primary line otherwise. A value that does not parse as
a supported provider URL SHALL provide no preview, so the generic summary
applies. URL leaves without embed providers SHALL provide no preview, so media
previews and existing URL summaries are unchanged. The preview SHALL derive
only from the value and field metadata, SHALL make no network request and
SHALL NOT dirty the draft.

#### Scenario: Video row with a title
- **WHEN** a collapsed gallery video item holds `videoUrl`
  `https://vimeo.com/76979871`, `videoTitle` "Studio tour", no caption, and a
  stale hidden `media` value
- **THEN** its row shows the video icon, "Studio tour" as primary line and
  "Vimeo video" as secondary line, with no thumbnail and no "No alt"
  indicator

#### Scenario: Caption labels a video row
- **WHEN** the same item has the caption "Spring 2026"
- **THEN** its primary line is "Spring 2026" and its secondary line is "Vimeo
  video"

#### Scenario: New video item
- **WHEN** a video item was just added and holds no URL, title or caption
- **THEN** its collapsed row shows no video preview and the generic summary
  fallback

#### Scenario: Ordinary URLs keep their summary
- **WHEN** a navigation link item has label "Blog" and URL `/blog`
- **THEN** its collapsed row shows "Blog" and `/blog` with no video icon

### Requirement: Visibility controllers do not summarize list items
Collapsed-row summaries and block-card list summaries SHALL skip the values of
fields that control a `visibility` rule of the same group, because a controller
chooses which fields apply rather than describing the item. The primary line
SHALL come from the item label or the first useful text of the other shown
fields, and the secondary line from another shown, non-controller field or the
preview. When only a controller holds text, the existing preview, media and
Empty item fallbacks SHALL apply. Controllers SHALL remain ordinary fields in
the open item form, and fields that control nothing SHALL summarize as before.

#### Scenario: Image item without text
- **WHEN** a collapsed gallery image item holds `kind` `image` and media `a.png` without caption or alt text
- **THEN** its primary line is `a.png` from the media preview, not "image"

#### Scenario: Video item without caption
- **WHEN** a collapsed list item with `kind` `video` holds a caption and a video URL and no media preview applies
- **THEN** its primary line is the caption and its secondary line is the URL, not "video"

