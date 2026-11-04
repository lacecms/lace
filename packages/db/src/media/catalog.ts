import type { DecodedSortCursor } from "../shared/cursors.js";
import { SQL_MAX_MEDIA_FILENAME_LENGTH } from "../shared/limits.js";
import { failure } from "../shared/failures.js";
import { assertNonNegativeInteger } from "../shared/values.js";
import type { SortSql } from "../shared/values.js";
import { decodeSortCursor } from "../shared/cursors.js";
import { actorDisplayName } from "@lacecms/application";
import type {
  ListMediaInput,
  MediaCatalogItem,
  MediaSort,
  UpdateMediaMetadataInput,
} from "@lacecms/application";
import {
  actorId,
  isMediaFocalCoordinate,
  isMediaSha256,
  MAX_MEDIA_ALT_LENGTH,
  MAX_MEDIA_CAPTION_LENGTH,
  unixMilliseconds,
} from "@lacecms/domain";
import type { MediaMetadata } from "@lacecms/domain";
import { normalizedMediaFilterTags } from "./tags.js";

export const MEDIA_COLUMNS_SQL =
  "m.id, m.storage_key, m.filename, m.mime_type, m.size, m.width, m.height, m.alt, m.caption, m.focal_x, m.focal_y, m.status, m.created_by, m.created_at, m.updated_at";

/**
 * Guarded descriptive-metadata write; binds `mediaMetadataUpdateParams`. It
 * changes only an active row still at the expected `updated_at`.
 */
export const MEDIA_METADATA_UPDATE_SQL =
  "update media set alt = ?, caption = ?, focal_x = ?, focal_y = ?, updated_at = ? where id = ? and status = 'active' and updated_at = ?";

/** True while a current published snapshot references the media ID bound once. */
export const MEDIA_PUBLISHED_REFERENCE_SQL = `exists (
    select 1 from content_media_references r
    join content_entries e on e.published_snapshot_id = r.snapshot_id
    where r.media_id = ?
  )`;

export function mediaMetadataUpdateParams(
  input: UpdateMediaMetadataInput,
): readonly (number | string | null)[] {
  if (input.updatedAt <= input.expectedUpdatedAt) {
    failure("A media metadata update must advance updatedAt.");
  }
  return [
    input.alt,
    input.caption,
    input.focalPoint?.x ?? null,
    input.focalPoint?.y ?? null,
    input.updatedAt,
    input.mediaId,
    input.expectedUpdatedAt,
  ];
}

/** Distinct entries whose current draft or published snapshot references the media row `m`. */
export const MEDIA_USAGE_COUNT_SQL = `(select count(distinct s.entry_id)
  from content_media_references r
  join content_snapshots s on s.id = r.snapshot_id
  where r.media_id = m.id)`;

export const MEDIA_TAGS_JSON_SQL = `(select coalesce(json_group_array(tag), '[]') from
  (select tag from media_tags where media_id = m.id order by tag))`;

/** Admin-only media columns: like tags, the content hash never reaches public projections. */
const ADMIN_MEDIA_COLUMNS_SQL = `${MEDIA_COLUMNS_SQL}, m.sha256, ${MEDIA_TAGS_JSON_SQL} as tags_json`;

export const MEDIA_CATALOG_SQL = `select ${ADMIN_MEDIA_COLUMNS_SQL}, u.name as created_by_name,
  ${MEDIA_USAGE_COUNT_SQL} as usage_count`;

export const MEDIA_SORT_SQL: Readonly<Record<string, SortSql>> = {
  createdAt: { order: "m.created_at", value: "m.created_at" },
  filename: { order: "m.filename collate nocase", value: "m.filename" },
  size: { order: "m.size", value: "m.size" },
};

export const MEDIA_BY_ID_SQL = `select ${ADMIN_MEDIA_COLUMNS_SQL} from media m where m.id = ? limit 1`;

export function mediaCursorKind(input: ListMediaInput): string {
  return JSON.stringify([
    "media",
    input.sort,
    input.type ?? null,
    input.q ?? null,
    normalizedMediaFilterTags(input.tags),
    // Appended only when present so cursors issued before hash lookups stay valid.
    ...(input.sha256 === undefined ? [] : [input.sha256]),
  ]);
}

export function decodeMediaCursor(value: string, kind: string, sort: MediaSort): DecodedSortCursor {
  return decodeSortCursor(value, kind, (sortValue) =>
    sort.endsWith("filename")
      ? typeof sortValue === "string" && sortValue.length <= SQL_MAX_MEDIA_FILENAME_LENGTH
      : typeof sortValue === "number" && Number.isSafeInteger(sortValue) && sortValue >= 0,
  );
}

export function mediaMetadata(row: Record<string, unknown>): MediaMetadata {
  const string = (name: string): string =>
    typeof row[name] === "string" ? row[name] : failure(`Media ${name} is invalid.`);
  const integer = (name: string): number =>
    typeof row[name] === "number" && Number.isSafeInteger(row[name])
      ? row[name]
      : failure(`Media ${name} is invalid.`);
  const status = string("status");
  if (status !== "active" && status !== "deleting" && status !== "delete_failed") {
    failure("Media status is invalid.");
  }
  const width = row.width;
  const height = row.height;
  const text = (name: "alt" | "caption", limit: number): string | undefined => {
    const value = row[name];
    if (value === undefined || value === null) return undefined;
    return typeof value === "string" && value.length > 0 && [...value].length <= limit
      ? value
      : failure(`Media ${name} is invalid.`);
  };
  const alt = text("alt", MAX_MEDIA_ALT_LENGTH);
  const caption = text("caption", MAX_MEDIA_CAPTION_LENGTH);
  const focalX = row.focal_x ?? null;
  const focalY = row.focal_y ?? null;
  if (
    (focalX === null) !== (focalY === null) ||
    (focalX !== null && (!isMediaFocalCoordinate(focalX) || !isMediaFocalCoordinate(focalY)))
  ) {
    failure("Media focal point is invalid.");
  }
  return Object.freeze({
    ...(alt === undefined ? {} : { alt }),
    ...(caption === undefined ? {} : { caption }),
    createdAt: unixMilliseconds(integer("created_at")),
    createdBy: actorId(string("created_by")),
    filename: string("filename"),
    ...(focalX === null
      ? {}
      : { focalPoint: Object.freeze({ x: focalX as number, y: focalY as number }) }),
    ...(typeof height === "number" ? { height } : {}),
    id: string("id") as MediaMetadata["id"],
    mimeType: string("mime_type"),
    ...(row.sha256 === undefined || row.sha256 === null
      ? {}
      : { sha256: isMediaSha256(row.sha256) ? row.sha256 : failure("Media sha256 is invalid.") }),
    size: integer("size"),
    status,
    storageKey: string("storage_key"),
    tags: Object.freeze(JSON.parse(String(row.tags_json ?? "[]")) as string[]),
    updatedAt: unixMilliseconds(integer("updated_at")),
    ...(typeof width === "number" ? { width } : {}),
  });
}

export function mediaCatalogItem(row: Record<string, unknown>): MediaCatalogItem {
  const media = mediaMetadata(row);
  const createdByName = typeof row.created_by_name === "string" ? row.created_by_name : null;
  return Object.freeze({
    createdBy: Object.freeze({
      displayName: actorDisplayName(media.createdBy, createdByName),
      id: media.createdBy,
    }),
    media,
    usageCount: assertNonNegativeInteger(row.usage_count, "Media usage count"),
  });
}
