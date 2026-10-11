## ADDED Requirements

### Requirement: Node media metadata updates are atomic
The Node SQLite adapter SHALL update media metadata in one transaction. The
update SHALL change the row only while it is `active` and its `updated_at`
equals the expected value. In the same transaction, and only when that update
changed the row and a current published snapshot references the item, the
adapter SHALL increment the published-content version and enqueue or coalesce
the pending site build. When the guarded update changes no row, the adapter
SHALL report `CONTENT_INVALID_STATE` when the item exists and is not `active`,
and `MEDIA_UPDATE_CONFLICT` otherwise, and SHALL leave the row, the
published-content version and build work unchanged.

#### Scenario: A failure after the row update rolls back
- **WHEN** a configured checkpoint fails after the metadata update of an item
  used by a publication
- **THEN** the metadata, `updated_at`, the published-content version and build
  work are unchanged

#### Scenario: Deletion marking and an edit compete
- **WHEN** one transaction marks an unreferenced item `deleting` after another
  writer read it as `active`
- **THEN** the writer's metadata update fails with `CONTENT_INVALID_STATE` and
  the item keeps its `deleting` status
