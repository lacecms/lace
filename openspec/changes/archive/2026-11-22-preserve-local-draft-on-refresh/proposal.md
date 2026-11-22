## Why

Returning to the Admin tab can erase an unsaved edit when another writer has saved the same entry. Item 1 of the [pre-1.0 audit](page://page_422b3a21dfd08191b6efbf905d01ba3b) reproduced the loss before the first Save, before the server's revision check could help.

## What Changes

- Treat audit item 1 as one pre-1.0 correction. When a background read finds a newer draft, a clean editor adopts it. An editor with local changes keeps its input, unsaved status and original revision.
- Count unfinished input inside a block as local work, even when its stored field value has yet to change.
- Surface the existing accessible recovery actions as soon as the editor detects the conflict. Apply the same rules before and after the writer's first successful save.

## Capabilities

### New Capabilities

### Modified Capabilities

- [admin-draft-editor](../../../specs/admin-draft-editor/spec.md) defines when the open form may adopt a refreshed draft and which revision protects a subsequent save.
- [admin-draft-editor-publication](../../../specs/admin-draft-editor-publication/spec.md) extends explicit conflict recovery to conflicts detected by a read.

## Impact

The change affects the shared browser Admin, its editor tests and the editing guide. It builds on TanStack Query's validated entry reads, the existing optimistic save contract and the conflict alert under [architecture §17](../../../../docs/architecture/admin.md) and [§12](../../../../docs/architecture/api.md). Both Node and Cloudflare serve the same editor and API contract. Server or storage changes, offline persistence, automatic merging and the remaining audit items are outside this session.
