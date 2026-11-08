# admin-draft-editor-media-lists Specification

## Purpose
Defines media fields and list-item authoring in the admin draft editor: media selection, alt text, list operations, collapsed-row summaries and bulk media additions.

## Requirements

### Requirement: Generic block media fields use the existing media surface
Generic block fields SHALL render from their validated portable metadata. A model or block media field SHALL choose its stored media identifier through the shared media picker dialog, which browses active items across opaque cursor pages with the library's thumbnails, filename search, type filter, and sort, and SHALL let permitted writers upload within that dialog and choose a confirmed upload. The picker SHALL expose labelled loading, empty, no-match, upload-progress, validation-failure, and list-failure states without silently changing the draft; choosing an item SHALL change only that field's value and SHALL NOT save the draft. A field with a value SHALL show the selected item as one compact row without its own frame: a thumbnail read through the admin preview boundary, its filename with type and dimensions, a Replace action, which reopens the picker, and an actions menu whose Remove item clears the value. Replace and the menu SHALL keep accessible names that include the field label. The field SHALL resolve its value through an authorized single-item media read rather than by searching loaded list pages, SHALL label the resolving state, and SHALL NOT infer that an item is missing merely because it is outside a loaded page. When the value is pending deletion, has failed deletion, no longer exists, or cannot be read, the field SHALL show a distinct accessible state for that condition, SHALL retain the identifier in the draft until the writer replaces or removes it, and SHALL offer retry when the read failed for another reason than absence. No media field state SHALL display the raw media identifier. View-only editors SHALL see the row without Replace or the actions menu. The editor SHALL associate server validation issues at model-field, block-data, rich-text, or URL paths with the matching visible control while preserving the writer's complete local draft.

#### Scenario: A writer selects media for a block
- **WHEN** the media list loads and a writer opens the picker for a block media field and activates an active item's tile
- **THEN** the dialog closes, the block field shows that item's thumbnail and filename, and the next complete-draft save includes that media identifier

#### Scenario: A writer reuses media from a later page
- **WHEN** the desired active media item is beyond the first list page of the picker
- **THEN** the writer can request subsequent pages and choose it without leaving the editor or changing other draft values

#### Scenario: A writer searches the picker
- **WHEN** a writer types "hero" into the picker's search and selects the PNG filter
- **THEN** the picker requests media with that search and type, shows only the matching active items, and the editor route's URL does not change

#### Scenario: A writer uploads from the picker
- **WHEN** a permitted writer uploads a valid image from a field or block picker
- **THEN** the confirmed active item becomes choosable in that picker and its identifier enters the draft only when the writer chooses it

#### Scenario: Several files are uploaded from the picker with mixed results
- **WHEN** a writer uploads a valid PNG and a file the server rejects from a block picker
- **THEN** the PNG is reported as uploaded and can be chosen, the rejected file is reported with the server's error and a retry action, and the draft is unchanged until a choice is made

#### Scenario: A writer replaces and removes a selection
- **WHEN** a writer activates Replace on a selected field, chooses another item, and later chooses Remove from the field's actions menu
- **THEN** the field first shows the newly chosen item and then shows that no media is selected, focus moves to Choose media, and neither action saves the draft

#### Scenario: The selected media is one compact row
- **WHEN** an `image` block holds an active JPEG
- **THEN** the media field shows one row with the thumbnail, filename, "JPEG" with its dimensions, the alt text line, Replace and an actions menu, and no nested card frame

#### Scenario: A current selection no longer exists
- **WHEN** a saved media identifier's single-item read reports that the item was not found
- **THEN** the editor retains the identifier, states that the selected media no longer exists without showing the identifier, and allows explicit replacement or removal without silently mutating the draft

#### Scenario: A current selection is pending deletion
- **WHEN** a saved media identifier resolves to an item whose status is `deleting` or `delete_failed`
- **THEN** the field shows the item's filename with an accessible unavailable state for that status and offers Replace and Remove

#### Scenario: A current selection is inaccessible
- **WHEN** a saved media identifier's single-item read fails for a reason other than absence
- **THEN** the editor retains the identifier, presents an accessible could-not-load message with a retry action, and allows explicit replacement or removal

#### Scenario: Block validation fails on save
- **WHEN** the server rejects a block data field, rich-text value, or URL with a documented JSON Pointer issue
- **THEN** the editor preserves the local ordered block list and attaches an accessible error to the corresponding model or block field

### Requirement: Selected media shows its alt text
A model or block media field holding a resolved item SHALL show the item's alt
text next to its filename, truncated to one line with the full text available,
or state that the item has no alt text. The alt text SHALL reflect the latest
loaded item, so a metadata change saved in the media library is shown without
reloading the editor.

#### Scenario: A selected image with alt text
- **WHEN** a block media field holds an active item whose alt text is
  "Red bicycle"
- **THEN** the selected media card shows the filename and "Red bicycle"

