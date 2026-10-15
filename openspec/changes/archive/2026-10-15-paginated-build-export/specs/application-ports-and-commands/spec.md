## ADDED Requirements

### Requirement: Build export content is read in version-guarded pages
The public content read port SHALL export build content one page at a time,
replacing the single complete-export read. A page request SHALL carry:

- an optional opaque continuation cursor;
- an entry limit from 1 to 100.

A page result SHALL carry:

- the published-state version;
- the routed published entries ordered by path, each with the active media
  its published snapshot delivers;
- on the first page only, every published global with its delivered media;
- a continuation cursor exactly when further entries remain.

A page SHALL respect the entry limit and a fixed stored-JSON byte budget. It
SHALL hold at least one entry whenever entries remain after the cursor. Every
page SHALL reflect a single published state.

The port SHALL fail with the stable `BUILD_EXPORT_VERSION_CHANGED` domain
error, carrying the expected and actual versions, when either of these holds:

- the cursor's version is not the current published-state version;
- a publication changes the published state while the page is read.

An invalid or foreign cursor SHALL fail as a validation failure. The
published-state version read SHALL remain available separately, so a
conditional export can be answered without reading a page. The in-memory
parity double SHALL implement the same paging, budget and guard rules.

#### Scenario: A caller follows export pages
- **WHEN** an application caller requests the first page with limit 2 for
  five routed entries and passes each returned cursor back
- **THEN** it receives entries in path order on three pages of 2, 2 and 1,
  globals only on the first page, and no cursor on the last page

#### Scenario: A stale export cursor is refused
- **WHEN** a caller passes a cursor issued at version 4 after a publication
  advanced the published state to version 5
- **THEN** the port fails with `BUILD_EXPORT_VERSION_CHANGED` carrying 4 and
  5, and returns no entries
