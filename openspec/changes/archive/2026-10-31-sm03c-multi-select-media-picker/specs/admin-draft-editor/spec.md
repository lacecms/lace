## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Eligible media lists add several items from the library at once
A list SHALL be an eligible media list when its item descriptor is a media
field, or when its item descriptor is a group whose direct fields include
exactly one media field and that field is required; the group's other fields
MAY be of any type. Eligibility SHALL be derived from the validated field
metadata alone and SHALL apply to lists at any depth of model, page, global
and block data, including the built-in `gallery` block's `images` list. A
group with no media field, with an optional media field, or with more than
one direct media field SHALL NOT make its list eligible.

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

#### Scenario: Ineligible lists keep the ordinary Add
- **WHEN** a list's item group has two media fields, or a single optional media field
- **THEN** Add appends one open item with its starting value and does not open the media picker

#### Scenario: Cancelling adds nothing
- **WHEN** a writer activates Add on a gallery, selects images and presses Escape
- **THEN** the list and the draft's dirty state are unchanged and focus is on Add
