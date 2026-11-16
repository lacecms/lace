import type { CreateMediaMetadataInput, UpdateMediaMetadataInput } from "@lacecms/application";
import { publicStateIncrementStatement } from "../write-plan/build-enqueue.js";
import { enqueueRequests } from "../write-plan/enqueue-events.js";
import type { WritePlan, WritePlanStatement } from "../write-plan/plan.js";
import {
  MEDIA_METADATA_UPDATE_SQL,
  MEDIA_PUBLISHED_REFERENCE_SQL,
  mediaMetadataUpdateParams,
} from "./catalog.js";
import { mediaTagInsert, normalizedMediaWriteTags } from "./tags.js";

export function createMediaWritePlan(input: CreateMediaMetadataInput): WritePlan<never> {
  const tags = normalizedMediaWriteTags(input.tags ?? []);
  return {
    admission: { sql: "1", params: [] },
    diagnostics: {},
    diagnose: () => {
      throw new Error("Media creation admission failed.");
    },
    statements: (guard) => {
      const statements: WritePlanStatement[] = [
        {
          sql: `insert into media (id, storage_key, filename, mime_type, size, width, height, metadata_json, sha256, status, created_by, created_at, updated_at) select ?, ?, ?, ?, ?, ?, ?, '{}', ?, 'active', ?, ?, ? where ${guard.sql}`,
          params: [
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
            ...guard.params,
          ],
          expectedChanges: 1,
        },
      ];
      const insert = mediaTagInsert(input.id, tags, guard.sql);
      if (insert !== undefined)
        statements.push({ ...insert, params: [...insert.params, ...guard.params] });
      return statements;
    },
  };
}

export function updateMediaWritePlan(
  input: UpdateMediaMetadataInput,
  eventIds: readonly string[],
): WritePlan<"inactive" | "conflict"> {
  const params = mediaMetadataUpdateParams(input);
  const tags = input.tags === undefined ? undefined : normalizedMediaWriteTags(input.tags);
  return {
    admission: {
      sql: "exists (select 1 from media where id = ? and status = 'active' and updated_at = ?)",
      params: [input.mediaId, input.expectedUpdatedAt],
    },
    diagnostics: {
      media: { sql: "select status from media where id = ?", params: [input.mediaId] },
    },
    diagnose: (rows) => {
      const row = rows.media?.[0] as { status: string } | undefined;
      return row !== undefined && row.status !== "active" ? "inactive" : "conflict";
    },
    statements: (guard) => {
      const statements: WritePlanStatement[] = [
        {
          checkpoint: "media.metadata",
          sql: `${MEDIA_METADATA_UPDATE_SQL} and ${guard.sql}`,
          params: [...params, ...guard.params],
          expectedChanges: 1,
        },
      ];
      if (tags !== undefined) {
        statements.push({
          sql: `delete from media_tags where media_id = ? and ${guard.sql}`,
          params: [input.mediaId, ...guard.params],
        });
        const insert = mediaTagInsert(input.mediaId, tags, guard.sql);
        if (insert !== undefined)
          statements.push({ ...insert, params: [...insert.params, ...guard.params] });
      }
      const published = {
        sql: `${guard.sql} and ${MEDIA_PUBLISHED_REFERENCE_SQL} and ${input.events.length === 0 ? "0" : "1"}`,
        params: [...guard.params, input.mediaId],
      };
      statements.push({
        checkpoint: "media.tags",
        slot: "tags-checkpoint",
        sql: "select 1",
        params: [],
      });
      statements.push(publicStateIncrementStatement(published, input.updatedAt));
      statements.push(...enqueueRequests(input.events, eventIds, published));
      statements.push({
        slot: "published",
        sql: `select (${published.sql}) as bumped`,
        params: published.params,
      });
      return statements;
    },
  };
}
