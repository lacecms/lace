## MODIFIED Requirements

### Requirement: Node public mutations are atomic
The Node persistence adapter SHALL atomically publish guarded drafts, replace routes, advance public state, coalesce build work, retain idempotent responses, unpublish guarded publications, revert drafts to guarded publications, create guarded duplicates, delete entries, and mark only unreferenced active media for asynchronous deletion. Each lifecycle command SHALL evaluate its guard and perform every write in one SQLite transaction.

#### Scenario: Route collision rolls back publication
- **WHEN** a publication path is owned by another entry
- **THEN** the adapter returns the stable `CONTENT_ROUTE_CONFLICT` failure and
  routes and public projections remain unchanged

#### Scenario: Media deletion is asynchronous
- **WHEN** eligible media is marked for deletion
- **THEN** it becomes deleting with an independent event and no binary object deletion

#### Scenario: Unpublication is one transaction
- **WHEN** the Node adapter unpublishes a guarded publication
- **THEN** route removal, pointer clearing, snapshot deletion with cascades,
  version increment, build coalescing, and the idempotency record commit
  together or not at all

#### Scenario: Revert copies the publication with set-based statements
- **WHEN** the Node adapter reverts a draft
- **THEN** it replaces the draft's blocks and media references with copies of
  the published rows and updates both snapshot revisions in one transaction