#### Scenario: A selected image without alt text
- **WHEN** a media field holds an active item without alt text
- **THEN** the selected media card states that the item has no alt text

### Requirement: List operations preserve item content and editing identity
Writers SHALL be able to Add, Remove, Duplicate, Move up/down and reorder by
pointer or keyboard drag within each list, including scalar lists. Add of an
eligible media list SHALL follow the requirement for adding several media
items at once. Add of any other list SHALL use a detached declared item
default, otherwise a draft-valid group with child defaults or a draft-valid
scalar starting value. When a scalar has no valid empty starting value, Add
SHALL request a value and commit only when valid; cancel SHALL leave the list
unchanged. Duplicate SHALL insert an independent deep copy immediately after
the source. Remove SHALL affect only its item. Move boundary actions SHALL be
disabled; cancelled drag SHALL preserve order. Actions SHALL name the list,
item and position accessibly and announce results. Focus after insertion
SHALL reach the new item, after removal the next item, then the previous
item, then Add for an empty list; move focus SHALL follow the item. Nested
lists SHALL reorder only within their own list.

A list SHALL render its items as rows in one bordered container separated by
dividers, without a separate frame per item. Each row SHALL show a drag
handle and an item actions menu. The menu SHALL contain Move up, Move down,
Duplicate and Remove, keeping those actions' accessible names, disabled
states and limit explanations. Moves through the menu SHALL keep focus on the
moved item's row. A scalar item row SHALL show its control inline between the
handle and the menu. A group item row SHALL be collapsible with a chevron
toggle. Group items SHALL start collapsed when the editor loads or reloads a
draft. An item created by Add of a list that is not an eligible media list,
or by Duplicate, SHALL start open and receive focus on its first control.
Items appended from the media picker SHALL start collapsed. Revealing a
validation problem SHALL open the item.
Each item's open state SHALL be independent of other items and SHALL follow
its editing identity. A collapsed row SHALL show its summary, item counts
where applicable and problem indicator. An open row's header SHALL name the
item with its one-based position and keep the handle, toggle and menu.

Summaries SHALL follow the collapsed-item summary and preview requirement,
SHALL collapse whitespace, truncate long text and never expose media IDs or
raw rich-text JSON. Accessible names SHALL include current one-based position
to disambiguate identical items. Moves and collapse SHALL preserve local
values, field errors, media state and rich-text editor state/selection where
applicable. UI item identity and open state SHALL be independent of values
and array positions, detached on Duplicate, and excluded from saves, copied
JSON, dirty comparison and public responses.

#### Scenario: Duplicate then edit nested content
- **WHEN** a writer duplicates a group with a nested link list and changes the duplicate's URL
- **THEN** the original stays unchanged, the duplicate follows it and saved JSON contains ordinary arrays/objects without UI IDs

#### Scenario: Equal scalar values have distinct editing identities
- **WHEN** a writer reorders two equal scalar items and then removes one
- **THEN** only the selected item's editing state is removed and the remaining item retains its state

#### Scenario: Move and collapse a rich-text item
- **WHEN** an item with edited rich text, media selection and a field error moves and is collapsed then reopened
- **THEN** those values, selection where applicable and error remain associated with that item

#### Scenario: Scalar insertion requires a value
- **WHEN** a number list has no item default and min 10, and a writer chooses Add
- **THEN** the editor requests a valid number before insertion, and cancellation leaves the array unchanged

#### Scenario: Nested keyboard reordering
- **WHEN** a keyboard user reorders a child-list item and cancels a second drag
- **THEN** only the child list changes, the second drag leaves its order intact, focus is visible and positions are announced without internal IDs

#### Scenario: Group items load collapsed
- **WHEN** a writer opens an entry whose gallery holds three items
- **THEN** all three items show as collapsed rows with summaries, and opening one leaves the others collapsed

#### Scenario: Actions live in the item menu
- **WHEN** a writer opens the actions menu of the first of three items
- **THEN** the menu offers Move up (disabled), Move down, Duplicate and Remove with accessible names that include the list label and position, and no Up, Down, Duplicate or Remove text buttons are shown on the row

#### Scenario: Added item opens with focus
- **WHEN** a writer activates Add on a navigation submenu list of collapsed link groups
- **THEN** the new item is appended open, its first control receives focus and the existing items stay collapsed

#### Scenario: Open state is not content
- **WHEN** a writer opens and collapses items of a saved draft without editing values
- **THEN** the draft stays clean and saved or copied JSON contains no open-state data

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

A media leaf SHALL provide a preview: the media thumbnail read through the
admin preview boundary as the leading visual, the filename as title, and type
and dimensions as detail. When the media leaf's item group has exactly one
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

### Requirement: Eligible media lists add several items from the library at once
A list SHALL be an eligible media list when its item descriptor is a media
field, or when its item descriptor is a group whose direct fields include
exactly one media field, that field is required, and that field is visible in
the starting value Add would otherwise use (the declared item default,
otherwise a draft-valid group with child defaults); the group's other fields
MAY be of any type. Eligibility SHALL be derived from the validated field
metadata alone and SHALL apply to lists at any depth of model, page, global
and block data, including the built-in `gallery` block's `images` list. A
group with no media field, with an optional media field, with more than one
direct media field, or whose media field is hidden in that starting value SHALL
NOT make its list eligible.

