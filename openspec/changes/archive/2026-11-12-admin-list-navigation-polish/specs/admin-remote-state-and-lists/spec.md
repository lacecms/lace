## ADDED Requirements

### Requirement: Collection list controls form a compact responsive toolbar
When configured field sorting is available, the collection list SHALL expose a bounded-width field selector and a separate icon button for direction, instead of repeating ascending and descending in each field option. The selector SHALL expose every enabled system and configured field sort, including fields absent from the table. A long selected label SHALL be visually truncated without widening the toolbar, and its full label SHALL be available in the selection menu and to assistive technology. The direction button SHALL expose the current direction in its accessible name and visibly indicate it. Selecting a field SHALL retain the current direction; activating the button SHALL reverse it. Both controls and sortable headers SHALL reflect the same effective sort, including after URL navigation, and retain existing URL, pagination and query semantics.

Search, status filters, field Filters when available, and sort controls SHALL share a responsive toolbar. At a wide viewport with sufficient space they SHALL appear in one row; when space is insufficient they SHALL wrap without page-level horizontal overflow or hiding controls. Long labels SHALL NOT force unrelated controls to wrap when the bounded selector would fit.

#### Scenario: Reverse a configured field sort
- **WHEN** a user changes the direction of an ascending configured field sort using the direction button
- **THEN** the descending sort is requested and reflected in the URL when non-default, the button and sortable header report descending, and pagination restarts

#### Scenario: Select a long field name
- **WHEN** a user selects a field whose label exceeds the selector width
- **THEN** the selected label is truncated visually, its full name remains available in the menu and accessible name, and the control does not expand to its full text width

#### Scenario: Restore and change a sort
- **WHEN** a user opens a URL with a valid descending field sort and selects a different field
- **THEN** the controls first report the URL sort and the newly selected field remains descending

#### Scenario: Narrow viewport
- **WHEN** the toolbar does not fit on one row
- **THEN** its controls wrap, remain keyboard operable and visible, and do not cause page-level horizontal overflow

### Requirement: Collection search guidance is available on demand
The collection search SHALL offer a labelled information control adjacent to the input that reveals the configured searchable fields, the active runtime search budget, and ASCII-only case-insensitive behavior. The information SHALL be available by pointer, keyboard and touch, dismissible by Escape, and accessible to assistive technology. Ordinary guidance SHALL NOT occupy a permanent multi-line block below the input. An invalid search draft SHALL instead show an associated, actionable visible inline error while retaining the draft and last valid query and results; it SHALL NOT issue an invalid request. Existing runtime limits, search matching, debounce and URL behavior remain unchanged.

#### Scenario: Open search guidance
- **WHEN** a user activates the information control by keyboard or touch
- **THEN** the configured searchable fields and active runtime budget and case behavior are available, and Escape dismisses the guidance

#### Scenario: Exceed the runtime pattern budget
- **WHEN** a search draft exceeds the advertised escaped-pattern byte budget
- **THEN** an associated inline error explains the limit, the draft remains editable, and the last valid results and query remain until a valid search is entered
