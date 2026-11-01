## MODIFIED Requirements

### Requirement: The media picker dialog reuses the library
The admin SHALL offer media selection as a modal dialog labelled by the field it chooses for. The dialog SHALL open in single mode unless its caller requests the multiple mode defined by the multiple-selection requirement; the behavior in this requirement applies to both modes except where it names single mode. The dialog SHALL present active media as the library's image tiles, loaded lazily through the authenticated admin preview boundary, with the library's filename search, type filter, tag filter, sort, and cursor pagination, and SHALL distinguish loading, empty, no-match, and failed list states. Each picker tile SHALL show the item's alt text, truncated to one line with the full text available, or state that the item has no alt text. Its search, type filter, tag filter, and sort SHALL be local to the dialog: they SHALL NOT be written to the URL, SHALL NOT change the `/media` route's state, and SHALL reset to their defaults each time the dialog opens. Items pending or failing deletion SHALL NOT be offered as choices. In single mode the dialog SHALL indicate which tile is the field's current selection, and activating a tile SHALL choose that item and close the dialog. For roles allowed to write media, the dialog SHALL accept dropped files and a multi-file "Upload images" picker with the library's per-file type and size checks, progress, server errors, and retry; in single mode each confirmed upload SHALL offer to be chosen directly from its upload row, and SHALL appear in the grid when it matches the current filters. In single mode uploading SHALL NOT choose an item. The dialog SHALL be keyboard operable, SHALL trap focus while open, SHALL close without changing the value on Escape or its close control, and SHALL return focus to the field control that remains after closing. Escape pressed while a tag suggestion list is open SHALL close only that list.

#### Scenario: A keyboard user chooses media
- **WHEN** a keyboard user opens the picker from a media field, moves to a tile, and presses Enter
- **THEN** the dialog closes, the field holds that item, and focus is on the field's Replace action

#### Scenario: The picker is dismissed
- **WHEN** a user opens the picker and presses Escape
- **THEN** the dialog closes, the field value is unchanged, and focus returns to the control that opened it

#### Scenario: Picker filters are local
- **WHEN** a user filters the picker to PNG images and the tag `cover`, closes it, and opens it again
- **THEN** the URL never carried the filters and the reopened picker shows all types and tags, newest first

#### Scenario: The picker is filtered by tag
- **WHEN** a user adds the filter tag `project-2026` in the picker
- **THEN** media is requested with that tag from the first page and only matching active items are offered

#### Scenario: Picker tiles show alt text
- **WHEN** the picker lists an item with alt text "Red bicycle" and an item without alt text
- **THEN** the first tile shows "Red bicycle" and the second states that it has no alt text

#### Scenario: An uploaded item is chosen from its upload row
- **WHEN** a writer uploads "fresh.png" in a picker filtered to JPEG images and activates the upload row's use action
- **THEN** the dialog closes and the field holds the uploaded item even though the grid did not show it

#### Scenario: A viewer opens the picker
- **WHEN** the picker dialog is open for a user whose role is `viewer`
- **THEN** active items can be browsed, filtered by tag, and previewed while upload and drop-zone controls are absent

#### Scenario: A viewer sees a media field in the read-only editor
- **WHEN** a viewer opens an entry whose media field holds an item
- **THEN** the field shows that item's thumbnail and filename without Choose media, Replace, or Remove, and the picker cannot be opened from it

#### Scenario: Items pending deletion are not offered
- **WHEN** a picker page contains an active item and an item whose status is `deleting`
- **THEN** only the active item is shown as a choice

## ADDED Requirements

### Requirement: The media picker offers a multiple selection mode
In multiple mode the picker dialog SHALL let the user build an ordered selection of active media and confirm it once. The dialog's title SHALL name the list it adds to, and its description SHALL state that activating images selects them. Activating a tile by pointer, Enter or Space SHALL toggle that item in the selection without closing the dialog. Each tile SHALL expose its selected state to assistive technology as a pressed toggle, keep the filename as its accessible name, and show selected tiles with a visible check and their one-based position in the selection. The selection SHALL keep the order in which items were selected; deselecting an item SHALL remove it and renumber the items after it. The selection SHALL be held by media identifier and SHALL survive search, type, tag and sort changes and loading more pages within the same opening, including items not currently shown; it SHALL start empty each time the dialog opens.

