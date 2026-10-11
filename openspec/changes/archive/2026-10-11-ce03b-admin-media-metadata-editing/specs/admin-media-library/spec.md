## ADDED Requirements

### Requirement: Writers edit media descriptive metadata in the details panel
The details panel SHALL show the item's alt text, caption, and focal point. For
a user allowed to write media and an item whose status is `active`, the panel
SHALL offer a single-line alt text input limited to 1,000 characters, a
multi-line caption input limited to 2,000 characters, the focal-point control,
and explicit Save and Discard actions that are enabled only while a value
differs from the loaded item. Save SHALL send only the changed values through
the media metadata update, with an empty text value or a reset focal point sent
as a clear, and SHALL guard the update with the version of the item the form
was loaded from. Saving SHALL disable the form controls, SHALL NOT close the
panel, and on success SHALL replace the loaded item with the returned item,
update every displayed copy of the item, and announce the result: that a site
build was requested when the update requested one, and otherwise that the
metadata was saved. A validation or network failure SHALL keep the typed values
and show an accessible error. When the update reports that the item changed
since it was loaded, the panel SHALL load the newer item, show an accessible
conflict message, and offer to discard the local values in favour of the newer
ones or to save the writer's own changes over the newer version; saving over it
SHALL send only the values the writer changed, so values the writer did not
touch keep the newer version's content. It SHALL NOT overwrite the newer
version without that choice. Closing the panel while values are
unsaved SHALL ask for confirmation, and keeping the edits SHALL leave the panel
open with its values. Users who cannot write media, and items pending or
failing deletion, SHALL see the values read-only without inputs. When the item
has no alt text, the panel SHALL show a non-blocking warning that images using
it without their own alt text are presented as decorative.

#### Scenario: A writer describes an image
- **WHEN** an editor opens the details of an active image, types alt text
  "Red bicycle" and a caption, and activates Save
- **THEN** one metadata update is sent with that alt text and caption and the
  item's current version, the panel shows the saved values with Save disabled,
  and the change is announced

#### Scenario: Saving published media requests a build
- **WHEN** the update of an image used by published content reports a queued
  site build
- **THEN** the panel announces that the metadata was saved and a site build
  was requested

#### Scenario: Only changed values are sent
- **WHEN** a writer changes only the caption of an item that already has alt
  text and a focal point
- **THEN** the update carries only the caption

#### Scenario: Clearing alt text
- **WHEN** a writer empties the alt text input of an item with alt text and
  saves
- **THEN** the update clears the alt text and the missing-alt warning appears

#### Scenario: A concurrent change is detected
- **WHEN** another user changed the item after the panel loaded it and the
  writer saves
- **THEN** the panel shows a conflict message with the newer values available,
  keeps the writer's values, and writes nothing until the writer chooses to
  discard them or save them over the newer version

#### Scenario: Saving over a newer version keeps untouched values
- **WHEN** the writer changed only the caption, another user changed the alt
  text meanwhile, and the writer chooses to save over the newer version
- **THEN** the update carries only the caption with the newer version's tag,
  and the panel shows the other user's alt text with the writer's caption

#### Scenario: Unsaved values are protected on close
- **WHEN** a writer has changed the alt text without saving and presses Escape
- **THEN** a confirmation asks whether to discard the changes, and choosing to
  keep editing leaves the panel open with the typed alt text

#### Scenario: A viewer sees metadata read-only
- **WHEN** a user whose role is `viewer` opens the details of an item with alt
  text and a caption
- **THEN** the panel shows both values as text without inputs, focal-point
  dragging, or Save

#### Scenario: Items pending deletion are not editable
- **WHEN** an editor opens the details of an item whose status is `deleting`
- **THEN** the metadata is shown read-only

### Requirement: The focal point is set by pointer or keyboard
For an editable item, the panel preview SHALL act as a focal-point control.
Clicking or dragging on the displayed image SHALL place the focal point at the
pointer position, expressed as fractions of the displayed image's width and
height from its top-left corner and clamped to 0–1. The control SHALL show a
marker at the current point and SHALL expose it as one keyboard-focusable
element whose accessible name and value state the point as percentages from
the left and top, or that no focal point is set and the image is centred. With
the marker focused, the arrow keys SHALL move the point by 1 percentage point
and Shift with an arrow key by 10 percentage points, starting from the centre
when no point is set, and SHALL NOT scroll the panel. A reset action SHALL
clear the focal point. Focal-point changes SHALL be local form values saved
with the other metadata. A read-only panel SHALL show the marker without
accepting pointer or keyboard changes.

