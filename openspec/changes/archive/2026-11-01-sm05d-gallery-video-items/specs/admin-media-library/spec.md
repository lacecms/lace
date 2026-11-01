## MODIFIED Requirements

### Requirement: Library search, type filter, sort, and view are URL state
The `/media` route SHALL keep its filename search term, type filter, tag filter, sort order, and grid or list view in the route's URL search parameters and SHALL request media from the API with exactly the search, type, tags, and sort values. The tag filter SHALL hold up to five tags combined with AND, entered through the shared tag input in the compact toolbar form defined by the toolbar requirement, shown as removable chips, with an accessible name and description stating that items must have all of them. Opening or reloading a library URL with these parameters SHALL restore the same search box contents, type filter, tag filter, sort order, view, and results. Unsupported type, sort, or view values, search terms that are blank or longer than the API accepts, and tags that are not valid after normalization SHALL be ignored rather than causing an error; tags SHALL be normalized, deduplicated, and sorted in ascending order, and only the first five of that order SHALL be kept. Default values (no search, all types, no tags, newest first, grid view) SHALL not be written to the URL. Search input SHALL update the URL after the user pauses typing without adding a history entry per keystroke. Changing the search, type, tags, or sort SHALL restart pagination at the first page; pagination cursors SHALL never be written to the URL. A filtered library with no results SHALL offer to clear the filters instead of claiming the library is empty, and clearing the filters SHALL clear the search, type, and tags.

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

## ADDED Requirements

### Requirement: Library and picker share a two-row filter toolbar
The `/media` library and the media picker dialog SHALL present their filters in
one toolbar layout. At widths of 40rem and above the first row SHALL hold the
filename search (taking the remaining width), the type filter, and, at the
end, the sort control and, where offered, the grid/list toggle; the second row
SHALL hold the tag filter, its help control and, at the end, "Clear filters"
while any search, type or tag filter is active. The type filter SHALL be a
single bordered segmented group of toggle buttons ("All" and each type) with
the pressed state exposed, styled like the grid/list toggle. Below 40rem the
controls SHALL stack in the same reading order (search, type filter, sort
with the toggle, tag filter with its help control, then "Clear filters"),
without horizontal page scrolling at 320 px, and the type
segments SHALL wrap inside their group when they do not fit. The order of
controls in the accessibility tree and tab sequence SHALL follow this visual
order in both layouts.

The toolbar's tag filter SHALL use the shared tag input in a compact form: a
single bordered field the height of the search input with a leading tag icon,
the chosen tags as removable chips inside the field before the text input
(wrapping inside the field when they do not fit), the placeholder "Filter by
tag", and no visible label. Its combobox SHALL keep the accessible name
"Filter by tags (all must match)" and SHALL be described by the text "Items
must have all tags". Next to the field, an information icon button named
"About tag filters" SHALL show that text in a tooltip on pointer hover and on
keyboard focus, dismissible with Escape without closing a surrounding dialog.
All tag input behavior (suggestions, keyboard handling, normalization, the
five-tag limit message, announcements, Escape inside the picker, uploads
tagged with the active filter) SHALL be unchanged. The details-panel tag
editor SHALL keep its visible label and chip list above the input.

#### Scenario: Wide picker toolbar
- **WHEN** a writer opens the media picker at a dialog width of 56rem and adds the filter tags `project-2026` and `portrait`
- **THEN** search, the type segments and sort share the first row, and the tag field with both chips inside it, the information icon and "Clear filters" share the second row, with no control wrapping onto a third row

#### Scenario: Help text by pointer and keyboard
- **WHEN** a user hovers the information icon, then tabs onto it, then presses Escape inside the picker
- **THEN** the tooltip "Items must have all tags" appears on hover and on focus, Escape hides it, and the picker stays open

#### Scenario: Screen reader hears the rule without the tooltip
- **WHEN** a screen-reader user focuses the tag filter combobox
- **THEN** it is announced as "Filter by tags (all must match)" with the description "Items must have all tags"

#### Scenario: Narrow library
- **WHEN** the library is shown at 320 px wide with two filter tags
- **THEN** search, type segments, sort with the view toggle, the tag field and "Clear filters" are stacked in that order, chips wrap inside the tag field, nothing scrolls horizontally, and axe reports no violations

#### Scenario: Details panel keeps its tag editor
- **WHEN** a writer opens the details panel of a media item
- **THEN** its tag editor shows the visible label "Tags", the chip list and the input as before
