## Why

Editors cannot take content offline without deleting it, cannot abandon draft changes, and cannot copy an entry. The only lifecycle commands are create, save, publish and delete, and delete is a hard cascade that the API also allows for page singletons. Architecture section 10 states that the MVP has no separate unpublish command.

This change implements roadmap step **CE2 — Entry lifecycle**, session unit **CE2A — Use cases, repositories and REST** ([content and editor roadmap](../../../docs/content-editor-roadmap.md), section 5, owner decisions 1–3). It adds the backend commands and endpoints. The admin editor actions follow in CE2B.

## What Changes

- **Unpublish** (`content:publish`). Input: the entry ID, the expected published snapshot ID and an optional idempotency key. One guarded atomic mutation:
  - deletes the entry's published route;
  - clears `published_snapshot_id`;
  - deletes the published snapshot (its blocks and media references cascade);
  - increments `published_state.version` and creates or coalesces a build request.

  The draft, including unpublished changes, stays untouched. An entry that is not published fails with the new stable error `CONTENT_NOT_PUBLISHED`. A stale expected snapshot fails with `CONTENT_REVISION_CONFLICT`. An identical retry with the same idempotency key returns the original result without another version increment or build request. Unpublish applies to pages and collection entries.
- **Revert draft** (`content:write`). Input: the entry ID and `expectedRevision`. One guarded atomic mutation copies the published snapshot's title, slug, fields, schema version, blocks and media references into the draft with set-based statements. It increments the draft revision once and sets the published snapshot's revision to the same value, so the entry's derived status becomes `published` again. Public content is unchanged, so `published_state.version` is not incremented and no build is requested. An entry that was never published, or is no longer published, fails with `CONTENT_NOT_PUBLISHED`. A stale revision or a concurrent republish fails with `CONTENT_REVISION_CONFLICT`.
- **Duplicate** (`content:write`, collections only). Creates a new entry whose draft copies the source draft:
  - the title gets a ` (copy)` suffix, with the original title shortened so the result fits the 200-character title limit;
  - the slug is cleared;
  - blocks receive new keys and keep their positions;
  - the media references are rebuilt.

  The copy is validated in draft mode and is never published. Creation is guarded on the source draft revision that was read, and optionally on a caller-supplied `expectedRevision`. A page duplicate fails with the new stable error `CONTENT_PAGE_SINGLETON`.
- **Delete.** Collection entries keep today's behavior. Page entries fail with `CONTENT_PAGE_SINGLETON` before any state changes.
- **REST.**
  - `POST /api/v1/admin/entries/:entryId/unpublish`. Body `{ expectedPublishedSnapshotId }`, optional `Idempotency-Key`. The response has the shape `{ entry, unpublication: "unpublished" | "replayed", build }`, mirroring the publish response.
  - `POST /api/v1/admin/entries/:entryId/revert`. Body `{ expectedRevision? }` or `If-Match`, one of them required. Returns the admin entry.
  - `POST /api/v1/admin/entries/:entryId/duplicate`. Body `{ expectedRevision? }` and optional `If-Match`. Returns `201` with the new admin entry.

  All three have Valibot contracts and OpenAPI entries. The two new error codes map to HTTP `409`.
- **Architecture and docs.**
  - Section 10: the new commands and their permissions. Remove "The MVP has no separate unpublish command". Pages cannot be deleted.
  - Section 9.3: unpublish removes the published snapshot; revert aligns its revision.
  - Section 12: the new admin endpoints.
  - ADR 0008.
  - Roadmap status and session log.

**BREAKING (alpha API):** `DELETE /api/v1/admin/entries/:entryId` now refuses page entries with `409 CONTENT_PAGE_SINGLETON`. The admin UI never offered page deletion.

Non-goals:

- Admin editor actions, confirmations, save-and-publish and row menus (CE2B).
- A trash or restore of deleted entries (owner decision 1).
- Restoring an unpublished snapshot. Unpublish deletes it; republishing publishes the current draft.
- Idempotency keys for revert and duplicate.
- Public delivery contract changes (CE3C).
- New site-build reasons. Unpublish requests builds with the existing `publication` reason, like a published deletion.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `content-domain-rules`: the stable failures `CONTENT_NOT_PUBLISHED` and `CONTENT_PAGE_SINGLETON`. Lifecycle invariants for unpublish and revert.
- `content-use-cases`: unpublish, revert-draft and duplicate use cases, their authorization, and the refusal of page deletion.
- `application-ports-and-commands`: the guarded unpublish and revert commands, the duplicate-source guard on creation, and in-memory parity.
- `content-repository-contracts`: cross-runtime cases for unpublish, revert, duplicate and their races.
- `node-content-repositories`: atomic Node unpublish, revert and guarded duplicate creation.
- `d1-content-repositories`: guarded D1 batches for unpublish, revert and duplicate creation.
- `rest-contracts`: the three endpoints, request preconditions, the unpublish response and the two error codes.

## Impact

- `packages/domain`: error codes.
- `packages/application`: port types, `ContentUseCases`.
- `packages/test-utils`: `InMemoryContentStore`, repository contract cases.
- `packages/platform-node`: `NodeContentRepository`.
- `packages/platform-cloudflare`: `D1ContentRepository`.
- `packages/contracts`: request and response schemas, error mapping.
- `packages/server`: routes.
- `apps/api/openapi/api-v1.json`: regenerated.
- Docs: `docs/mvp-architecture.md`, `docs/adr/0008-entry-lifecycle-commands.md`, `docs/content-editor-roadmap.md`.
- No database migration.
- Depends on nothing beyond `main`. CE2B consumes these endpoints.
