## MODIFIED Requirements

### Requirement: Authenticated users can browse and preview media
The `/media` route SHALL show validated media metadata in bounded pages and request subsequent pages using the server's opaque cursor. It SHALL distinguish loading, empty, no-match, and failed list states. It SHALL present items either as a grid of image tiles or as a list, and each item SHALL show its filename and a status indication when it is not active; the list view SHALL additionally show type, dimensions when known, size, uploader display name, upload date, and usage count. It SHALL obtain grid and list thumbnails through the authenticated admin thumbnail endpoint, including for unpublished media, without exposing an object key, storage URL, or credential. A thumbnail SHALL load when its tile or row approaches the viewport and SHALL show the first frame of a GIF as a still image. A failed or unavailable thumbnail SHALL leave the item's metadata, open action and a visible fallback accessible. Browsing and thumbnail failure SHALL NOT initiate an original image request. No library surface SHALL show a raw user ID.

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
- **THEN** each thumbnail is requested with deferred loading rather than eagerly for off-screen tiles

#### Scenario: The list view shows item facts
- **WHEN** a user switches to the list view
- **THEN** each row shows a thumbnail, filename, type, dimensions or an unknown marker, size, uploader display name, upload date, and usage count

#### Scenario: An existing GIF appears in grid and list
- **WHEN** a reader browses an existing unpublished animated GIF in either view
- **THEN** its thumbnail shows the first frame without animation and without requesting the original

### Requirement: A details panel describes one media item
Activating a tile or list row SHALL open a details panel for that item, labelled by its filename, that SHALL show a larger preview of the original file through the authenticated admin preview endpoint, type, dimensions or an unknown marker, human-readable size, uploader display name, upload date, and lifecycle status. The panel SHALL load the item's usage from the API and SHALL list each using entry by title with a link to its editor, its content model, its entry status, and each location as an entry field or a block field together with whether the draft, the published version, or both use it. When the API returns fewer entries than the usage count, the panel SHALL say that more entries use the item than are shown. It SHALL distinguish usage loading and failure from "not used". The panel SHALL offer copying the item's public media URL and SHALL explain that the public URL serves the file only once published content uses it; it SHALL confirm a successful copy and report a failed copy. The panel SHALL be keyboard operable, SHALL trap focus while open, SHALL close on Escape, and SHALL return focus to the tile or row that opened it.

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

#### Scenario: An animated GIF is opened
- **WHEN** a reader activates a grid tile or list row for an active animated GIF
- **THEN** the details panel requests the original GIF through the authenticated preview endpoint and shows its animation

### Requirement: The media picker dialog reuses the library
The admin SHALL offer media selection as a modal dialog labelled by the field it chooses for. The dialog SHALL open in single mode unless its caller requests the multiple mode defined by the multiple-selection requirement; the behavior in this requirement applies to both modes except where it names single mode. The dialog SHALL present active media as the library's image tiles, with the same lazy authenticated thumbnails, filename search, type filter, tag filter, sort, and 24-item cursor batches, and SHALL distinguish loading, empty, no-match, and failed list states. Each picker tile SHALL show the item's alt text, truncated to one line with the full text available, or state that the item has no alt text. Its search, type filter, tag filter, and sort SHALL be local to the dialog: they SHALL NOT be written to the URL, SHALL NOT change the `/media` route's state, and SHALL reset to their defaults each time the dialog opens. Items pending or failing deletion SHALL NOT be offered as choices. In single mode the dialog SHALL indicate which tile is the field's current selection, and activating a tile SHALL choose that item and close the dialog. For roles allowed to write media, the dialog SHALL accept dropped files and a multi-file "Upload images" picker with the library's per-file type and size checks, progress, server errors, and retry; in single mode each confirmed upload SHALL offer to be chosen directly from its upload row, and SHALL appear in the grid when it matches the current filters. In single mode uploading SHALL NOT choose an item. The dialog SHALL be keyboard operable, SHALL trap focus while open, SHALL close without changing the value on Escape or its close control, and SHALL return focus to the field control that remains after closing. Escape pressed while a tag suggestion list is open SHALL close only that list.

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

### Requirement: Media browsing loads explicit batches of 24
The Media library and picker SHALL request 24 results per API page. A fresh visit to the library, an opening of the picker or a new effective filter, search or sort SHALL start with the first page. The library's grid and list SHALL share the same loaded results. When the API provides a next cursor, the surface SHALL show a centered, visibly emphasized **Load more media** button immediately below the results. Activation SHALL request the next cursor and append returned eligible items in API order, preserving displayed items and existing selections. Continuation SHALL require activation and SHALL use cursor availability to determine whether more results can be requested.

While continuation is pending, the button SHALL communicate loading and prevent duplicate activation. On success, the UI SHALL announce the updated displayed count. If focus is still on the continuation control, focus SHALL move to the first appended result or a results status if the control disappears and no result is appended. If focus has moved elsewhere, the append SHALL preserve it. On failure, the UI SHALL retain the current items, announce the error and offer retry for the same continuation. When the last page is reached, the button SHALL disappear and the displayed count SHALL remain visible.

#### Scenario: A large library opens
- **WHEN** a reader opens a library with at least 49 matching items
- **THEN** the client requests 24 on the initial page and shows those items with a centered continuation button
- **THEN** scrolling without activating the button does not request the next page

#### Scenario: A reader loads and retries a batch
- **WHEN** the first continuation fails and the reader retries
- **THEN** the initial items remain usable and one request is sent for the same cursor
- **THEN** success appends the next eligible items and announces the new displayed count

#### Scenario: Keyboard focus follows a newly loaded batch
- **WHEN** a keyboard user activates the button and leaves focus there until a batch arrives
- **THEN** focus moves to the first appended item without activating it

#### Scenario: A picker page has no selectable items
- **WHEN** a continuation returns only items pending or failing deletion and another cursor exists
- **THEN** the picker keeps its selection and continuation control and lets the reader request the next batch

#### Scenario: A library switches layout after loading more
- **WHEN** a reader has loaded two batches in grid view and switches to list view
- **THEN** the same results appear in the same order without resetting their pagination

#### Scenario: A picker opens after other results were expanded
- **WHEN** a reader opens the picker after appending more results in the library or a previous picker session
- **THEN** the new picker starts with the first page and its own continuation control