The dialog SHALL show a polite live status stating how many items are selected and, when the caller supplies a capacity, how many more can be selected, and SHALL offer Clear selection while the selection is not empty. The dialog SHALL never let the selection exceed the capacity supplied by its caller. When the selection reaches the capacity, tiles that are not selected SHALL be unavailable for selection while staying focusable, SHALL be described by the reason, and the status SHALL state that the limit is reached and name the limit's cause as supplied by the caller; deselecting an item SHALL make selection available again.

When the caller supplies the media identifiers already present in its target, each tile for such an item SHALL say that it is already in that target, naming it (for example "Already in Images"), and SHALL remain selectable.

For roles allowed to write media, uploads in multiple mode SHALL behave as in single mode except that a confirmed upload SHALL be appended to the selection automatically, in the order uploads are confirmed, while capacity remains. A confirmed upload that does not fit SHALL stay unselected and its row SHALL say that the selection limit is reached. Each confirmed upload row SHALL offer a toggle that selects or deselects its item under the same capacity rule, whether or not the grid shows it. Rejected and failed uploads SHALL never be selected.

The dialog SHALL offer a confirm action naming the count, for example "Add 12 images" or "Add 1 image", which SHALL be disabled while the selection is empty, and a Cancel action. Confirming SHALL hand the selected items to the caller in selection order and close the dialog. Escape, Cancel and the close control SHALL close the dialog, discard the selection and change nothing; a confirmed upload stays in the library either way. Multiple mode SHALL NOT mark any tile as the current choice. Viewers SHALL NOT be offered multiple mode.

#### Scenario: Toggling builds an ordered selection
- **WHEN** a writer activates the tiles "c.jpg", "a.jpg" and "b.jpg" in that order, then activates "a.jpg" again
- **THEN** "c.jpg" is marked 1, "b.jpg" is marked 2, "a.jpg" is not selected, the status reads that 2 items are selected and the confirm action reads "Add 2 images"

#### Scenario: A keyboard user selects with Space and Enter
- **WHEN** a keyboard user focuses a tile, presses Space, moves to another tile and presses Enter
- **THEN** both tiles are reported as pressed, the dialog stays open and focus stays on the last activated tile

#### Scenario: Selection survives filtering
- **WHEN** a writer selects two images, filters the picker by the tag `project-2026` and selects three matching images
- **THEN** the status reports 5 selected and confirming hands over all five in selection order, including the two not shown by the filter

#### Scenario: The capacity is reached
- **WHEN** the caller supplies a capacity of 3 because the list allows at most 50 items and holds 47, and the writer selects three images
- **THEN** the status states that the limit is reached and that Images allows at most 50 items, other tiles cannot be selected and describe why, and deselecting one image makes selection available again

#### Scenario: Uploads join the selection
- **WHEN** a writer with one selected image uploads "one.png" and "two.png", which are confirmed in that order
- **THEN** both are selected after the first image in confirmation order and the confirm action reads "Add 3 images"

#### Scenario: An upload does not fit
- **WHEN** the selection is at capacity and an upload is confirmed
- **THEN** the uploaded item is not selected, its row says that the selection limit is reached, and the item can be selected after another item is deselected

#### Scenario: Already-used media is marked
- **WHEN** the target list already holds "hero.jpg" and the writer opens the picker
- **THEN** the "hero.jpg" tile says "Already in Images" and can still be selected

#### Scenario: Cancelling discards the selection
- **WHEN** a writer selects four images and presses Escape
- **THEN** the dialog closes, nothing is handed to the caller, and reopening the picker starts with an empty selection and default filters

#### Scenario: The confirm action requires a selection
- **WHEN** a writer opens the picker in multiple mode without selecting anything
- **THEN** the confirm action is disabled and the status reads that no items are selected
