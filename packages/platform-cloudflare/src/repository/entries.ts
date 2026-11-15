import { LaceError } from "@lacecms/content";
import type {
  ContentCommandResult,
  ContentEntryCommandPort,
  CreateContentEntryInput,
  DeleteContentEntryInput,
  PublishContentEntryCommand,
  PublishContentEntryResult,
  RevertContentDraftCommand,
  SaveCompleteDraftInput,
  UnpublishContentEntryCommand,
  UnpublishContentEntryResult,
} from "@lacecms/application";
import {
  unpublishWritePlan,
  deleteEntryWritePlan,
  removalGuardResult,
  publicationResultEntry,
  publicationGuardResult,
  publishWritePlan,
  createDraftWritePlan,
  saveDraftWritePlan,
  rejectDraftWrite,
  copyInternalLinkDiffStatements,
  assertDraftPersistenceBounds,
  failure,
  copySnapshotBlocksSql,
  copySnapshotReferencesSql,
  notPublished,
  revertDraftSnapshotSql,
  revisionConflict,
} from "@lacecms/db";
import { GUARD_SQL } from "./batch.js";
import { D1RepositoryBase } from "./base.js";
import { executeWritePlan } from "./write-plan.js";

/** D1 content entry creation, draft saves, publication, reversion and deletion. */
export class D1EntryCommands extends D1RepositoryBase implements ContentEntryCommandPort {
  public async create(input: CreateContentEntryInput): Promise<ContentCommandResult> {
    const { draft, id, model } = input.entry;
    assertDraftPersistenceBounds(draft.blocks, input.mediaReferences);
    let result: Awaited<ReturnType<typeof executeWritePlan<import("@lacecms/db").DraftGuardMiss>>>;
    try {
      result = await executeWritePlan(
        this.database,
        createDraftWritePlan(input),
        draft.createdAt,
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("D1 content write failed.");
    }
    if (result.kind === "rejected") rejectDraftWrite(result.reason, model.key);
    const entry = await this.reader.loadEntry(id);
    if (entry === null) failure("Created content entry could not be reloaded.");
    return { entry, status: "created" };
  }

  public async saveCompleteDraft(input: SaveCompleteDraftInput): Promise<ContentCommandResult> {
    assertDraftPersistenceBounds(input.mutation.blocks, input.mutation.mediaReferences);
    const existing = await this.entryRow(input.entryId);
    if (existing === undefined || existing.draft_snapshot_id === null)
      failure("Content entry does not have a mutable draft.");
    let result: Awaited<ReturnType<typeof executeWritePlan<import("@lacecms/db").DraftGuardMiss>>>;
    try {
      result = await executeWritePlan(
        this.database,
        saveDraftWritePlan(input, existing.draft_snapshot_id),
        input.mutation.updatedAt,
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("D1 content write failed.");
    }
    if (result.kind === "rejected") rejectDraftWrite(result.reason, "");
    const entry = await this.reader.loadEntry(input.entryId);
    if (entry === null) failure("Saved content entry could not be reloaded.");
    return { entry, status: "saved" };
  }

  public async publish(input: PublishContentEntryCommand): Promise<PublishContentEntryResult> {
    if (input.idempotency !== undefined && input.idempotency.actorId !== input.publishedBy.id)
      failure("Publication idempotency actor must match publisher.");
    const entry = await this.reader.loadEntry(input.entryId);
    if (entry === null) failure("Content entry does not exist.");
    const role = await this.first<{ readonly role: string }>(
      "select role from user where id = ?",
      input.publishedBy.id,
    );
    const committed = publicationResultEntry(entry, input, role?.role);
    let result: import("@lacecms/db").WritePlanResult<import("@lacecms/db").PublicationGuardMiss>;
    try {
      result = await executeWritePlan(
        this.database,
        publishWritePlan(input, entry, committed, this.nextId()),
        input.publishedAt,
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("D1 content write failed.");
    }
    if (result.kind === "rejected") return publicationGuardResult(input, entry, result.reason);
    if (result.committedOutboxWork) this.options.onOutboxWork?.();
    const row = result.slots.build?.[0] as { version: number } | undefined;
    if (row === undefined) failure("Published content entry could not be reloaded.");
    return {
      entry: committed,
      outcome: "published",
      status: "published",
      targetVersion: row.version,
    };
  }

  public async unpublish(
    input: UnpublishContentEntryCommand,
  ): Promise<UnpublishContentEntryResult> {
    if (input.idempotency !== undefined && input.idempotency.actorId !== input.unpublishedBy.id)
      failure("Unpublication idempotency actor must match the unpublishing actor.");
    const entry = await this.reader.loadEntry(input.entryId);
    let result: Awaited<
      ReturnType<
        typeof executeWritePlan<ReturnType<ReturnType<typeof unpublishWritePlan>["diagnose"]>>
      >
    >;
    try {
      result = await executeWritePlan(
        this.database,
        unpublishWritePlan(input, entry, this.nextId()),
        input.unpublishedAt,
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("D1 content write failed.");
    }
    if (result.kind === "rejected") {
      const replay = removalGuardResult(
        result.reason,
        {
          entryId: input.entryId,
          action: "unpublish",
          actorId: input.unpublishedBy.id,
          acknowledgment: input.linkImpact,
          expectedPublished: input.expectedPublishedSnapshotId,
        },
        input.idempotency,
      );
      return { entry: replay, outcome: "replayed", status: "unpublished" };
    }
    if (result.committedOutboxWork) this.options.onOutboxWork?.();
    if (entry === null) failure("Unpublished content entry could not be reloaded.");
    const committed = Object.freeze({ draft: entry.draft, id: entry.id, model: entry.model });
    const row = result.slots.build?.[0] as { version: number } | undefined;
    if (row === undefined) failure("Unpublished content entry could not be reloaded.");
    return {
      entry: committed,
      outcome: "unpublished",
      status: "unpublished",
      targetVersion: row.version,
    };
  }

  public async revertDraft(input: RevertContentDraftCommand): Promise<ContentCommandResult> {
    const entry = await this.entryRow(input.entryId);
    if (entry === undefined || entry.draft_snapshot_id === null) {
      failure("Content entry does not exist.");
    }
    if (entry.published_snapshot_id === null) notPublished();
    if (entry.published_snapshot_id !== input.expectedPublishedSnapshotId) {
      revisionConflict("The published snapshot no longer matches the expected publication.");
    }
    const draftId = entry.draft_snapshot_id;
    const publishedId = entry.published_snapshot_id;
    const batch = this.batch();
    const token = this.guard(batch, input.revertedAt, {
      params: [input.entryId, publishedId, input.expectedRevision],
      sql: "exists (select 1 from content_entries e join content_snapshots d on d.id = e.draft_snapshot_id where e.id = ? and e.published_snapshot_id = ? and d.revision = ?)",
    });
    batch.checkpoint("revert.draft");
    batch.add(
      revertDraftSnapshotSql(GUARD_SQL),
      input.revertedAt,
      input.revertedBy.id,
      publishedId,
      draftId,
      token,
    );
    batch.add(`delete from content_blocks where snapshot_id = ? and ${GUARD_SQL}`, draftId, token);
    batch.add(
      `delete from content_media_references where snapshot_id = ? and ${GUARD_SQL}`,
      draftId,
      token,
    );
    batch.checkpoint("revert.blocks");
    batch.add(copySnapshotBlocksSql(GUARD_SQL), draftId, publishedId, token);
    batch.add(copySnapshotReferencesSql(GUARD_SQL), draftId, publishedId, token);
    batch.checkpoint("revert.internal-links");
    for (const statement of copyInternalLinkDiffStatements(draftId, publishedId, GUARD_SQL))
      batch.add(statement.sql, ...statement.params, token);
    batch.checkpoint("revert.published");
    batch.add(
      `update content_snapshots set revision = ? where id = ? and ${GUARD_SQL}`,
      input.expectedRevision + 1,
      publishedId,
      token,
    );
    batch.add(
      `update content_entries set updated_at = ? where id = ? and ${GUARD_SQL}`,
      input.revertedAt,
      input.entryId,
      token,
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      const current = await this.entryRow(input.entryId);
      if (current === undefined) failure("Content entry does not exist.");
      if (current.published_snapshot_id === null) notPublished();
      if (current.published_snapshot_id !== publishedId) {
        revisionConflict("The published snapshot no longer matches the expected publication.");
      }
      revisionConflict("The draft revision no longer matches the expected revision.");
    }
    const reverted = await this.reader.loadEntry(input.entryId);
    if (reverted === null) failure("Reverted content entry could not be reloaded.");
    return { entry: reverted, status: "reverted" };
  }

  public async delete(input: DeleteContentEntryInput): Promise<ContentCommandResult> {
    const entry = await this.entryRow(input.entryId);
    let result: Awaited<
      ReturnType<
        typeof executeWritePlan<ReturnType<ReturnType<typeof deleteEntryWritePlan>["diagnose"]>>
      >
    >;
    try {
      result = await executeWritePlan(
        this.database,
        deleteEntryWritePlan(input, entry?.draft_snapshot_id ?? null, this.nextId()),
        input.deletedAt,
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("D1 content write failed.");
    }
    if (result.kind === "rejected")
      removalGuardResult(result.reason, {
        entryId: input.entryId,
        action: "delete",
        actorId: input.deletedBy.id,
        acknowledgment: input.linkImpact,
        expectedPublished: input.expectedPublishedSnapshotId ?? null,
        expectedRevision: input.expectedRevision,
      });
    if (result.kind === "committed" && result.committedOutboxWork) this.options.onOutboxWork?.();
    return { status: "deleted" };
  }
}
