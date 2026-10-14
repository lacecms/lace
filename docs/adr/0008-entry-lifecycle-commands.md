# ADR 0008: Entry lifecycle commands

- Status: Accepted
- Date: 2026-10-11
- Governing architecture: [section 9.3](../mvp-architecture.md#93-content-snapshots),
  [section 9.8](../mvp-architecture.md#98-outbox-and-site-builds),
  [section 10](../mvp-architecture.md#10-content-publication), and
  [section 12](../mvp-architecture.md#12-rest-api)
- Related: [content and editor roadmap](../archive/content-editor-roadmap.md) step CE2,
  OpenSpec change `ce02a-entry-lifecycle-commands`

## Context

The MVP offered create, save, publish and delete. Taking content offline
required deleting it, abandoning draft changes required re-entering the
published values by hand, and there was no way to copy an entry. The API also
let callers delete page singletons, which configuration sync then recreated
empty.

## Decision

1. **Unpublish** is a dedicated guarded command (`content:publish`) keyed on
   the expected published snapshot ID with an optional idempotency key. One
   atomic mutation removes the route, clears the published pointer, deletes the
   published snapshot (blocks and media references cascade), bumps
   `published_state.version` and coalesces a build. The draft is untouched. An
   entry without a publication fails with `CONTENT_NOT_PUBLISHED`; a stale
   snapshot ID fails with `CONTENT_REVISION_CONFLICT`. The removed snapshot is
   not recoverable; republishing publishes the current draft.
2. **Revert draft** (`content:write`) copies the publication's title, slug,
   fields, schema version, blocks and media references into the draft with
   set-based statements, advances the draft revision once and sets the
   published snapshot's revision to the same value. The entry's derived status
   (`published` when revisions are equal) is therefore correct after a revert.
   Public content does not change, so the published version is not bumped and
   no build is requested.
3. **Duplicate** (`content:write`, collections only) reuses the create command
   with a guard on the source draft revision. The copy has a ` (copy)` title
   suffix within the title limit, no slug, new block keys and rebuilt media
   references, and is never published.
4. **Page entries cannot be deleted or duplicated** (`CONTENT_PAGE_SINGLETON`).
   A page is removed by removing its model from configuration.

## Alternatives considered

- **Unpublish through `delete` with a keep-entry flag.** Rejected: delete is
  guarded by the draft revision and has different permissions; one command per
  guard keeps both explicit.
- **Revert without aligning the published revision.** Rejected: the entry
  would read as `changed` although its draft equals the publication.
- **Align the revision and also bump the published version.** Rejected: every
  revert, including one by an editor without `content:publish`, would request
  a redundant site build.
- **Derive the status from content equality.** Rejected: list queries would
  have to compare block rows.
- **Copy block keys into a duplicate.** Rejected: keys would be ambiguous
  across entries in diagnostics and media-usage locations.

## Consequences

- Until the public delivery contract drops it (CE3C), the published
  snapshot's `revision` appears in public and build-export payloads. A cached
  export can show the pre-revert revision number under an unchanged ETag. No
  renderer, SDK helper or build step reads it; section 9.8 records that a
  revision-only alignment is not a public-output change.
- Media referenced only by an unpublished snapshot becomes unreferenced and
  deletable.
- Another entry can claim an unpublished entry's path; republishing then fails
  with `CONTENT_ROUTE_CONFLICT`.
- Duplicate is not idempotent; a client retry after a lost response can create
  a second copy.
