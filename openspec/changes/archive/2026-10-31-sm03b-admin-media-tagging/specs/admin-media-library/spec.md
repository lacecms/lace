## ADDED Requirements

### Requirement: Tags are entered through a keyboard-operable autocomplete input
Every place that accepts media tags in the admin (the details-panel tag editor
and the library and picker tag filters) SHALL use one tag input: the chosen
tags shown as chips, each with a remove control named after its tag, followed
by a text input exposed as a combobox with a list of suggestions. Suggestions
SHALL come from the admin tag catalog, matched by the normalized prefix of the
typed text, SHALL show each tag with its media count, SHALL omit tags already
chosen in that input, and SHALL be requested only after the user pauses typing.
Arrow keys SHALL move through the suggestions, Enter SHALL add the active
suggestion or, without one, the typed text, and a comma SHALL add the typed
text before it. Typed text SHALL be normalized exactly as the API does
(surrounding spaces trimmed, ASCII letters lowercased) before it is added; text
that is not a valid tag SHALL remain in the input with an accessible message
naming the allowed characters (ASCII letters, digits and hyphen, 1–40
characters) and SHALL NOT be added. Adding a tag already chosen SHALL clear the
input without duplicating the chip. Backspace in an empty input SHALL remove
the last chip. Escape SHALL close an open suggestion list without closing the
surrounding panel or dialog; with the list closed, Escape SHALL keep the
surrounding behavior. Each addition and removal SHALL be announced. When the
input reaches its tag limit it SHALL stop accepting text and SHALL state the
limit. A failed or slow suggestion request SHALL NOT block typing and adding
a valid tag, and a failure SHALL be stated without an error dialog.

#### Scenario: A keyboard user adds a suggested tag
- **WHEN** the catalog holds `project-2026` (3 items) and `portrait` (5 items)
  and a keyboard user types "pro", presses ArrowDown, and presses Enter
- **THEN** the suggestions list `project-2026` with its count, the chip
  `project-2026` is added, the input is empty, and the addition is announced

#### Scenario: Typed text is normalized
- **WHEN** a user types " Cover-Shot " and presses Enter
- **THEN** the chip `cover-shot` is added

#### Scenario: Invalid text is explained and kept
- **WHEN** a user types "summer trip" and presses Enter
- **THEN** no chip is added, the text stays in the input, and a message states
  that tags use ASCII letters, digits and hyphens only

#### Scenario: A comma adds the tag before it
- **WHEN** a user types "travel," into the input
- **THEN** the chip `travel` is added and the input is empty

#### Scenario: Backspace removes the last chip
- **WHEN** the input holds the chips `cover` and `travel`, its text is empty,
  and the user presses Backspace
- **THEN** the chip `travel` is removed and the removal is announced

#### Scenario: Escape closes only the suggestions
- **WHEN** the suggestion list of the details-panel tag editor is open and the
  user presses Escape
- **THEN** the suggestion list closes and the details panel stays open

#### Scenario: Suggestions fail to load
- **WHEN** the tag catalog request fails and the user types "cover" and presses
  Enter
- **THEN** the chip `cover` is added and the input states that suggestions are
  unavailable

### Requirement: Uploads receive the active tag filter
When files are uploaded from the library or the picker while a tag filter is
active, each upload SHALL carry exactly the filter's tags, captured when the
file entered the upload queue. While a tag filter is active and the user may
write media, the upload area SHALL state which tags new uploads receive. A
retried upload SHALL use the tags captured for that file, even if the filter
changed since. Uploads made without an active tag filter SHALL carry no tags.
A confirmed upload SHALL refresh the tag suggestions and counts.

#### Scenario: An upload in a filtered library is tagged
- **WHEN** an editor filters the library by `project-2026` and uploads
  "hero.png"
- **THEN** the upload request carries the tag `project-2026`, the upload area
  stated that new uploads receive it, and the uploaded item appears in the
  filtered library

#### Scenario: A retry keeps the original tags
- **WHEN** an upload queued under the filter `travel` fails, the editor clears
  the filter, and retries the upload
- **THEN** the retried request carries the tag `travel`

#### Scenario: A picker upload is tagged
- **WHEN** a writer filters the picker by `cover` and drops "fresh.png" into it
- **THEN** the upload request carries the tag `cover`

#### Scenario: An unfiltered upload has no tags
- **WHEN** an editor uploads a file with no tag filter active
- **THEN** the upload request carries no tags