#### Scenario: Clicking sets the focal point
- **WHEN** a writer clicks the preview at three quarters of its width and one
  quarter of its height
- **THEN** the focal point becomes 75 % from the left and 25 % from the top,
  and Save becomes available

#### Scenario: Dragging moves the focal point
- **WHEN** a writer presses on the preview, drags to its bottom-right corner
  and beyond, and releases
- **THEN** the focal point follows the pointer and ends at 100 % from the left
  and 100 % from the top

#### Scenario: A keyboard-only user sets the focal point
- **WHEN** a keyboard user tabs to the focal-point marker of an item without a
  focal point, presses Right Arrow twice and Shift+Up Arrow once, and saves
- **THEN** the announced point is 52 % from the left and 40 % from the top and
  the update carries x 0.52 and y 0.4

#### Scenario: The focal point is reset
- **WHEN** a writer activates the reset action on an item with a focal point
  and saves
- **THEN** the update clears the focal point and the control states that the
  image is centred

## MODIFIED Requirements

### Requirement: The media picker dialog reuses the library
The admin SHALL offer media selection as a modal dialog labelled by the field it chooses for. The dialog SHALL present active media as the library's image tiles, loaded lazily through the authenticated admin preview boundary, with the library's filename search, type filter, sort, and cursor pagination, and SHALL distinguish loading, empty, no-match, and failed list states. Each picker tile SHALL show the item's alt text, truncated to one line with the full text available, or state that the item has no alt text. Its search, type filter, and sort SHALL be local to the dialog: they SHALL NOT be written to the URL, SHALL NOT change the `/media` route's state, and SHALL reset to their defaults each time the dialog opens. Items pending or failing deletion SHALL NOT be offered as choices. The dialog SHALL indicate which tile is the field's current selection. Activating a tile SHALL choose that item and close the dialog. For roles allowed to write media, the dialog SHALL accept dropped files and a multi-file "Upload images" picker with the library's per-file type and size checks, progress, server errors, and retry; each confirmed upload SHALL offer to be chosen directly from its upload row, and SHALL appear in the grid when it matches the current filters. Uploading SHALL NOT choose an item. The dialog SHALL be keyboard operable, SHALL trap focus while open, SHALL close without changing the value on Escape or its close control, and SHALL return focus to the field control that remains after closing.

#### Scenario: A keyboard user chooses media
- **WHEN** a keyboard user opens the picker from a media field, moves to a tile, and presses Enter
- **THEN** the dialog closes, the field holds that item, and focus is on the field's Replace action

#### Scenario: The picker is dismissed
- **WHEN** a user opens the picker and presses Escape
- **THEN** the dialog closes, the field value is unchanged, and focus returns to the control that opened it

#### Scenario: Picker filters are local
- **WHEN** a user filters the picker to PNG images, closes it, and opens it again
- **THEN** the URL never carried the filter and the reopened picker shows all types, newest first

#### Scenario: Picker tiles show alt text
- **WHEN** the picker lists an item with alt text "Red bicycle" and an item without alt text
- **THEN** the first tile shows "Red bicycle" and the second states that it has no alt text

#### Scenario: An uploaded item is chosen from its upload row
- **WHEN** a writer uploads "fresh.png" in a picker filtered to JPEG images and activates the upload row's use action
- **THEN** the dialog closes and the field holds the uploaded item even though the grid did not show it

#### Scenario: A viewer opens the picker
- **WHEN** the picker dialog is open for a user whose role is `viewer`
- **THEN** active items can be browsed and previewed while upload and drop-zone controls are absent

#### Scenario: A viewer sees a media field in the read-only editor
- **WHEN** a viewer opens an entry whose media field holds an item
- **THEN** the field shows that item's thumbnail and filename without Choose media, Replace, or Remove, and the picker cannot be opened from it

#### Scenario: Items pending deletion are not offered
- **WHEN** a picker page contains an active item and an item whose status is `deleting`
- **THEN** only the active item is shown as a choice
