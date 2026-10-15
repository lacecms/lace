# admin-media-library Specification

## Purpose

Defines the browser-admin media library for finding, uploading, previewing, reusing, and safely deleting private media through the authenticated API.

## Requirements

### Requirement: Authenticated users can browse and preview media
The `/media` route SHALL show validated media metadata in bounded pages and request subsequent pages using the server's opaque cursor. It SHALL distinguish loading, empty, no-match, and failed list states. It SHALL present items either as a grid of image tiles or as a list, and each item SHALL show its filename and a status indication when it is not active; the list view SHALL additionally show type, dimensions when known, size, uploader display name, upload date, and usage count. It SHALL obtain image previews through the authenticated admin preview boundary, including for unpublished media, without exposing an object key, storage URL, or credential, and SHALL defer loading a preview until its tile or row approaches the viewport. A failed or unavailable preview SHALL leave the item's metadata and a visible fallback accessible. No library surface SHALL show a raw user ID.

#### Scenario: A library has another page
- **WHEN** an authenticated user loads media and the response has a next cursor
- **THEN** the user can request the next page and inspect its items without decoding the cursor

#### Scenario: An unpublished image is previewed
- **WHEN** an authenticated user opens a library item that is not referenced by published content
- **THEN** its image preview is read through the admin preview endpoint and no private storage location appears in the browser response

#### Scenario: Loading or preview fails
- **WHEN** a media page or image preview fails to load
- **THEN** the UI presents an accessible failure or fallback and does not portray it as an empty successful library

#### Scenario: Previews load lazily
- **WHEN** the library renders a page of tiles
- **THEN** each preview image is requested with deferred loading rather than eagerly for off-screen tiles

#### Scenario: The list view shows item facts
- **WHEN** a user switches to the list view
- **THEN** each row shows a thumbnail, filename, type, dimensions or an unknown marker, size, uploader display name, upload date, and usage count

### Requirement: Permitted writers can upload verified media with recoverable feedback
The library SHALL offer upload only to roles allowed to write media. A writer SHALL be able to choose several files at once and SHALL be able to drop files anywhere over the library; the drop target SHALL be visibly indicated while files are dragged over it. The library SHALL identify the accepted size and image-format constraints before submission and SHALL check each file's type and size in the browser before sending it, reporting a local rejection for that file without sending it. Each accepted file SHALL be uploaded to the authenticated media API with its own visible state: queued, uploading with byte progress when the browser reports it, uploaded, or failed with the non-sensitive server error for that file. One file's failure SHALL NOT prevent or undo the other files' uploads. A server-rejected or network-failed file SHALL offer retry; a locally rejected file SHALL require choosing another file. Confirmed uploads SHALL appear as active items in the library without a manual refresh. The API remains authoritative for binary validation and permission.

#### Scenario: An editor uploads an image
- **WHEN** an editor uploads a valid supported image and the API confirms creation
- **THEN** the library shows the uploaded active item, allows preview and reuse, and ends the upload progress state

#### Scenario: An upload is rejected
- **WHEN** a selected file is oversized, has an unsupported format, or the server rejects its bytes
- **THEN** an accessible error is shown for that file, no successful item is added for it, and the user can select another file or retry

#### Scenario: Several files are dropped with mixed results
- **WHEN** an editor drops three files: a valid PNG, a PDF, and a valid JPEG that the server rejects
- **THEN** the PNG is uploaded and reported as uploaded, the PDF is reported as an unsupported type without any request being sent for it, and the JPEG is reported with the server's error and a retry action

#### Scenario: Upload progress is reported per file
- **WHEN** an upload reports that half of a file's bytes have been sent
- **THEN** that file's row shows 50% progress while other files keep their own states

#### Scenario: A viewer opens the library
- **WHEN** a viewer browses the library
- **THEN** read and preview controls are available while upload, drop-zone, and deletion controls are absent

### Requirement: Media deletion remains confirmed and recoverable
The library SHALL offer a writer deletion of an active item from its details panel only after an explicit confirmation dialog, and a retry action for an item in `delete_failed`. It SHALL label `deleting` as pending asynchronous removal, not completed deletion. When the item's usage count is zero, the confirmation SHALL request an ordinary deletion. When the usage count is greater than zero, the panel SHALL decide from the loaded usage: while usage is loading or has failed to load, deletion SHALL be unavailable; when any listed location is used by a published version, or when the usage list is truncated, deletion SHALL be unavailable and the panel SHALL explain that the published versions must stop using the item first, naming each entry whose published version uses it and, for an entry whose draft no longer uses the item, saying that publishing or unpublishing that entry releases the item; when every using entry is listed and uses the item only in its draft, and the writer may also edit content, the panel SHALL offer deletion through a confirmation that names each entry whose draft will lose the item, states that the item is removed from those drafts and not from any published version, warns that a required field may then block publication and that someone editing one of those entries will have to reload, and requests deletion with draft detaching. After an accepted detaching deletion the library SHALL refresh the affected entries' remote state. It SHALL update the visible state only from validated API results, preserve the item and show a non-sensitive error when a request fails, and explain a rejected deletion of referenced media without suggesting the reference was removed; a rejection after some drafts were detached SHALL say that some drafts may already have changed. These controls SHALL be keyboard operable and SHALL return focus predictably when the confirmation closes; API authorization and reference checks remain authoritative.

#### Scenario: An unreferenced item is queued for deletion
- **WHEN** a permitted writer confirms deletion and the API accepts the request
- **THEN** the item is shown as deleting until subsequent remote state confirms its removal