## MODIFIED Requirements

### Requirement: Library search, type filter, sort, and view are URL state
The `/media` route SHALL keep its filename search term, type filter, tag filter, sort order, and grid or list view in the route's URL search parameters and SHALL request media from the API with exactly the search, type, tags, and sort values. The tag filter SHALL hold up to five tags combined with AND, entered through the shared tag input and shown as removable chips with a label stating that items must have all of them. Opening or reloading a library URL with these parameters SHALL restore the same search box contents, type filter, tag filter, sort order, view, and results. Unsupported type, sort, or view values, search terms that are blank or longer than the API accepts, and tags that are not valid after normalization SHALL be ignored rather than causing an error; tags SHALL be normalized, deduplicated, and sorted in ascending order, and only the first five of that order SHALL be kept. Default values (no search, all types, no tags, newest first, grid view) SHALL not be written to the URL. Search input SHALL update the URL after the user pauses typing without adding a history entry per keystroke. Changing the search, type, tags, or sort SHALL restart pagination at the first page; pagination cursors SHALL never be written to the URL. A filtered library with no results SHALL offer to clear the filters instead of claiming the library is empty, and clearing the filters SHALL clear the search, type, and tags.

#### Scenario: A filtered library survives a reload
- **WHEN** an editor searches for "hero", selects the PNG filter, sorts by name, switches to the list view, and reloads the page
- **THEN** the URL carries `q=hero`, `type=image/png`, `sort=filename`, and `view=list`, and after the reload the controls and list view are restored and the API is queried with the same search, type, and sort

#### Scenario: A tag-filtered library survives a reload
- **WHEN** an editor adds the filter tags `project-2026` and `cover` and reloads the page
- **THEN** the URL carries the tags `cover` and `project-2026`, the filter chips are restored, and the API is queried with both tags

#### Scenario: Unsupported parameters are ignored
- **WHEN** a user opens `/media?type=image/svg+xml&sort=author&view=cards`
- **THEN** the library loads unfiltered, newest first, in the grid view, without an error

#### Scenario: Invalid and excess URL tags are ignored
- **WHEN** a user opens a library URL whose tags are `Cover`, `summer trip`, `a`, `b`, `c`, `d`, and `e`
- **THEN** the library filters by `a`, `b`, `c`, `cover`, and `d` without an error, and the URL is rewritten to those five tags

#### Scenario: Changing a filter restarts pagination
- **WHEN** a user has loaded a second page and then changes the type filter or adds a filter tag
- **THEN** media is requested without a cursor and the first page of the new filter is shown

#### Scenario: The tag filter is limited to five tags
- **WHEN** the library is filtered by five tags
- **THEN** the tag filter accepts no further tag and states that at most five tags can be combined

#### Scenario: No media matches the filters
- **WHEN** the search "zzz" or the filter tag `unused` returns no items
- **THEN** the library states that no media matches and offers a control that clears the search, type filter, and tags

### Requirement: The media picker dialog reuses the library
The admin SHALL offer media selection as a modal dialog labelled by the field it chooses for. The dialog SHALL present active media as the library's image tiles, loaded lazily through the authenticated admin preview boundary, with the library's filename search, type filter, tag filter, sort, and cursor pagination, and SHALL distinguish loading, empty, no-match, and failed list states. Each picker tile SHALL show the item's alt text, truncated to one line with the full text available, or state that the item has no alt text. Its search, type filter, tag filter, and sort SHALL be local to the dialog: they SHALL NOT be written to the URL, SHALL NOT change the `/media` route's state, and SHALL reset to their defaults each time the dialog opens. Items pending or failing deletion SHALL NOT be offered as choices. The dialog SHALL indicate which tile is the field's current selection. Activating a tile SHALL choose that item and close the dialog. For roles allowed to write media, the dialog SHALL accept dropped files and a multi-file "Upload images" picker with the library's per-file type and size checks, progress, server errors, and retry; each confirmed upload SHALL offer to be chosen directly from its upload row, and SHALL appear in the grid when it matches the current filters. Uploading SHALL NOT choose an item. The dialog SHALL be keyboard operable, SHALL trap focus while open, SHALL close without changing the value on Escape or its close control, and SHALL return focus to the field control that remains after closing. Escape pressed while a tag suggestion list is open SHALL close only that list.

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

