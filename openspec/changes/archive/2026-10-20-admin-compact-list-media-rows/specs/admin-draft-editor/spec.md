## ADDED Requirements

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

## MODIFIED Requirements

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

### Requirement: Composite fields support recursive generic authoring
The editor SHALL render groups as labelled fieldsets with descriptions and
nested controls and lists as labelled ordered repeatable items in every model
kind and block data. A group that is not a list item SHALL be a disclosure
whose toggle is a chevron icon button with an accessible name naming the
action and the group, consistent with block cards. A group used as a list
item SHALL render its fields directly inside the item's row, without its own
frame, legend or toggle. Every list and group label SHALL come from its
descriptor label or humanized key, never from per-block presentation code.
Scalar, media and rich-text leaves SHALL use the existing
controls and authorization rules. Group absence SHALL be distinguishable from
present `{}`, and list absence from present `[]`. Opening or collapsing a
field SHALL NOT materialize data, apply defaults or dirty the form. Writers
SHALL be able to create an absent group/list, clear a named field to absence,
and retain explicit empty objects/arrays. Defaults SHALL follow the shared
recursive contract. Clearing an item leaf SHALL NOT create a null/undefined
list slot: scalar items are removed through Remove. An incomplete group item
SHALL remain a valid draft starting point.

#### Scenario: Nested controls across content kinds
- **WHEN** a writer opens model or block fields containing a group with a nested list of groups and media/rich-text leaves
- **THEN** every value has a labelled editable control using the existing picker and safe rich-text toolbar

#### Scenario: Absence and explicit emptiness
- **WHEN** a writer creates an absent optional group, leaves it empty, creates an empty list and saves
- **THEN** the payload contains explicit {} and [], subject to declared child defaults, without synthesizing unrelated optional containers

#### Scenario: Clear a field with a default
- **WHEN** a writer clears a named nested field and saves
- **THEN** the field is omitted from the payload and the confirmed normalized response applies its declared default exactly as the shared validation contract requires

#### Scenario: Read-only inspection
- **WHEN** a viewer opens composite data
- **THEN** every nested value is inspectable and disclosures are operable, while editing, picker/upload, Add, Remove, Duplicate and reorder actions are unavailable

#### Scenario: Group disclosure uses a chevron
- **WHEN** a writer views a standalone optional group named "Contact"
- **THEN** its toggle is an icon-only chevron button named "Collapse Contact" while open and "Expand Contact" while closed, with no visible "Collapse" text

#### Scenario: A list item group has no nested frame
- **WHEN** a writer opens a gallery item
- **THEN** the item's media, alt, caption and link controls appear directly in the opened row, with no inner group legend or second toggle

### Requirement: List operations preserve item content and editing identity
Writers SHALL be able to Add, Remove, Duplicate, Move up/down and reorder by
pointer or keyboard drag within each list, including scalar lists. Add SHALL
use a detached declared item default, otherwise a draft-valid group with child
defaults or a draft-valid scalar starting value. When a scalar has no valid
empty starting value, Add SHALL request a value and commit only when valid;
cancel SHALL leave the list unchanged. Duplicate SHALL insert an independent
deep copy immediately after the source. Remove SHALL affect only its item.
Move boundary actions SHALL be disabled; cancelled drag SHALL preserve order.
Actions SHALL name the list, item and position accessibly and announce results.
Focus after insertion SHALL reach the new item, after removal the next item,
then the previous item, then Add for an empty list; move focus SHALL follow
the item. Nested lists SHALL reorder only within their own list.

A list SHALL render its items as rows in one bordered container separated by
dividers, without a separate frame per item. Each row SHALL show a drag
handle and an item actions menu. The menu SHALL contain Move up, Move down,
Duplicate and Remove, keeping those actions' accessible names, disabled
states and limit explanations. Moves through the menu SHALL keep focus on the
moved item's row. A scalar item row SHALL show its control inline between the
handle and the menu. A group item row SHALL be collapsible with a chevron
toggle. Group items SHALL start collapsed when the editor loads or reloads a
draft. An item created by Add or Duplicate SHALL start open and receive focus
on its first control. Revealing a validation problem SHALL open the item.
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
- **WHEN** a writer activates Add on a list of collapsed group items
- **THEN** the new item is appended open, its first control receives focus and the existing items stay collapsed

#### Scenario: Open state is not content
- **WHEN** a writer opens and collapses items of a saved draft without editing values
- **THEN** the draft stays clean and saved or copied JSON contains no open-state data

### Requirement: Composite editing explains normalized list budgets
Each list SHALL show a header with its label, its count and effective maximum
in the form "<count> / <maximum>", an Add action and a list actions menu
containing Clear when clearing is offered. The list SHALL have no frame or
toggle of its own. The publication minimum SHALL be part of the list's
accessible description and SHALL be visible while the list has fewer items
than the minimum or a problem, and always in view-only mode; otherwise it SHALL
be visually hidden. Its visibility SHALL NOT depend on focus. The editor SHALL show entry-wide usage against 500 elements, counting
normalized defaults and all nested list lengths across model fields and block
data including hidden blocks. Growing actions, including Add, Duplicate and
container creation, SHALL preflight the prospective normalized snapshot and
be disabled with an accessible explanation when a list maximum or aggregate
budget would be exceeded. Block Add/Duplicate and nested default
materialization SHALL obey the same budget gate. Removal, collapse and moves
SHALL remain possible to recover. Required/minimum issues SHALL be labelled
as publication-only and SHALL NOT prevent saving otherwise-valid drafts;
maxima, wrong present values and payload-size failures SHALL block draft save.
The server SHALL remain authoritative for validation and authorization.

