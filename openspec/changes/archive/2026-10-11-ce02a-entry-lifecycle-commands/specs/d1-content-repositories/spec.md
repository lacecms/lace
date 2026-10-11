## ADDED Requirements

### Requirement: D1 entry lifecycle commands use guarded batches
D1 unpublication, draft revert, and guarded duplicate creation SHALL each
execute as one guarded `batch()`. The unpublication guard SHALL require that the
entry's published pointer equals the expected snapshot identity and, when an
idempotency key is supplied, that no record exists for its scope and key; route
removal, pointer clearing, snapshot deletion, published-state increment,
build-event enqueue or coalescing, and the idempotency record SHALL be
conditional on that guard. The revert guard SHALL require the expected draft
revision and published snapshot identity; block and media-reference
replacement and both snapshot updates SHALL be conditional on it. A duplicate
creation guard SHALL require the source entry's draft at the expected revision;
the entry, snapshot, block, and media-reference inserts SHALL be conditional on
it. A zero-row guard SHALL be classified after the batch: an unpublication
returns the stored idempotent result when one exists, `CONTENT_NOT_PUBLISHED`
when the entry has no publication, and `CONTENT_REVISION_CONFLICT` otherwise; a
revert returns `CONTENT_NOT_PUBLISHED` or `CONTENT_REVISION_CONFLICT` by the
same rule; a duplicate creation returns `CONTENT_REVISION_CONFLICT`, or the
invalid-state failure when the source no longer exists.

#### Scenario: Concurrent unpublications commit once
- **WHEN** two unpublications of the same publication without an idempotency key
  run concurrently
- **THEN** one commits a single version increment and build request, and the
  other returns `CONTENT_NOT_PUBLISHED`

#### Scenario: A failing statement rolls back a revert
- **WHEN** a statement after the guard fails inside a revert batch
- **THEN** the draft's fields, blocks, media references, and both revisions are
  unchanged
