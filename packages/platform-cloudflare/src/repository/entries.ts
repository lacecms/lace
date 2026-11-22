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
  SaveDetachedDraftInput,
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
  assertDraftPersistenceBounds,
  revertDraftWritePlan,
  rejectRevertWrite,
  failure,
} from "@lacecms/db";
import { D1RepositoryBase } from "./base.js";
import { executeWritePlan } from "./write-plan.js";

/** D1 content entry creation, draft saves, publication, reversion and deletion. */
export class D1EntryCommands extends D1RepositoryBase implements ContentEntryCommandPort {
  public async create(input: CreateContentEntryInput): Promise<ContentCommandResult> {
    const { draft, id, model } = input.entry;
    assertDraftPersistenceBounds(draft.blocks, input.mediaReferences);
    let result: Awaited<
      ReturnType<
        typeof executeWritePlan<ReturnType<ReturnType<typeof createDraftWritePlan>["diagnose"]>>
      >
    >;
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
    await this.writeDraft(input, existing.draft_snapshot_id);
    const entry = await this.reader.loadEntry(input.entryId);
    if (entry === null) failure("Saved content entry could not be reloaded.");
    return { entry, status: "saved" };
  }

  public async saveDetachedDraft(input: SaveDetachedDraftInput): Promise<boolean> {
    assertDraftPersistenceBounds(input.mutation.blocks, input.mutation.mediaReferences);
    return this.writeDraft(input, input.draftId, input.mediaId);
  }

  private async writeDraft(
    input: SaveCompleteDraftInput,
    draftId: string,
    detachMediaId?: string,
  ): Promise<boolean> {
    let result: Awaited<
      ReturnType<
        typeof executeWritePlan<ReturnType<ReturnType<typeof createDraftWritePlan>["diagnose"]>>
      >
    >;
    try {
      result = await executeWritePlan(
        this.database,
        saveDraftWritePlan(input, draftId, detachMediaId),
        input.mutation.updatedAt,
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("D1 content write failed.");
    }
    if (result.kind === "rejected" && result.reason === "detach_absent") return false;
    if (result.kind === "rejected") rejectDraftWrite(result.reason, "");
    return true;
  }

  public async publish(input: PublishContentEntryCommand): Promise<PublishContentEntryResult> {
    if (input.idempotency !== undefined && input.idempotency.actorId !== input.publishedBy.id)
      failure("Publication idempotency actor must match publisher.");
    const entry = await this.reader.loadEntry(input.entryId);
    if (entry === null) failure("Content entry does not exist.");
    const role = await this.first<{ readonly role: string }>(
      "select role from content_actor_profiles where actor_id = ?",
      input.publishedBy.id,
    );
    const committed = publicationResultEntry(entry, input, role?.role);
    let result: import("@lacecms/db").WritePlanResult<import("@lacecms/db").PublicationGuardMiss>;
    try {
      result = await executeWritePlan(
        this.database,
        publishWritePlan(
          input,
          entry,
          committed,
          input.events.map(() => this.nextId()),
        ),
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
        unpublishWritePlan(
          input,
          entry,
          input.events.map(() => this.nextId()),
        ),
        input.unpublishedAt,
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("D1 content write failed.");
    }
    if (result.kind === "rejected") {
      const replay = removalGuardResult(result.reason, "unpublish", input.idempotency);
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
    const entry = await this.reader.loadEntry(input.entryId);
    if (entry === null) failure("Content entry does not exist.");
    const result = await executeWritePlan(
      this.database,
      revertDraftWritePlan(
        input,
        entry.draft.id,
        entry.published?.blocks.map((block) => block.key) ?? [],
      ),
      input.revertedAt,
      this.options.beforeMutation,
    ).catch((error) => {
      if (error instanceof LaceError) throw error;
      failure("D1 content write failed.");
    });
    if (result.kind === "rejected") rejectRevertWrite(result.reason);
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
        deleteEntryWritePlan(
          input,
          entry?.draft_snapshot_id ?? null,
          input.events.map(() => this.nextId()),
        ),
        input.deletedAt,
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("D1 content write failed.");
    }
    if (result.kind === "rejected") removalGuardResult(result.reason, "delete");
    if (result.kind === "committed" && result.committedOutboxWork) this.options.onOutboxWork?.();
    return { status: "deleted" };
  }
}