#### Scenario: Nested duplication exhausts the entry budget
- **WHEN** current usage is 490 and duplicating an item would add one outer item and ten inner items
- **THEN** Duplicate is unavailable with a limit explanation and the draft remains unchanged

#### Scenario: Exact budget and list boundaries
- **WHEN** a prospective edit results in exactly 500 total elements and no list exceeds its maximum, or results in 501 or a list above its maximum
- **THEN** the first is allowed and the latter actions are prevented, including contributions from hidden blocks and defaults

#### Scenario: Publication-only minimum
- **WHEN** an incomplete group or list below minItems is saved
- **THEN** Save succeeds if all present values are valid, and publication guidance distinguishes the missing required/minimum values from draft-blocking errors

#### Scenario: Header comes from the schema
- **WHEN** a gallery holds 3 of at most 50 images and a navigation submenu holds 1 of at most 20 links
- **THEN** the headers read "Images" with "3 / 50" and "Submenu links" with "1 / 20", each with its own Add and actions menu

#### Scenario: Minimum shown while unmet
- **WHEN** a gallery with a publication minimum of 1 is empty and later receives one item
- **THEN** the minimum guidance is visible while the list is empty and is visually hidden but still associated once the minimum is met

### Requirement: Required and constraint guidance is consistent and accessible
Every applicable descriptor control SHALL show a visible required marker and explain required-for-publication semantics when required. Scalar labels and composite legends SHALL retain accessible names; controls SHALL expose required state through role-supported accessibility attributes or associated explanatory text without native required validation blocking draft saves. Guidance SHALL include configured descriptions and declared text length, numeric and list bounds with accurate draft/publication semantics. The required-for-publication explanation SHALL always be associated with its control and SHALL be available as the tooltip of the visible required marker; it SHALL be visible text only while the field has a problem and always in view-only mode, and otherwise SHALL be visually hidden. No guidance or counter SHALL appear, disappear or move on focus or blur, so focusing a control never shifts the layout under the pointer. List-maximum guidance SHALL always be associated and SHALL be visible as the list header's count and maximum. Configured descriptions, declared text-length and numeric guidance and errors SHALL remain visible. All associated description IDs SHALL resolve to existing elements, coexist with errors and inherited annotations, and remain readable in viewer mode. Guidance SHALL NOT materialize absent containers, change validation rules or introduce viewer mutation actions.

#### Scenario: Required nested group and leaves
- **WHEN** a model or block has a required group with required text, select, boolean, media and rich-text leaves
- **THEN** its legend and applicable control labels expose required guidance and associated descriptions while an otherwise valid incomplete draft remains savable

#### Scenario: List minima differ from hard maxima
- **WHEN** a list declares minItems 2 and maxItems 5
- **THEN** guidance explains the minimum applies to publication and the maximum to drafts as well, without changing existing list operations or budgets

#### Scenario: Read-only and errors coexist
- **WHEN** a viewer inspects nested fields with required state, constraints, configured descriptions and errors
- **THEN** guidance and errors remain associated with the controls, disclosures remain usable and mutation actions are absent

#### Scenario: Required explanation stays out of the layout
- **WHEN** a writer views and then focuses the empty required media field of an `image` block and activates Replace
- **THEN** "Required for publication only." is the required marker's tooltip and part of the field's accessible description but is not visible text, the layout does not change on focus, and the picker opens

#### Scenario: Required explanation is shown with a problem and to viewers
- **WHEN** publication validation reports the required media missing, or a viewer opens the block
- **THEN** "Required for publication only." is visible text with the field

### Requirement: Ordinary text counters distinguish declared hard limits from SEO advice
Text and textarea controls SHALL show a visible current count, including zero for an absent value, measured using raw UTF-16 length, associated with the control. The count SHALL be shown right-aligned in the field's label row rather than on a line of its own and SHALL be visible regardless of focus. When minLength or maxLength is declared, the counter and associated constraint guidance SHALL identify the declared bounds as validation limits. Unbounded fields SHALL show a count without inventing a limit. Counts SHALL be available in read-only inspection and absent from per-keystroke live announcements. Counter rendering SHALL NOT truncate input, block typing or replace existing save/publication validation. SEO counters SHALL explicitly identify 60/160 as recommendations, retain trimmed code-point counting, explain their separate existing hard limits and remain visible.

#### Scenario: Declared maximum and failed save
- **WHEN** a writer enters an ordinary text value longer than maxLength
- **THEN** the counter reflects its full raw length, guidance identifies the hard maximum and existing validation rejects saving without truncating the author's input

#### Scenario: Optional absent field with minimum
- **WHEN** an optional text field with minLength is absent
- **THEN** its count is zero and its minimum guidance does not claim that absence prevents saving or publication

#### Scenario: Counter after list moves and viewer inspection
- **WHEN** text items are moved or duplicated in a nested list and the saved entry is later viewed read-only
- **THEN** each visible count belongs to its current value and declared bounds and no counter announces every keystroke

#### Scenario: SEO advice remains advisory
- **WHEN** SEO title text exceeds 60 code points but remains within its hard limit
- **THEN** the counter labels 60 as recommended, shows the advisory warning and permits saving

#### Scenario: Counter sits in the label row
- **WHEN** a writer views an empty unbounded caption field, types "Hi" and moves focus away
- **THEN** "0 characters" and then "2 characters" are visible on the field's label row throughout, the field occupies no extra line for it, and the control's accessible description includes the count
