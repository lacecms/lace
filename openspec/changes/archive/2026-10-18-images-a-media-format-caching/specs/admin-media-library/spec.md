## MODIFIED Requirements

### Requirement: Library search, type filter, sort, and view are URL state
The `/media` route SHALL keep its filename search term, type filter, sort order, and grid or list view in the route's URL search parameters and SHALL request media from the API with exactly the search, type, and sort values. Opening or reloading a library URL with these parameters SHALL restore the same search box contents, type filter, sort order, view, and results. Unsupported type, sort, or view values, and search terms that are blank or longer than the API accepts, SHALL be ignored rather than causing an error, and default values (no search, all types, newest first, grid view) SHALL not be written to the URL. Search input SHALL update the URL after the user pauses typing without adding a history entry per keystroke. Changing the search, type, or sort SHALL restart pagination at the first page; pagination cursors SHALL never be written to the URL. A filtered library with no results SHALL offer to clear the filters instead of claiming the library is empty.

#### Scenario: A filtered library survives a reload
- **WHEN** an editor searches for "hero", selects the PNG filter, sorts by name, switches to the list view, and reloads the page
- **THEN** the URL carries `q=hero`, `type=image/png`, `sort=filename`, and `view=list`, and after the reload the controls and list view are restored and the API is queried with the same search, type, and sort

#### Scenario: Unsupported parameters are ignored
- **WHEN** a user opens `/media?type=image/svg+xml&sort=author&view=cards`
- **THEN** the library loads unfiltered, newest first, in the grid view, without an error

#### Scenario: Changing a filter restarts pagination
- **WHEN** a user has loaded a second page and then changes the type filter
- **THEN** media is requested without a cursor and the first page of the new filter is shown

#### Scenario: No media matches the filters
- **WHEN** the search "zzz" returns no items
- **THEN** the library states that no media matches and offers a control that clears the search and type filter

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

#### Scenario: An editor uploads an animated GIF
- **WHEN** an editor drops a valid 4 MiB animated GIF into the library
- **THEN** it passes the local type check, is uploaded, and its item is
  labelled GIF and appears under the GIF type filter