#### Scenario: Deletion is cancelled
- **WHEN** a writer opens the deletion confirmation and cancels it
- **THEN** no deletion request is sent and focus returns to the delete action

#### Scenario: A referenced item cannot be deleted
- **WHEN** the API refuses deletion because content references the item
- **THEN** the item remains in the library and the writer sees the failure without a success claim

#### Scenario: A used item offers guidance instead of deletion
- **WHEN** a writer opens the details of an item whose usage count is 2 and one listed entry's published version uses it
- **THEN** the delete action is unavailable and the panel names that entry as needing its published version to stop using the item first

#### Scenario: A published-only usage explains that publishing releases it
- **WHEN** the only listed entry uses the item in its published version but no longer in its draft
- **THEN** the panel says that publishing or unpublishing that entry releases the item, with a link to the entry

#### Scenario: Draft-only usage is deleted after confirmation
- **WHEN** an editor opens an item used only in the drafts of "Hello" and "About", confirms the dialog that names both entries, and the API accepts the request
- **THEN** the request asks for draft detaching, the item is shown as deleting, and the entries' cached state is refreshed

#### Scenario: Truncated usage cannot be detached
- **WHEN** the item's usage count is 60 and the panel lists 50 entries
- **THEN** the delete action is unavailable and the panel says that more entries use the item than can be changed at once

#### Scenario: A failed deletion is retried
- **WHEN** a permitted writer retries a `delete_failed` item and the API accepts the request
- **THEN** the item returns to a pending deletion state without claiming the object has already been removed

### Requirement: Library search, type filter, sort, and view are URL state
The `/media` route SHALL keep its filename search term, type filter, sort order, and grid or list view in the route's URL search parameters and SHALL request media from the API with exactly the search, type, and sort values. Opening or reloading a library URL with these parameters SHALL restore the same search box contents, type filter, sort order, view, and results. Unsupported type, sort, or view values, and search terms that are blank or longer than the API accepts, SHALL be ignored rather than causing an error, and default values (no search, all types, newest first, grid view) SHALL not be written to the URL. Search input SHALL update the URL after the user pauses typing without adding a history entry per keystroke. Changing the search, type, or sort SHALL restart pagination at the first page; pagination cursors SHALL never be written to the URL. A filtered library with no results SHALL offer to clear the filters instead of claiming the library is empty.

#### Scenario: A filtered library survives a reload
- **WHEN** an editor searches for "hero", selects the PNG filter, sorts by name, switches to the list view, and reloads the page
- **THEN** the URL carries `q=hero`, `type=image/png`, `sort=filename`, and `view=list`, and after the reload the controls and list view are restored and the API is queried with the same search, type, and sort

#### Scenario: Unsupported parameters are ignored
- **WHEN** a user opens `/media?type=image/gif&sort=author&view=cards`
- **THEN** the library loads unfiltered, newest first, in the grid view, without an error

#### Scenario: Changing a filter restarts pagination
- **WHEN** a user has loaded a second page and then changes the type filter
- **THEN** media is requested without a cursor and the first page of the new filter is shown

#### Scenario: No media matches the filters
- **WHEN** the search "zzz" returns no items
- **THEN** the library states that no media matches and offers a control that clears the search and type filter

### Requirement: A details panel describes one media item
Activating a tile or list row SHALL open a details panel for that item, labelled by its filename, that SHALL show a larger preview through the admin preview boundary, type, dimensions or an unknown marker, human-readable size, uploader display name, upload date, and lifecycle status. The panel SHALL load the item's usage from the API and SHALL list each using entry by title with a link to its editor, its content model, its entry status, and each location as an entry field or a block field together with whether the draft, the published version, or both use it. When the API returns fewer entries than the usage count, the panel SHALL say that more entries use the item than are shown. It SHALL distinguish usage loading and failure from "not used". The panel SHALL offer copying the item's public media URL and SHALL explain that the public URL serves the file only once published content uses it; it SHALL confirm a successful copy and report a failed copy. The panel SHALL be keyboard operable, SHALL trap focus while open, SHALL close on Escape, and SHALL return focus to the tile or row that opened it.

#### Scenario: A used image is inspected
- **WHEN** an editor opens the details of an image used in the draft of entry "Launch" through the hero block's image field
- **THEN** the panel lists "Launch" with a link to its editor and a block location for the hero image field marked as used by the draft

#### Scenario: Usage is truncated
- **WHEN** the item's usage count is 60 and the API returns 50 using entries
- **THEN** the panel lists the 50 entries and states that more entries use the item than are shown

#### Scenario: Usage fails to load
- **WHEN** the usage request fails
- **THEN** the panel shows an accessible error for usage and does not claim the item is unused

#### Scenario: The public URL is copied
- **WHEN** a user activates copy URL and the clipboard accepts the text
- **THEN** the item's public media URL is copied and a confirmation is announced

#### Scenario: The panel closes from the keyboard
- **WHEN** a keyboard user opens the details of a tile and presses Escape
- **THEN** the panel closes and focus returns to that tile

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

### Requirement: Media usage names SEO image locations
The media details panel SHALL describe an SEO image usage as
"SEO image · <states>", where states is "Draft", "Published" or "Draft and
published". It SHALL never show block keys.

#### Scenario: Show an SEO image usage
- **WHEN** a media item is the published SEO image of the entry "Hello"
- **THEN** the usage list shows "Hello" with "SEO image · Published"
