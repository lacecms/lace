import type {
  CreateMediaMetadataInput,
  MarkMediaForDeletionInput,
  MarkMediaForDeletionResult,
  MediaCommandPort,
  MediaDeletionDispatchPort,
  UpdateMediaMetadataInput,
  UpdateMediaMetadataResult,
} from "@lacecms/application";
import {
  createMediaWritePlan,
  updateMediaWritePlan,
  requestMediaDeletionWritePlan,
  completeMediaDeletionWritePlan,
  failMediaDeletionWritePlan,
  failure,
  sqliteWriteError,
} from "@lacecms/db";
import type { MediaDeletionMiss, WritePlan } from "@lacecms/db";
import { DomainError } from "@lacecms/domain";
import type { MediaMetadata } from "@lacecms/domain";
import { D1RepositoryBase } from "./base.js";
import { executeWritePlan, executeWritePlanGroup } from "./write-plan.js";

/** Media metadata writes and the deletion workflow. */
export class D1MediaCommands
  extends D1RepositoryBase
  implements MediaCommandPort, Omit<MediaDeletionDispatchPort, "loadDeletingMedia">
{
  public async createMedia(input: CreateMediaMetadataInput): Promise<MediaMetadata> {
    try {
      await executeWritePlan(
        this.database,
        createMediaWritePlan(input),
        input.createdAt,
        this.options.beforeMutation,
      );
    } catch (error) {
      sqliteWriteError(error, false, "D1");
    }
    const media = await this.loadMedia(input.id);
    if (media === null) failure("Created media could not be reloaded.");
    return media;
  }

  public async updateMediaMetadata(
    input: UpdateMediaMetadataInput,
  ): Promise<UpdateMediaMetadataResult> {
    const plan = updateMediaWritePlan(
      input,
      input.events.map(() => this.nextId()),
    );
    let result: Awaited<ReturnType<typeof executeWritePlan<"inactive" | "conflict">>>;
    try {
      result = await executeWritePlan(
        this.database,
        plan,
        input.updatedAt,
        this.options.beforeMutation,
      );
    } catch (error) {
      sqliteWriteError(error, false, "D1");
    }
    if (result.kind === "rejected") {
      if (result.reason === "inactive") failure("Only active media can be edited.");
      throw new DomainError("MEDIA_UPDATE_CONFLICT", "The media was modified by another request.");
    }
    if (result.committedOutboxWork) this.options.onOutboxWork?.();
    const bumped = (result.slots.published?.[0] as { bumped: number } | undefined)?.bumped;
    const media = await this.loadMedia(input.mediaId);
    if (media === null) failure("Updated media could not be reloaded.");
    const row = result.slots.queue?.[0] as
      | { version: number; pending_id: string | null }
      | undefined;
    if (bumped === 1 && row?.pending_id == null) failure("Build request could not be queued.");
    return bumped === 1 ? { media, targetVersion: row!.version } : { media };
  }

  public async markForDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    return this.requestDeletion(input, false);
  }

  public async retryDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    return this.requestDeletion(input, true);
  }

  private async requestDeletion(
    input: MarkMediaForDeletionInput,
    retry: boolean,
  ): Promise<MarkMediaForDeletionResult> {
    const result = await this.executeMediaPlan(
      requestMediaDeletionWritePlan(
        input,
        input.events.map(() => this.nextId()),
        retry,
      ),
      input.requestedAt,
    );
    if (result.kind === "rejected") {
      if (result.reason === "in-use")
        throw new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
      failure(retry ? "Media deletion cannot be retried." : "Media is not eligible for deletion.");
    }
    const media = await this.loadMedia(input.mediaId);
    if (media === null) failure("Media deletion mark could not be reloaded.");
    return { media, status: "deleting" };
  }

  public async completeMediaDeletion(input: {
    readonly completedAt: number;
    readonly leaseId: string;
    readonly mediaId: string;
  }): Promise<void> {
    try {
      const result = await executeWritePlanGroup(
        this.database,
        completeMediaDeletionWritePlan({ ...input, now: input.completedAt }),
      );
      const code = (result.slots.admission?.[0] as { outcome: number } | undefined)?.outcome;
      if (code === undefined) throw new Error("Media deletion admission result is missing.");
      if (code !== 1)
        this.refuseLease(
          code === 0 ? "lease" : code === 2 ? "mismatch" : "media",
          "Media deletion can no longer be finalized.",
        );
    } catch (error) {
      sqliteWriteError(error, false, "D1");
    }
  }

  public async failMediaDeletion(input: {
    readonly failedAt: number;
    readonly leaseId: string;
    readonly mediaId: string;
    readonly sanitizedError: string;
    readonly terminal: boolean;
    readonly retryAt?: number;
  }): Promise<void> {
    const result = await this.executeMediaPlan(
      failMediaDeletionWritePlan({ ...input, now: input.failedAt }),
      input.failedAt,
    );
    if (result.kind === "rejected")
      this.refuseLease(result.reason, "Media deletion can no longer be failed safely.");
  }

  private async executeMediaPlan(plan: WritePlan<MediaDeletionMiss>, now: number) {
    try {
      const result = await executeWritePlan(this.database, plan, now, this.options.beforeMutation);
      if (result.kind === "committed" && result.committedOutboxWork) this.options.onOutboxWork?.();
      return result;
    } catch (error) {
      sqliteWriteError(error, false, "D1");
    }
  }

  private refuseLease(reason: MediaDeletionMiss, message: string): never {
    if (reason === "lease") failure("Dispatcher lease is missing or expired.");
    if (reason === "mismatch") failure("Dispatcher event does not match media.");
    failure(message);
  }
}