For a writer, Add of an eligible list SHALL open the media picker in multiple
mode, labelled with the list's label, instead of inserting an item or
requesting a value. The editor SHALL supply the picker's capacity as the
largest number of new items that can be appended while the list stays within
its effective maximum and the prospective normalized snapshot stays within
the 500-element list budget, counting each appended item and the normalized
defaults of its nested lists. The editor SHALL name the cause of the limit:
the list maximum ("Images allows at most 50 items.") or the entry-wide budget
("An entry allows at most 500 list items, including nested lists and hidden
blocks."). When the capacity is zero, Add SHALL stay disabled with the
existing limit explanation and the picker SHALL NOT open. The editor SHALL
supply the media identifiers already held by the list's items so the picker
can mark them.

Confirming the picker SHALL append one item per selected media item, in
selection order, after the existing items, as one list change. A media item
SHALL be appended as that media identifier. A group item SHALL be appended as
an independent copy of the starting value Add would otherwise use — the
declared item default, otherwise a draft-valid group with child defaults —
with its media field set to the selected identifier, replacing any media the
default held. Required fields of the appended items that remain empty SHALL
be publication-only problems and SHALL NOT prevent saving the draft. Appended
items SHALL receive new editing identities, SHALL start collapsed, and SHALL
leave the open state of existing items unchanged. Focus SHALL move to the
first appended item's row and the editor SHALL announce the result, naming
the list and the number of items added. Appending SHALL make the draft dirty
and SHALL NOT save it. Cancelling the picker SHALL leave the list unchanged
and return focus to Add. Viewers SHALL NOT see Add, and Add SHALL be
unavailable while the editor is busy. The server SHALL remain authoritative
for list maxima and the snapshot budget.

#### Scenario: Twenty images are added to a gallery in one step
- **WHEN** a writer adds a `gallery` block, activates Add on its empty Images list, filters the picker by the tag `project-2026`, selects 20 images and activates "Add 20 images"
- **THEN** the list shows 20 collapsed rows in selection order with their thumbnails, the header reads "20 / 50", focus is on the first new row, the addition is announced, the draft is dirty, and the next save sends 20 items each holding only its `media` identifier

#### Scenario: Order follows the selection
- **WHEN** a gallery holds "a.jpg" and a writer selects "d.jpg", then "b.jpg", then "c.jpg" and confirms
- **THEN** the list reads "a.jpg", "d.jpg", "b.jpg", "c.jpg"

#### Scenario: The list maximum caps the selection
- **WHEN** a gallery with at most 50 items holds 47 and a writer activates Add
- **THEN** the picker allows at most 3 selected images and states that Images allows at most 50 items when 3 are selected

#### Scenario: The entry budget caps the selection
- **WHEN** an entry uses 495 of 500 list elements and a writer activates Add on a media list allowing 100 items that holds 10
- **THEN** the picker allows at most 5 selected images and names the entry-wide limit when 5 are selected

#### Scenario: Nested defaults count against the budget
- **WHEN** an eligible custom list's group item has a nested list defaulting to two values, the entry uses 491 of 500 list elements, and a writer activates Add
- **THEN** the picker allows at most 3 selected images, because each appended item adds 3 elements

#### Scenario: A full list does not open the picker
- **WHEN** a gallery holds 50 of at most 50 items
- **THEN** Add is disabled with the explanation that the list allows at most 50 items

#### Scenario: A scalar media list receives identifiers
- **WHEN** a model field `photos` is a list of media and a writer selects three images through Add and confirms
- **THEN** three rows with the images' media controls are appended and the saved value is an array of the three media identifiers in selection order

#### Scenario: A custom block list keeps item defaults
- **WHEN** a custom block's list item is a group with a required media field `cover` and a text field `label` defaulting to "Untitled", and a writer adds two images
- **THEN** each appended item holds its selected `cover` and `label` "Untitled"

#### Scenario: A conditional media field visible by default keeps eligibility
- **WHEN** a list item group declares select `kind` (`image`, `video`, default `image`), a required media field `media` visible for `image` and a required URL `videoUrl` visible for `video`, and a writer adds two images
- **THEN** the picker opens in multiple mode and each appended item holds `kind` `image` and its selected `media`

#### Scenario: Ineligible lists keep the ordinary Add
- **WHEN** a list's item group has two media fields, a single optional media field, or a required media field hidden by its controller's default
- **THEN** Add appends one open item with its starting value and does not open the media picker

#### Scenario: Cancelling adds nothing
- **WHEN** a writer activates Add on a gallery, selects images and presses Escape
- **THEN** the list and the draft's dirty state are unchanged and focus is on Add

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
