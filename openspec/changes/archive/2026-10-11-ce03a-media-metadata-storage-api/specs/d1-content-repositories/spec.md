## ADDED Requirements

### Requirement: D1 media metadata updates use one guarded batch
D1 media metadata updates SHALL execute as one guarded `batch()`. The guard
SHALL require that the item exists, is `active`, and has the expected
`updated_at`. The row update SHALL be conditional on the guard. The
published-content version increment and the build-event enqueue or
coalescing SHALL be conditional on the guard and on a reference from a current
published snapshot, evaluated inside the same batch. A zero-row guard SHALL be
classified after the batch with the same rule as Node: `CONTENT_INVALID_STATE`
for an existing item that is not `active`, and `MEDIA_UPDATE_CONFLICT`
otherwise.

#### Scenario: Concurrent edits commit once
- **WHEN** two metadata updates with the same expected `updated_at` run
  concurrently on an item used by a publication
- **THEN** one commits its values with a single version increment and build
  request, and the other fails with `MEDIA_UPDATE_CONFLICT`

#### Scenario: A failing statement rolls back the update
- **WHEN** a statement after the guard fails inside a metadata update batch
- **THEN** the metadata, `updated_at`, the published-content version and build
  work are unchanged
