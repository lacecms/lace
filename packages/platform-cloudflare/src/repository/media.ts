import { mediaTagInsert, normalizedMediaWriteTags } from "@lacecms/db";
import { DISPATCHER_LEASE_DURATION_MS } from "@lacecms/application";
import type {
  CreateMediaMetadataInput,
  DispatcherLeaseId,
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
  sqliteWriteError,
} from "@lacecms/db";
import { DomainError } from "@lacecms/domain";
import type { MediaMetadata, UnixMilliseconds } from "@lacecms/domain";
import { GUARD_SQL } from "./batch.js";
import type { Condition } from "./batch.js";
import { D1RepositoryBase } from "./base.js";

/** D1 media metadata writes and the deletion workflow. */
export class D1MediaCommands
  extends D1RepositoryBase
  implements MediaCommandPort, Omit<MediaDeletionDispatchPort, "loadDeletingMedia">
{
  public async createMedia(input: CreateMediaMetadataInput): Promise<MediaMetadata> {
    try {
      const batch = this.batch();
      batch.add(
        "insert into media (id, storage_key, filename, mime_type, size, width, height, metadata_json, sha256, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, '{}', ?, 'active', ?, ?, ?)",
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
      const insert = mediaTagInsert(input.id, normalizedMediaWriteTags(input.tags ?? []));
      if (insert !== undefined) batch.add(insert.sql, ...insert.params);
      await this.execute(batch, false);
    } catch (error) {
      sqliteWriteError(error, false, "D1");
    }
    const media = await this.loadMedia(input.id);
    if (media === null) failure("Created media could not be reloaded.");
    return media;
  }

  public async markForDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    return this.requestMediaDeletion(input, "active", "Media is not eligible for deletion.");
  }

  public async retryDeletion(
    input: MarkMediaForDeletionInput,
  ): Promise<MarkMediaForDeletionResult> {
    return this.requestMediaDeletion(input, "delete_failed", "Media deletion cannot be retried.");
  }

  public async completeMediaDeletion(input: {
    readonly completedAt: UnixMilliseconds;
    readonly leaseId: DispatcherLeaseId;
    readonly mediaId: string;
  }): Promise<void> {
    const batch = this.batch();
    const token = this.guard(batch, input.completedAt, {
      params: [
        input.leaseId,
        input.completedAt - DISPATCHER_LEASE_DURATION_MS,
        input.mediaId,
        input.mediaId,
      ],
      sql: "exists (select 1 from outbox_events where locked_by = ? and type = 'media.delete.requested' and processed_at is null and locked_at > ? and case when json_valid(payload_json) then json_extract(payload_json, '$.mediaId') end = ?) and exists (select 1 from media m where m.id = ? and m.status = 'deleting' and not exists (select 1 from content_media_references r where r.media_id = m.id))",
    });
    batch.add(`delete from media_tags where media_id = ? and ${GUARD_SQL}`, input.mediaId, token);
    batch.add(`delete from media where id = ? and ${GUARD_SQL}`, input.mediaId, token);
    batch.add(
      `update outbox_events set processed_at = ?, locked_at = null, locked_by = null where locked_by = ? and type = 'media.delete.requested' and ${GUARD_SQL}`,
      input.completedAt,
      input.leaseId,
      token,
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      await this.requireLeasedMediaDeletionEvent(input.leaseId, input.completedAt, input.mediaId);
      failure("Media deletion can no longer be finalized.");
    }
  }

  public async failMediaDeletion(input: {
    readonly failedAt: UnixMilliseconds;
    readonly leaseId: DispatcherLeaseId;
    readonly mediaId: string;
    readonly sanitizedError: string;
    readonly terminal: boolean;
    readonly retryAt?: UnixMilliseconds;
  }): Promise<void> {
    const error = sanitizeDispatchError(input.sanitizedError);
    const event = await this.requireLeasedMediaDeletionEvent(
      input.leaseId,
      input.failedAt,
      input.mediaId,
    );
    const lease = {
      params: [event.id, input.leaseId, input.failedAt - DISPATCHER_LEASE_DURATION_MS],
      sql: "exists (select 1 from outbox_events where id = ? and locked_by = ? and processed_at is null and locked_at > ?)",
    };
    if (!input.terminal) {
      const retried = await this.run(
        `update outbox_events set attempts = attempts + 1, available_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ? and locked_by = ? and processed_at is null and locked_at > ?`,
        input.retryAt ?? input.failedAt,
        error,
        ...lease.params,
      );
      if (retried !== 1) failure("Dispatcher lease is missing or expired.");
      return;
    }
    const batch = this.batch();
    const token = this.guard(batch, input.failedAt, {
      params: [...lease.params, input.mediaId],
      sql: `${lease.sql} and exists (select 1 from media where id = ? and status = 'deleting')`,
    });
    batch.add(
      `update media set status = 'delete_failed', last_error = ?, updated_at = ? where id = ? and ${GUARD_SQL}`,
      error,
      input.failedAt,
      input.mediaId,
      token,
    );
    batch.add(
      `update outbox_events set attempts = attempts + 1, processed_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ? and ${GUARD_SQL}`,
      input.failedAt,
      error,
      event.id,
      token,
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      await this.requireLeasedMediaDeletionEvent(input.leaseId, input.failedAt, input.mediaId);
      failure("Media deletion can no longer be failed safely.");
    }
  }

  public async updateMediaMetadata(
    input: UpdateMediaMetadataInput,
  ): Promise<UpdateMediaMetadataResult> {
    const params = mediaMetadataUpdateParams(input);
    const batch = this.batch();
    const token = this.guard(batch, input.updatedAt, {
      params: [input.mediaId, input.expectedUpdatedAt],
      sql: "exists (select 1 from media where id = ? and status = 'active' and updated_at = ?)",
    });
    batch.checkpoint("media.metadata");
    batch.add(`${MEDIA_METADATA_UPDATE_SQL} and ${GUARD_SQL}`, ...params, token);
    if (input.tags !== undefined) {
      batch.add(`delete from media_tags where media_id = ? and ${GUARD_SQL}`, input.mediaId, token);
      const insert = mediaTagInsert(
        input.mediaId,
        normalizedMediaWriteTags(input.tags),
        GUARD_SQL,
        token,
      );
      if (insert !== undefined) batch.add(insert.sql, ...insert.params);
    }
    batch.checkpoint("media.tags");
    const published: Condition = {
      params: [token, input.mediaId],
      sql: `${GUARD_SQL} and ${MEDIA_PUBLISHED_REFERENCE_SQL} and ${input.publishedEffect === false ? "0" : "1"}`,
    };
    const state = this.addPublicStateBump(batch, published, {
      reason: "media_metadata",
      requestedAt: input.updatedAt,
      requestedBy: input.requestedBy.id,
      snapshotId: null,
    });
    const outcome = batch.add(`select (${published.sql}) as bumped`, ...published.params);
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      const row = await this.first<{ readonly status: string }>(
        "select status from media where id = ?",
        input.mediaId,
      );
      if (row !== undefined && row.status !== "active") failure("Only active media can be edited.");
      throw new DomainError("MEDIA_UPDATE_CONFLICT", "The media was modified by another request.");
    }
    const bumped = (results[outcome]!.results[0] as { readonly bumped: number } | undefined)
      ?.bumped;
    const media = await this.loadMedia(input.mediaId);
    if (media === null) failure("Updated media could not be reloaded.");
    return bumped === 1 ? { media, targetVersion: this.stateVersion(results, state) } : { media };
  }

  private async requestMediaDeletion(
    input: MarkMediaForDeletionInput,
    expectedStatus: "active" | "delete_failed",
    message: string,
  ): Promise<MarkMediaForDeletionResult> {
    const batch = this.batch();
    const token = this.guard(batch, input.requestedAt, {
      params: [input.mediaId, expectedStatus],
      sql: "exists (select 1 from media m where m.id = ? and m.status = ? and not exists (select 1 from content_media_references r where r.media_id = m.id))",
    });
    batch.checkpoint(expectedStatus === "active" ? "media.mark" : "media.retry");
    batch.add(
      `update media set status = 'deleting', ${expectedStatus === "active" ? "" : "last_error = null, "}updated_at = ? where id = ? and ${GUARD_SQL}`,
      input.requestedAt,
      input.mediaId,
      token,
    );
    batch.checkpoint("media.outbox");
    batch.add(
      `insert into outbox_events (id, type, payload_json, attempts, available_at, created_at) select ?, 'media.delete.requested', ?, 0, ?, ? where ${GUARD_SQL}`,
      this.nextId(),
      JSON.stringify({ mediaId: input.mediaId, requestedBy: input.requestedBy.id }),
      input.requestedAt,
      input.requestedAt,
      token,
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      const row = await this.first<{ readonly referenced: number; readonly status: string }>(
        "select status, exists(select 1 from content_media_references where media_id = ?) as referenced from media where id = ?",
        input.mediaId,
        input.mediaId,
      );
      if (row?.status === expectedStatus && row.referenced === 1) {
        throw new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
      }
      failure(message);
    }
    const media = await this.loadMedia(input.mediaId);
    if (media === null) failure("Media deletion mark could not be reloaded.");
    return { media, status: "deleting" };
  }

  private async requireLeasedMediaDeletionEvent(
    leaseId: string,
    now: number,
    mediaId: string,
  ): Promise<{ readonly id: string }> {
    const event = await this.first<{ readonly id: string; readonly payload_json: string }>(
      "select id, payload_json from outbox_events where locked_by = ? and type = 'media.delete.requested' and processed_at is null and locked_at > ?",
      leaseId,
      now - DISPATCHER_LEASE_DURATION_MS,
    );
    if (event === undefined) failure("Dispatcher lease is missing or expired.");
    const payload = parseObject(event.payload_json, "Outbox payload");
    if (payload.mediaId !== mediaId) failure("Dispatcher event does not match media.");
    return event;
  }
}
