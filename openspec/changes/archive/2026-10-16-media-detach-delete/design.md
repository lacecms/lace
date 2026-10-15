## Context

The production report ("I removed the block, the image still says it is used
by one entry") was traced through every layer:

- `ContentUseCases.validateDraft` collects references from entry fields, the SEO
  image and every block with `collectFieldMedia`; a removed block contributes
  none.
- `saveCompleteDraft` (D1 and Node) deletes the draft snapshot's
  `content_media_references` rows and reinserts the new set in the same guarded
  batch/transaction.
- `publish` copies the draft's rows to the new published snapshot and deletes
  every other snapshot of the entry; `content_media_references.snapshot_id`
  cascades. `unpublish` deletes the published snapshot; entry deletion cascades
  through snapshots. No migration rebuilt `content_snapshots` or
  `content_media_references`.
- `MEDIA_USAGE_COUNT_SQL`, `MEDIA_USAGE_SQL` and the deletion guard all read the
  same projection, so count, list and guard agree.

The projection is therefore correct. The reported state is the documented
"published only" usage: the draft no longer uses the image, the published
snapshot does, and the panel's text ("remove it from every listed entry and
publish those entries") does not say which step is missing. The existing
repository contract covers draft/published distinctions with hand-built
reference lists, but no test drives the real reference collection through a
block removal and a republication.

## Goals / Non-Goals

**Goals:**

- Let a writer delete an image used only by drafts, after confirming, by
  detaching it from those drafts first.
- Never let deletion change or break published content.
- Make the "published only" state actionable in the details panel.
- Cover the block-removal → publish → delete path end to end on all runtimes.

**Non-Goals:**

- Rewriting published snapshots or republishing automatically.
- One atomic transaction across many entries.
- Detaching from more than 50 entries; bulk media deletion.

## Decisions

### 1. Detach in the application layer through ordinary draft saves

`ContentUseCases` gains `detachMedia({ actor, entryId, mediaId })`. It requires
`content:write`, loads the entry, rewrites the draft with a pure
`detachFieldMedia(definitions, values, mediaId)` from `@lacecms/content`
(mirroring `collectFieldMedia`: clear a matching `media` leaf by deleting its
key, drop a matching element of a list whose item is `media`, recurse through
groups and lists), applies it to entry fields and to every block's data,
drops `seo.image` when it matches, and then runs the existing
`validateDraft(..., "draft")` and `saveCompleteDraft` at the loaded revision.
A draft that does not use the item is left untouched (no save).

Rationale: the save path already owns validation, reference collection, the
200-reference bound, revision guards and parity between D1 and Node. A new
repository mutation would duplicate all of that in two SQL dialects.

Rejected: a single repository mutation that edits JSON in SQL for every using
snapshot and marks the item `deleting` atomically. It would need JSON surgery
for nested lists in SQLite and D1, bypass block validation, and grow beyond the
D1 batch budget for 50 entries.

### 2. Orchestration in `MediaUseCases.requestDeletion`

`DeleteMediaUseCaseInput` gains optional `detach?: "drafts"`.
`MediaUseCaseDependencies` gains an optional `drafts` port
(`{ detachMedia(input): Promise<unknown> }`), implemented by `ContentUseCases`
and wired in `platform-node/src/runtime.ts`, `platform-cloudflare/src/worker.ts`
and the server tests. Dependency direction stays application-internal; the
media use case depends on a port, not on the content class.

With `detach: "drafts"`: require `media:write` and `content:write`; load the
catalog item (`null` → existing not-found behavior; not `active` →
`CONTENT_INVALID_STATE`); load usage with the existing 50-entry limit; refuse
with `MEDIA_IN_USE` when `usageCount > usage.length` or any location's states
include `published`; call `drafts.detachMedia` for each entry in usage order;
then call the unchanged `markForDeletion`, whose SQL guard
(`not exists ... content_media_references`) is the final authority. A missing
`drafts` port with `detach` set fails with `CONTENT_INVALID_STATE`.

### 3. Failure recovery is per entry

Each draft save is atomic. A revision conflict or other failure aborts the
loop; earlier drafts stay detached (they are valid drafts with an advanced
revision) and the item stays `active`, so the writer can simply retry. A
reference committed between the last save and `markForDeletion` is caught by
the guard. Nothing touches object storage synchronously, so the existing
asynchronous deletion and its `delete_failed` recovery are unchanged.

### 4. Transport

The delete route validates an optional `mediaDeleteQuerySchema`
(`{ detach?: "drafts" }`; like the other query schemas it ignores unknown keys, and a repeated `detach` arrives as an array and fails) in `@lacecms/contracts` and passes it through.
Error mapping is unchanged. `api-v1.json` is regenerated.

### 5. Admin

`client.deleteMedia(id, { detachDrafts?: boolean })` appends `?detach=drafts`.
`MediaDetails` classifies loaded usage:

- `published`: some location has the `published` state → no delete action;
  list the affected entries; per entry whose locations are all published-only,
  say that publishing or unpublishing releases the item (link to the editor).
- `truncated`: `usageCount > usage.length` → no delete action, explanation.
- `drafts`: all listed and draft-only, and the session has `content:write` →
  `DeleteMediaDialog` in detach mode naming the entries with the warnings from
  the spec.
- loading/failed usage → no delete action.

After success the mutation invalidates `adminQueryKeys.media` and every entry
query (`["entries"]`-rooted keys and model entry lists) so open editors reload.
`mediaDeletionDescription` gains a detach-mode message for refusals that may
follow partial detaching.

### 6. Tests

- `@lacecms/content` unit tests for `detachFieldMedia` (root, nested group,
  list of media, list of groups, untouched other values).
- Repository contract (memory, Node, D1): image block in draft and published;
  save without the block → usage location published-only, `markForDeletion`
  refused; publish → `usageCount` 0, `markForDeletion` accepted.
- Application tests: detach orchestration (success, published refusal,
  truncated refusal, permission, revision conflict, guard race, inactive).
- Server HTTP test: real `ContentUseCases` with an image block and a gallery,
  block-removal flow, `detach=drafts` success, `detach=all` 422.
- Admin unit tests for the panel states and dialog; e2e for the confirmed
  detaching deletion with API mocks.

## Risks / Trade-offs

- [Partial detaching on failure] → acceptable and explicit: every intermediate
  state is a valid draft, the item stays active, retry is safe; the admin
  message says drafts may have changed.
- [Editors with open forms get a revision conflict] → the confirmation warns
  about it; the existing conflict UI handles it.
- [Required image fields become empty in drafts] → drafts allow it; publication
  validation reports it, so nothing broken reaches the site.
- [Up to 50 sequential draft saves in one request] → bounded; on D1 each save
  is one batch, well within Worker limits for an interactive admin action.
