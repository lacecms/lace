## Context

CE2A adds the backend half of roadmap step CE2. The relevant code today:

- `ContentUseCases` (`packages/application/src/content-use-cases.ts`) orchestrates create, save, publish and delete. It authorizes first, loads the entry, validates, and calls one specialized command on `ContentEntryCommandPort`.
- The Node adapter (`packages/platform-node/src/content-repository.ts`) runs each command in one SQLite transaction with named checkpoints. The D1 adapter (`packages/platform-cloudflare/src/d1-content-repository.ts`) runs one `batch()`. It either uses a `mutation_guards` token (save, delete) or a guarded first insert (publish), and classifies a zero-row guard after the batch.
- Publication stores idempotency records in `idempotency_records` with the scope `publication:<entry>:<actor>`. It bumps `published_state.version` and coalesces `site.build.requested` through the shared helpers `bumpPublicState`/`addPublicStateBump`.
- The derived entry status is `draft` without a publication, `published` when `published.revision = draft.revision`, and `changed` otherwise (`ENTRY_STATUS_SQL`, the admin's `entryStatus`, the in-memory double).
- `InMemoryContentStore` (`packages/test-utils`) mirrors the ports. `repository-contract.ts` runs identical cases on Node SQLite and local D1.
- REST routes live in `packages/server/src/app.ts`, with schemas and error mapping in `packages/contracts`.

No schema change is needed. Every new write reuses the existing tables and foreign keys. Deleting a snapshot cascades to its blocks and media references, and `published_snapshot_id` uses `ON DELETE SET NULL`.

## Goals / Non-Goals

**Goals:**

- Guarded, atomic unpublish, revert and duplicate on both runtimes with identical results.
- Unpublish is idempotent and requests a build. Revert and duplicate never change public output.
- Page entries cannot be deleted or duplicated through the API.
- REST endpoints that CE2B can call directly.

**Non-Goals:**

- Admin UI (CE2B).
- Trash.
- Restoring an unpublished snapshot.
- Idempotency for revert and duplicate.
- Public contract changes (CE3C).

## Decisions

### D1. Unpublish is a dedicated guarded command

The new port method is `unpublish(command)`. Its input is `{entryId, expectedPublishedSnapshotId, unpublishedAt, unpublishedBy, idempotency?}`. It returns `{entry, outcome: "unpublished", targetVersion}` or `{entry, outcome: "replayed"}`. The use case authorizes `content:publish` and loads the entry:

- With no publication, it throws `CONTENT_NOT_PUBLISHED` before any write.
- When the publication's ID differs from the expected ID, it throws `CONTENT_REVISION_CONFLICT`.
- Otherwise it calls the command.

The adapters re-check the same guard atomically.

The mutation, in order (both runtimes):

1. Idempotency replay check (scope `unpublication:<entry>:<actor>`, same 24 h TTL and key rules as publication).
2. Guard: `content_entries.published_snapshot_id = expected`. In D1, the guard also requires that no idempotency record exists for the scope and key.
3. `delete from published_routes where entry_id = ?`.
4. `update content_entries set published_snapshot_id = null, updated_at = ?`.
5. Published-state bump and build enqueue or coalesce through the existing helper. The reason is `publication`, as for a published deletion, and the snapshot ID is the removed one.
6. Idempotency record holding the committed entry, which has no `published` snapshot.
7. `delete from content_snapshots where id = expected`. Blocks and media references cascade.

The draft row and its revision are not touched. The entry's `updated_at` moves because the entry changed, so the entry sorts as recently updated.

Fingerprint: `sha256CanonicalJson({actorId, entryId, expectedPublishedSnapshotId})`. A replay returns the stored entry, which can be stale relative to later edits. This matches publish.

Zero-row classification in D1 checks these in order:

1. A stored replay for the scope and key → replay.
2. The current pointer is null → `CONTENT_NOT_PUBLISHED`.
3. Otherwise → `CONTENT_REVISION_CONFLICT`.

Node classifies the same way inside its transaction.

Checkpoints: `unpublish.route`, then the existing `public-state` and `build-outbox`, then `unpublish.snapshot`. They are exported as `UNPUBLICATION_CHECKPOINTS` for the rollback contract case.

*Rejected:* reusing `delete` with a "keep entry" flag. Delete is keyed on the draft revision and has different authorization. A separate command keeps each guard explicit.

### D2. Revert copies with set-based statements and aligns the published revision

The new port method is `revertDraft(command)`. Its input is `{entryId, expectedRevision, expectedPublishedSnapshotId, revertedAt, revertedBy}`, and it returns `{entry, status: "reverted"}`. The use case authorizes `content:write`, loads the entry, throws `CONTENT_NOT_PUBLISHED` without a publication, and passes the loaded published ID as the guard. No content validation runs: the published snapshot was validated in publish mode, and configuration sync keeps both snapshots migrated.

The mutation:

1. Guard: the entry's draft has `revision = expectedRevision` and `published_snapshot_id = expectedPublishedSnapshotId`.
2. Delete the draft's blocks and media references.
3. Copy the published rows into the draft:
   - blocks with `INSERT … SELECT … where snapshot_id = published`, keeping the block keys;
   - media references with `INSERT … SELECT`.
4. Update the draft snapshot. Set `slug`, `title`, `fields_json` and `schema_version` from the published row with scalar subqueries, plus `revision = revision + 1`, `updated_at` and `updated_by`.
5. `update content_snapshots set revision = <expectedRevision + 1> where id = published`.
6. `update content_entries set updated_at`.

**Published revision alignment.** Status is derived from revision equality. Without step 5, a reverted entry would show `changed` although its draft equals the publication. CE1C already treats equal revisions as "in sync" and moves a published revision with its draft. The published content is not changed, so `published_state.version` is not bumped and no build is requested.

**Trade-off.** Until CE3C, the public and build-export DTOs still carry the published snapshot's `revision` through the legacy `draft` copy. A cached export can therefore show the old revision number under an unchanged ETag. No renderer, SDK helper or build step reads `revision`, and CE3C removes it from the public shape. Architecture section 9.8 records that a revision-only alignment is not a public-output change.

*Rejected alternatives:*

- (a) Leave the published revision alone and accept `changed` after revert. The derived status would be wrong, and CE2B's "Revert to published" would leave a misleading badge.
- (b) Align the revision and also bump the version and request a build. Every revert, including one by an editor without `content:publish`, would cause a redundant site build. Editors would effectively trigger public-output changes.
- (c) Derive the status from content equality. This needs block comparison in every list query.

### D3. Duplicate composes the existing create command with a source guard

There is no new port method. `CreateContentEntryInput` gains `duplicateOf?: {entryId, expectedRevision}`. The use case:

1. authorizes `content:write` and loads the source;
2. refuses a page with `CONTENT_PAGE_SINGLETON`;
3. compares the caller's optional `expectedRevision` with `source.draft.revision` (`CONTENT_REVISION_CONFLICT`);
4. builds the copy:
   - title through `duplicateTitle`;
   - no slug;
   - the same fields;
   - blocks mapped to `blockKey(idGenerator.next())` with the same type, schema version, position and data;
5. runs the same `validateDraft(…, "draft")` path as create, which rebuilds the media references and requires active media;
6. calls `create` with `duplicateOf: {entryId: source.id, expectedRevision: source.draft.revision}`.

Adapters:

- Node checks the source draft revision first inside the create transaction.
- D1 adds a `mutation_guards` token conditioned on the source revision as the first statement. It makes the entry, snapshot, block, reference and pointer statements conditional on it. The existing helpers already accept a token for the snapshot, block and reference inserts. The entry insert becomes `insert … select … where GUARD`.

A zero-row guard results in:

- `CONTENT_INVALID_STATE` ("does not exist") when the source is gone;
- `CONTENT_REVISION_CONFLICT` otherwise.

The guard also closes the torn-read window of the multi-query D1 load: a copy is only committed when the source revision it read is still current.

`duplicateTitle(title)` appends `" (copy)"`. When the result would exceed `MAX_TITLE_LENGTH` (200 UTF-16 units, as validated), the base is cut to `200 - 7` units. If the cut ends on a high surrogate, one more unit is removed, so no lone surrogate remains. The copy has `createdBy`/`updatedBy` set to the actor, revision 1 and the current time.

*Rejected:* copying the source's block keys. That would be legal per snapshot but contradicts the roadmap decision. It would also make block keys ambiguous across entries in diagnostics and media-usage locations.

### D4. Page deletion is refused in the use case

`delete` authorizes `content:write`, loads the entry, and throws `CONTENT_PAGE_SINGLETON` for `entry.model.kind === "page"`. It does this before the publish-permission check, so an editor gets the page refusal instead of a misleading permission error. Adapters keep their delete statements. Configuration sync never deletes entries, and every path that can reach `delete` goes through the use case. A database-level page guard would duplicate the rule without adding protection.

### D5. Error codes

`DomainErrorCode` gains `CONTENT_NOT_PUBLISHED` and `CONTENT_PAGE_SINGLETON`. Both map to HTTP `409` in `domainErrorStatus` with sanitized messages:

- "The entry is not published."
- "Page entries are defined by configuration."

`errorCodeSchema` lists them, so the OpenAPI document and generated clients include them. The in-memory double throws the same codes.

### D6. REST contracts

`packages/contracts` adds:

- `unpublishContentEntryRequestSchema = strictObject({expectedPublishedSnapshotId: identifierSchema})`;
- `revertContentEntryRequestSchema` and `duplicateContentEntryRequestSchema = strictObject({expectedRevision: optional(...)})`;
- `unpublicationOutcomeSchema = picklist(["unpublished", "replayed"])`;
- `unpublishContentEntryResultSchema = strictObject({build, entry: adminContentEntrySchema, unpublication})`, with a `toUnpublishContentEntryResultDto` mapper.

Routes in `app.ts`:

- `revert` uses the existing `revision()` helper, so a body value or `If-Match` is required.
- `duplicate` uses a new `optionalRevision()`. It applies the same agreement and strong-tag rules but returns `undefined` when both are absent.
- `unpublish` reads `optionalIdempotencyKey()`.

All three use `optionalJsonBody` semantics only where the body is optional. Unpublish requires a JSON body. The OpenAPI snapshot `apps/api/openapi/api-v1.json` is regenerated with `pnpm openapi:generate` and checked with `pnpm openapi:check`.

### D7. Architecture, ADR and roadmap

- **Section 10:** add the three commands with inputs, permissions, guards and the atomic steps; replace the "no separate unpublish command" sentence and the page-recreation sentence with the page rule.
- **Section 9.3:** unpublish deletes the published snapshot; revert aligns its revision.
- **Section 9.8:** a revision-only alignment is not a public-output change.
- **Section 12:** the three routes.
- **ADR 0008:** records D1–D4 and the rejected alternatives.
- **Roadmap:** CE2 status `in progress`, then the session log after archive.

## Risks / Trade-offs

- **Unpublish deletes data.** If the draft diverged, the published version is gone and cannot be restored. This follows owner decision 3. CE2B's confirmation must say so, and CE12 (revision history) is the future remedy.
- **Media usage drops after unpublish.** Media referenced only by the removed snapshot becomes unreferenced and deletable. This is intended and consistent with the projection rule.
- **Republishing can collide.** Another entry may claim the path while an entry is unpublished. Republication then fails with the existing `CONTENT_ROUTE_CONFLICT`, and the editor changes the slug.
- **Stale revision number in a cached export after revert (D2).** It is cosmetic, it is documented, and CE3C removes it.
- **Breaking change.** Page `DELETE` now returns `409`. This is acceptable during alpha. No admin path uses it, and it is noted in the proposal.
- **Duplicate is not idempotent.** A client retry after a lost response can create a second copy. CE2B opens the copy immediately, so a duplicate is visible and deletable.

## Migration Plan

No database migration. The changes deploy with the API. The regenerated OpenAPI document and the architecture note on page deletion ship in the same change. Rollback means reverting the commit; no data written by the new commands needs conversion, because they only use existing columns.

## Open Questions

None. D2's revision alignment is the recommended resolution of the status-derivation question and is called out for owner review before apply.