### Requirement: Writers edit media descriptive metadata in the details panel
The details panel SHALL show the item's alt text, caption, focal point, and
tags. For a user allowed to write media and an item whose status is `active`,
the panel SHALL offer a single-line alt text input limited to 1,000
characters, a multi-line caption input limited to 2,000 characters, the
focal-point control, a tag editor using the shared tag input limited to 20
tags, and explicit Save and Discard actions that are enabled only while a
value differs from the loaded item. Tags SHALL be compared as sets, so
re-adding a removed tag leaves the form unchanged. Save SHALL send only the
changed values through the media metadata update, with an empty text value or
a reset focal point sent as a clear and changed tags sent as the complete
tag set (an empty set clears them), and SHALL guard the update with the
version of the item the form was loaded from. Saving SHALL disable the form
controls, SHALL NOT close the panel, and on success SHALL replace the loaded
item with the returned item, update every displayed copy of the item, refresh
the tag suggestions and counts when the tags changed, and announce the
result: that a site build was requested when the update requested one, and
otherwise that the metadata was saved. A validation or network failure SHALL
keep the typed values and show an accessible error; a tag validation failure
SHALL identify the rejected tag. When the update reports that the item changed
since it was loaded, the panel SHALL load the newer item, show an accessible
conflict message, and offer to discard the local values in favour of the newer
ones or to save the writer's own changes over the newer version; saving over it
SHALL send only the values the writer changed, so values the writer did not
touch keep the newer version's content, and tags the writer changed SHALL
replace the newer version's complete tag set. It SHALL NOT overwrite the newer
version without that choice. Closing the panel while values, including tags,
are unsaved SHALL ask for confirmation, and keeping the edits SHALL leave the
panel open with its values. Users who cannot write media, and items pending or
failing deletion, SHALL see the values read-only without inputs, with the tags
listed as text or stated as none. When the item has no alt text, the panel
SHALL show a non-blocking warning that images using it without their own alt
text are presented as decorative.

#### Scenario: A writer describes an image
- **WHEN** an editor opens the details of an active image, types alt text
  "Red bicycle" and a caption, and activates Save
- **THEN** one metadata update is sent with that alt text and caption and the
  item's current version, the panel shows the saved values with Save disabled,
  and the change is announced

#### Scenario: A writer tags an image
- **WHEN** an editor opens the details of an active image tagged `cover`, adds
  the tag `project-2026`, removes `cover`, and activates Save
- **THEN** one metadata update is sent carrying only the tags
  `["project-2026"]` and the item's current version, the panel shows the chip
  `project-2026` with Save disabled, and it announces that the metadata was
  saved without a site build

#### Scenario: Removing all tags clears them
- **WHEN** a writer removes the only tag of an item and saves
- **THEN** the update carries an empty tag set and the panel shows no tags

#### Scenario: Re-adding a removed tag is not a change
- **WHEN** a writer removes the tag `cover` and adds `cover` again
- **THEN** Save and Discard stay disabled

#### Scenario: The tag editor is limited to 20 tags
- **WHEN** an item has 20 tags
- **THEN** the tag editor accepts no further tag and states that an item can
  have at most 20 tags

#### Scenario: Saving published media requests a build
- **WHEN** the update of an image used by published content reports a queued
  site build
- **THEN** the panel announces that the metadata was saved and a site build
  was requested

#### Scenario: Only changed values are sent
- **WHEN** a writer changes only the caption of an item that already has alt
  text, a focal point, and tags
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

#### Scenario: Saving tags over a newer version replaces its tags
- **WHEN** the writer changed the tags to `cover` and `travel`, another user
  meanwhile tagged the item `archive`, and the writer chooses to save over the
  newer version
- **THEN** the update carries the tags `["cover", "travel"]` and the panel
  shows exactly those tags

#### Scenario: Unsaved values are protected on close
- **WHEN** a writer has changed the alt text or the tags without saving and
  presses Escape with no suggestion list open
- **THEN** a confirmation asks whether to discard the changes, and choosing to
  keep editing leaves the panel open with the typed values

#### Scenario: A viewer sees metadata read-only
- **WHEN** a user whose role is `viewer` opens the details of an item with alt
  text, a caption, and the tag `cover`
- **THEN** the panel shows the values and the tag as text without inputs,
  focal-point dragging, tag removal, or Save

#### Scenario: Items pending deletion are not editable
- **WHEN** an editor opens the details of an item whose status is `deleting`
- **THEN** the metadata and tags are shown read-only
