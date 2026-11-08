import { mediaTagInsert, normalizedMediaWriteTags } from "@lacecms/db";
import { DISPATCHER_LEASE_DURATION_MS } from "@lacecms/application";
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
  MEDIA_METADATA_UPDATE_SQL,
  MEDIA_PUBLISHED_REFERENCE_SQL,
  mediaMetadataUpdateParams,
  failure,
  parseObject,
  sanitizeDispatchError,
} from "@lacecms/db";
import { DomainError } from "@lacecms/domain";
import type { MediaMetadata } from "@lacecms/domain";
import { NodeRepositoryBase } from "./base.js";

/** Node media metadata writes and the deletion workflow. */
export class NodeMediaCommands
  extends NodeRepositoryBase
  implements MediaCommandPort, Omit<MediaDeletionDispatchPort, "loadDeletingMedia">
{
  public async markForDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    try {
      this.connection.transaction(() => {
        this.checkpoint("media.mark");
        const changed = this.connection
          .prepare(
            "update media set status = 'deleting', updated_at = ? where id = ? and status = 'active' and not exists (select 1 from content_media_references where media_id = ?)",
          )
          .run(input.requestedAt, input.mediaId, input.mediaId);
        if (changed.changes !== 1) {
          this.refuseDeletion(input.mediaId, "active", "Media is not eligible for deletion.");
        }
        this.checkpoint("media.outbox");
        this.connection
          .prepare(
            "insert into outbox_events (id, type, payload_json, attempts, available_at, created_at) values (?, 'media.delete.requested', ?, 0, ?, ?)",
          )
          .run(
            this.nextId(),
            JSON.stringify({ mediaId: input.mediaId, requestedBy: input.requestedBy.id }),
            input.requestedAt,
            input.requestedAt,
          );
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    const media = await this.loadMedia(input.mediaId);
    if (media === null) failure("Media deletion mark could not be reloaded.");
    return { media, status: "deleting" };
  }

  public async retryDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    try {
      this.connection.transaction(() => {
        this.checkpoint("media.retry");
        const changed = this.connection
          .prepare(
            "update media set status = 'deleting', last_error = null, updated_at = ? where id = ? and status = 'delete_failed' and not exists (select 1 from content_media_references where media_id = ?)",
          )
          .run(input.requestedAt, input.mediaId, input.mediaId);
        if (changed.changes !== 1) {
          this.refuseDeletion(input.mediaId, "delete_failed", "Media deletion cannot be retried.");
        }
        this.checkpoint("media.outbox");
        this.connection
          .prepare(
            "insert into outbox_events (id, type, payload_json, attempts, available_at, created_at) values (?, 'media.delete.requested', ?, 0, ?, ?)",
          )
          .run(
            this.nextId(),
            JSON.stringify({ mediaId: input.mediaId, requestedBy: input.requestedBy.id }),
            input.requestedAt,
            input.requestedAt,
          );
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    const media = await this.loadMedia(input.mediaId);
    if (media === null) failure("Media deletion retry could not be reloaded.");
    return { media, status: "deleting" };
  }

  public async updateMediaMetadata(
    input: UpdateMediaMetadataInput,
  ): Promise<UpdateMediaMetadataResult> {
    const params = mediaMetadataUpdateParams(input);
    let targetVersion: number | undefined;
    try {
      this.connection.transaction(() => {
        this.checkpoint("media.metadata");
        const changed = this.connection.prepare(MEDIA_METADATA_UPDATE_SQL).run(...params);
        if (changed.changes !== 1) this.refuseMetadataUpdate(input.mediaId);
        if (input.tags !== undefined) {
          this.connection.prepare("delete from media_tags where media_id = ?").run(input.mediaId);
          const insert = mediaTagInsert(input.mediaId, normalizedMediaWriteTags(input.tags));
          if (insert !== undefined) this.connection.prepare(insert.sql).run(...insert.params);
        }
        this.checkpoint("media.tags");
        const published = this.connection
          .prepare(`select ${MEDIA_PUBLISHED_REFERENCE_SQL} as published`)
          .get(input.mediaId) as { readonly published: number };
        if (input.publishedEffect !== false && published.published === 1) {
          targetVersion = this.bumpPublicState(
            input.updatedAt,
            input.requestedBy.id,
            null,
            "media_metadata",
          );
        }
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    const media = await this.loadMedia(input.mediaId);
    if (media === null) failure("Updated media could not be reloaded.");
    return targetVersion === undefined ? { media } : { media, targetVersion };
  }

  public async completeMediaDeletion(input: {
    readonly completedAt: number;
    readonly leaseId: string;
    readonly mediaId: string;
  }): Promise<void> {
    try {
      this.connection.transaction(() => {
        const event = this.requireLeasedMediaDeletionEvent(
          input.leaseId,
          input.completedAt,
          input.mediaId,
        );
        this.connection
          .prepare(
            "delete from media_tags where media_id = ? and exists (select 1 from media where id = ? and status = 'deleting' and not exists (select 1 from content_media_references where media_id = ?))",
          )
          .run(input.mediaId, input.mediaId, input.mediaId);
        const deleted = this.connection
          .prepare(
            "delete from media where id = ? and status = 'deleting' and not exists (select 1 from content_media_references where media_id = ?)",
          )
          .run(input.mediaId, input.mediaId);
        if (deleted.changes !== 1) failure("Media deletion can no longer be finalized.");
        const completed = this.connection
          .prepare(
            "update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ? and locked_by = ?",
          )
          .run(input.completedAt, event.id, input.leaseId);
        if (completed.changes !== 1) failure("Dispatcher lease is missing or expired.");
      })();
    } catch (error) {
      this.throwWriteError(error, false);
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
    const error = sanitizeDispatchError(input.sanitizedError);
    try {
      this.connection.transaction(() => {
        const event = this.requireLeasedMediaDeletionEvent(
          input.leaseId,
          input.failedAt,
          input.mediaId,
        );
        if (input.terminal) {
          const failed = this.connection
            .prepare(
              "update media set status = 'delete_failed', last_error = ?, updated_at = ? where id = ? and status = 'deleting'",
            )
            .run(error, input.failedAt, input.mediaId);
          if (failed.changes !== 1) failure("Media deletion can no longer be failed safely.");
          const completed = this.connection
            .prepare(
              "update outbox_events set attempts = attempts + 1, processed_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ? and locked_by = ?",
            )
            .run(input.failedAt, error, event.id, input.leaseId);
          if (completed.changes !== 1) failure("Dispatcher lease is missing or expired.");
          return;
        }
        const retried = this.connection
          .prepare(
            "update outbox_events set attempts = attempts + 1, available_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ? and locked_by = ?",
          )
          .run(input.retryAt ?? input.failedAt, error, event.id, input.leaseId);
        if (retried.changes !== 1) failure("Dispatcher lease is missing or expired.");
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async createMedia(input: CreateMediaMetadataInput): Promise<MediaMetadata> {
    const tags = normalizedMediaWriteTags(input.tags ?? []);
    try {
      this.connection.transaction(() => {
        this.connection
          .prepare(
            "insert into media (id, storage_key, filename, mime_type, size, width, height, metadata_json, sha256, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, '{}', ?, 'active', ?, ?, ?)",
          )
          .run(
            input.id,
            input.storageKey,
            input.filename,
            input.mimeType,
            input.size,
            input.width,
            input.height,
            input.sha256 ?? null,
            input.createdBy,
            input.createdAt,
            input.createdAt,
          );
        const insert = mediaTagInsert(input.id, tags);
        if (insert !== undefined) this.connection.prepare(insert.sql).run(...insert.params);
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
    const media = await this.loadMedia(input.id);
    if (media === null) failure("Created media could not be reloaded.");
    return media;
  }

  private requireLeasedMediaDeletionEvent(
    leaseId: string,
    now: number,
    mediaId: string,
  ): { readonly id: string } {
    const event = this.connection
      .prepare(
        "select id, payload_json from outbox_events where locked_by = ? and type = 'media.delete.requested' and processed_at is null and locked_at > ?",
      )
      .get(leaseId, now - DISPATCHER_LEASE_DURATION_MS) as
      | { readonly id: string; readonly payload_json: string }
      | undefined;
    if (event === undefined) failure("Dispatcher lease is missing or expired.");
    const payload = parseObject(event.payload_json, "Outbox payload");
    if (payload.mediaId !== mediaId) failure("Dispatcher event does not match media.");
    return event;
  }

  /** Classifies a refused deletion inside the same write transaction as its guard. */
  private refuseDeletion(
    mediaId: string,
    expectedStatus: MediaMetadata["status"],
    message: string,
  ): never {
    const row = this.connection
      .prepare(
        "select status, exists(select 1 from content_media_references where media_id = ?) as referenced from media where id = ?",
      )
      .get(mediaId, mediaId) as
      | { readonly referenced: number; readonly status: string }
      | undefined;
    if (row?.status === expectedStatus && row.referenced === 1) {
      throw new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
    }
    failure(message);
  }

  private refuseMetadataUpdate(mediaId: string): never {
    const row = this.connection.prepare("select status from media where id = ?").get(mediaId) as
      | { readonly status: string }
      | undefined;
    if (row !== undefined && row.status !== "active") failure("Only active media can be edited.");
    throw new DomainError("MEDIA_UPDATE_CONFLICT", "The media was modified by another request.");
  }
}
