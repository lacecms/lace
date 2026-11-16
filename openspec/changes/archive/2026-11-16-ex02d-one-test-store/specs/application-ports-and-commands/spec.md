## ADDED Requirements

### Requirement: SQL-backed application fixtures preserve content invariants

Persistence-backed application, REST and MCP tests SHALL use the production
Node SQLite content repository against a fresh in-memory database initialized
from the checked-in migrations. Each test SHALL start with isolated state and
close its connection when it finishes. Portable unit tests MAY use narrow
port doubles. Tests MAY continue to use in-memory infrastructure doubles for
capabilities such as object storage and time. The test repository SHALL
enforce page singleton cardinality, expected-revision conflicts, globally
unique published routes, exactly one mutable draft per committed entry, and
detached immutable publications. It SHALL make a complete draft save, a guarded
publication, a guarded unpublication, a guarded draft revert, and a guarded
duplicate creation appear atomically: failures SHALL leave all stored
aggregates, routes, and public projections unchanged. Returned aggregates and
projections SHALL be detached from future caller mutation.

#### Scenario: A competing page creation is rejected
- **WHEN** the test repository receives a second successful-create request for the same page model
- **THEN** it rejects the request with the stable page-cardinality conflict and retains the original entry unchanged

#### Scenario: Publication retains the previous public value after a draft edit
- **WHEN** the test repository publishes an entry and subsequently saves a changed draft
- **THEN** public reads and build export retain the detached published snapshot while the draft receives exactly one revision increment

#### Scenario: A route conflict does not partially publish
- **WHEN** guarded publication resolves to a route owned by another entry
- **THEN** it rejects the request with the stable route-conflict failure and leaves the candidate draft, existing route owner, and all public projections unchanged

#### Scenario: Unpublication and revert preserve the SQL lifecycle
- **WHEN** the test repository unpublishes an entry or reverts a changed draft
- **THEN** public reads, the published-state version, the draft and the derived
  status agree with the shared repository contract

#### Scenario: Persistence state is isolated between tests
- **WHEN** separate fixtures reuse the same deterministic IDs for models,
  entries, media and actors
- **THEN** each fixture observes only its own commits, including outbox work
  and publication versions, and resources from both fixtures are closed

## MODIFIED Requirements

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
conditional export can be answered without reading a page. Persistence-backed
tests SHALL use the SQLite implementation of these paging, budget and guard
rules.

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

## REMOVED Requirements

### Requirement: In-memory parity doubles preserve content invariants

**Reason:** The production SQLite repository now provides persistence for these tests.
**Migration:** Use the migrated SQLite fixture described in
“SQL-backed application fixtures preserve content invariants.”
