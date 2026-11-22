import { LaceError } from "@lacecms/content";
import type {
  ContentCommandResult,
  ContentEntryCommandPort,
  CreateContentEntryInput,
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
} from "../publication/removal-write-plan.js";
import {
  publicationResultEntry,
  publicationGuardResult,
  publishWritePlan,
} from "../publication/write-plan.js";
import {
  createDraftWritePlan,
  saveDraftWritePlan,
  rejectDraftWrite,
} from "../content/draft-write-plan.js";
import { revertDraftWritePlan, rejectRevertWrite } from "../content/revert-write-plan.js";
import { assertDraftPersistenceBounds } from "../content/snapshots.js";
import { failure } from "../shared/failures.js";
import type { ContentEntry } from "@lacecms/domain";
import { NodeRepositoryBase } from "./base.js";
import { executeWritePlan } from "./write-plan.js";

/** Node content entry creation, draft saves, publication, reversion and deletion. */
export class NodeEntryCommands extends NodeRepositoryBase implements ContentEntryCommandPort {
  public async create(input: CreateContentEntryInput): Promise<ContentCommandResult> {
    const { draft, id, model } = input.entry;
    assertDraftPersistenceBounds(draft.blocks, input.mediaReferences);
    let result: ReturnType<
      typeof executeWritePlan<ReturnType<ReturnType<typeof createDraftWritePlan>["diagnose"]>>
    >;
    try {
      result = executeWritePlan(
        this.connection,
        createDraftWritePlan(input),
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("SQLite content write failed.");
    }
    if (result.kind === "rejected") rejectDraftWrite(result.reason, model.key);
    const entry = this.loadEntry(id);
    if (entry === null) failure("Created content entry could not be reloaded.");
    return { entry, status: "created" };
  }

  public async saveCompleteDraft(input: SaveCompleteDraftInput): Promise<ContentCommandResult> {
    assertDraftPersistenceBounds(input.mutation.blocks, input.mutation.mediaReferences);
    const existing = this.entryRow(input.entryId);
    if (existing === undefined || existing.draft_snapshot_id === null)
      failure("Content entry does not have a mutable draft.");
    let result: ReturnType<
      typeof executeWritePlan<ReturnType<ReturnType<typeof createDraftWritePlan>["diagnose"]>>
    >;
    try {
      result = executeWritePlan(
        this.connection,
        saveDraftWritePlan(input, existing.draft_snapshot_id),
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("SQLite content write failed.");
    }
    if (result.kind === "rejected") rejectDraftWrite(result.reason, "");
    const entry = this.loadEntry(input.entryId);
    if (entry === null) failure("Saved content entry could not be reloaded.");
    return { entry, status: "saved" };
  }

  public async publish(input: PublishContentEntryCommand): Promise<PublishContentEntryResult> {
    if (input.idempotency !== undefined && input.idempotency.actorId !== input.publishedBy.id)
      failure("Publication idempotency actor must match publisher.");
    let entry: ContentEntry | null = null;
    let committed: ContentEntry | undefined;
    let result: import("../write-plan/plan.js").WritePlanResult<
      import("../publication/write-plan.js").PublicationGuardMiss
    >;
    try {
      result = executeWritePlan(
        this.connection,
        () => {
          entry = this.loadEntry(input.entryId);
          if (entry === null) failure("Content entry does not exist.");
          const role = this.connection
            .prepare("select role from content_actor_profiles where actor_id = ?")
            .get(input.publishedBy.id) as { role: string } | undefined;
          committed = publicationResultEntry(entry, input, role?.role);
          return publishWritePlan(
            input,
            entry,
            committed,
            input.events.map(() => this.nextId()),
          );
        },
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("SQLite content write failed.");
    }
    if (result.kind === "rejected") return publicationGuardResult(input, entry!, result.reason);
    const row = result.slots.build?.[0] as { version: number } | undefined;
    if (row === undefined || committed === undefined)
      failure("Published content entry could not be reloaded.");
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
    let entry: ContentEntry | null = null;
    let result: ReturnType<
      typeof executeWritePlan<ReturnType<ReturnType<typeof unpublishWritePlan>["diagnose"]>>
    >;
    try {
      result = executeWritePlan(
        this.connection,
        () => {
          entry = this.loadEntry(input.entryId);
          return unpublishWritePlan(
            input,
            entry,
            input.events.map(() => this.nextId()),
          );
        },
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("SQLite content write failed.");
    }
    if (result.kind === "rejected") {
      const replay = removalGuardResult(result.reason, "unpublish", input.idempotency);
      return { entry: replay, outcome: "replayed", status: "unpublished" };
    }
    if (entry === null) failure("Unpublished content entry could not be reloaded.");
    const current: ContentEntry = entry;
    const committed = Object.freeze({ draft: current.draft, id: current.id, model: current.model });
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
    try {
      const result = executeWritePlan(
        this.connection,
        () => {
          const entry = this.loadEntry(input.entryId);
          if (entry === null) failure("Content entry does not exist.");
          return revertDraftWritePlan(
            input,
            entry.draft.id,
            entry.published?.blocks.map((block) => block.key) ?? [],
          );
        },
        this.options.beforeMutation,
      );
      if (result.kind === "rejected") rejectRevertWrite(result.reason);
    } catch (error) {
      this.throwWriteError(error, false);
    }
    const entry = this.loadEntry(input.entryId);
    if (entry === null) failure("Reverted content entry could not be reloaded.");
    return { entry, status: "reverted" };
  }

  public async delete(
    input: import("@lacecms/application").DeleteContentEntryInput,
  ): Promise<ContentCommandResult> {
    let result: ReturnType<
      typeof executeWritePlan<ReturnType<ReturnType<typeof deleteEntryWritePlan>["diagnose"]>>
    >;
    try {
      result = executeWritePlan(
        this.connection,
        () => {
          const entry = this.entryRow(input.entryId);
          return deleteEntryWritePlan(
            input,
            entry?.draft_snapshot_id ?? null,
            input.events.map(() => this.nextId()),
          );
        },
        this.options.beforeMutation,
      );
    } catch (error) {
      if (error instanceof LaceError) throw error;
      failure("SQLite content write failed.");
    }
    if (result.kind === "rejected") removalGuardResult(result.reason, "delete");
    return { status: "deleted" };
  }
}
