## Why

Both SQL adapters can commit an active media row, fail while rereading it and cause the upload handler to delete the file it just stored. [Pre-1.0 audit item 2](page://page_422b3a21dfd08191b6efbf905d01ba3b) reproduced an active row with missing bytes on SQLite and identified the same ordering on D1.

## What Changes

- Make upload cleanup depend on the outcome of the metadata write. A confirmed rollback permits best-effort cleanup. A failure to read a committed result preserves the file, row, tags and hash.
- Reconcile an uncertain write against authoritative metadata before deciding whether cleanup is safe. Preserve the object and record the opaque key when the outcome remains uncertain.
- Verify the failure boundaries through the upload use case with the production SQLite and local D1 repositories, checking persisted rows and actual object bytes together.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `media-use-cases` — Revise “Object and metadata creation preserve a recoverable boundary” and qualify “Every upload records a content hash for deduplication” so a response failure cannot erase a committed upload. [Accepted specification](../../../specs/media-use-cases/spec.md)

## Impact

One pre-1.0 audit session, independent of the extensibility roadmap's completed EX2B media write-plan work. The affected areas are the application media use case and ports, the Node and Worker media repositories, operational evidence and the shared repository tests. The design relies on object-first upload, unique storage keys and the shared atomic write plan for metadata, tags and hash. [Architecture §9.7](../../../../docs/architecture/data-model.md#97-media) · [Architecture §§15–16](../../../../docs/architecture/runtimes.md)

The public upload API, permissions, private object stores and normal deletion lifecycle keep their existing contracts. Upload idempotency, orphan sweeping and other audit findings are outside this session.
