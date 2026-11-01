## ADDED Requirements

### Requirement: Conditional fields are shown and hidden reactively
The editor SHALL apply the `visibility` rules of validated metadata to model
fields, every present group value, every list item and each block's data.
Each occurrence SHALL evaluate only its own controller value: the controller's
current form value when it holds one, otherwise the controller's declared
default; a cleared or absent controller without a default SHALL hide its
targets. A target SHALL be shown exactly when its rule matches; a field without
a rule SHALL always be shown. A hidden group or list target SHALL hide its
whole subtree. Visibility SHALL update as soon as the controller value changes,
without saving.

Hidden targets SHALL stay mounted but SHALL be absent from the accessibility
tree and the tab order, and SHALL keep their values, local and transient
state, rich-text editing identity, media selection, list item identities and
open or collapsed state. Changing a controller SHALL NOT clear, reset, reorder
or normalize a target's value, and SHALL change the draft's dirty state only
through the controller's own value; switching it back SHALL show the earlier
target values again. The next save SHALL submit hidden values unchanged.
Layout sections and tabs whose fields are all hidden SHALL be hidden; when the
selected tab becomes hidden, the first tab with a shown field SHALL be
selected. Viewers SHALL see the same fields a writer would see for the same
values, without mutation affordances. Required markers, "Not set · Required
for publication" notes and other publication guidance SHALL appear only on
shown fields. Block settings SHALL keep their existing `settingsVisibility`
behavior.

#### Scenario: Switch a list item between kinds
- **WHEN** a list item group declares select `kind` (`image`, `video`, default `image`) with `media` and `alt` visible for `image` and `videoUrl` visible for `video`, and a writer opens a new item and selects `video`
- **THEN** `media` and `alt` disappear, `videoUrl` appears directly, and no save request is sent

#### Scenario: Toggle back restores the hidden value
- **WHEN** a writer chooses media `a.jpg` for an image item, switches `kind` to `video`, types a video URL, then switches back to `image`
- **THEN** the item shows `a.jpg` again, the draft is dirty only because of the changed values, and saving submits `kind`, `media` and the typed `videoUrl`

#### Scenario: Items evaluate independently
- **WHEN** a list holds an `image` item followed by a `video` item
- **THEN** the first item shows only its image fields and the second only its video fields, and changing one item's `kind` does not change the other's fields

#### Scenario: Absent controller without a default
- **WHEN** block data declares optional select `layout` without a default and `columns` visible for `grid`, and the block has no `layout`
- **THEN** `columns` is hidden until the writer selects `grid`, and clearing `layout` again hides it

#### Scenario: Boolean controller in model fields
- **WHEN** a model declares boolean `hasCta` and `ctaUrl` visible for `true`, and a writer turns `hasCta` on and then off
- **THEN** `ctaUrl` appears and disappears, keeps its typed value, and is not reachable by Tab while hidden

#### Scenario: A tab with only hidden fields
- **WHEN** a model layout puts `videoUrl` and `poster` alone in a *Video* tab and both are hidden
- **THEN** the *Video* tab is not shown, and it reappears with its earlier values when the controller makes them visible

#### Scenario: A viewer sees applicable fields
- **WHEN** a viewer opens an entry whose list holds an `image` item and a `video` item
- **THEN** each item shows only its applicable fields as read-only controls

### Requirement: Problems on conditional fields stay reachable
Validation problems SHALL remain reachable under visibility rules. A hidden
target holding a value with a draft validation problem, whether found locally
or reported by the server, SHALL be shown with its error and an accessible
note that names the controller and the values under which the field applies,
so the writer can correct or clear the value without changing the controller;
when the problem is resolved and the rule still does not match, the field
SHALL be hidden again. A publication-only problem reported for a target that
is now hidden SHALL NOT be shown on that field, SHALL NOT appear in the
validation summary, SHALL NOT mark its tab, section or list item as having
problems, and SHALL NOT keep its block card open; it SHALL reappear if the
controller makes the target visible again before the next validation replaces
it. Summary entries SHALL keep the existing reading order, labels and one-based
positions and SHALL list only problems on shown fields, on fields shown to
resolve a problem, and on containers or unknown paths as today. Activating an
entry SHALL reveal the containing block, tab, section and list item and focus
the exact control. Hidden-block rules SHALL be unchanged.

#### Scenario: A stale publication error disappears with its field
- **WHEN** publishing a `video` item without `videoUrl` reports `missing_required_field` at its `videoUrl`, and the writer switches the item's `kind` to `image`
- **THEN** the summary no longer lists the `videoUrl` problem, the item's row and the block card show no problem for it, and switching back to `video` shows the problem again until the next validation

#### Scenario: A hidden invalid value stays fixable
- **WHEN** a writer types `not a url` into `videoUrl`, switches `kind` to `image` and saves
- **THEN** the save is refused, `videoUrl` stays shown under the image fields with its error and a note that it applies when Kind is Video, and clearing the value lets the save succeed and hides the field

#### Scenario: Summary reveals a nested conditional field
- **WHEN** the server reports a draft problem at `/blocks/0/data/images/2/videoUrl` while block 1 is collapsed, item 3 is collapsed and item 3's `kind` is `video`
- **THEN** activating the summary entry opens the block's Content tab and item 3 and focuses its `videoUrl` control with the error

### Requirement: Summaries and previews use applicable values only
Collapsed list rows, block card summaries, leaf previews, the media-selected
fallback and the "No alt" indicator SHALL be derived only from fields shown
under the occurrence's current visibility. A hidden target's value SHALL NOT
supply a primary or secondary line, a thumbnail or an indicator. When the
list's `itemLabel` names a hidden target, the row SHALL fall back to the
existing summary order over shown fields. Summaries SHALL update when a
controller changes and SHALL NOT dirty the draft.

#### Scenario: A video item is not labelled by its stale image
- **WHEN** a list item holds `kind: "video"`, a hidden media `a.jpg` without alt text, a hidden blank `alt` and the caption "Studio walk-through"
- **THEN** the collapsed row shows "Studio walk-through" and no thumbnail and no "No alt" indicator

#### Scenario: Switching kind updates the row
- **WHEN** a writer switches that item's `kind` back to `image` and collapses it
- **THEN** the row shows the `a.jpg` thumbnail, the caption and the "No alt" indicator

## MODIFIED Requirements

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
