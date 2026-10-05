/**
 * Runtime-neutral SQLite-dialect helpers shared by the Node SQLite and
 * Cloudflare D1 content repositories. Nothing here executes SQL or uses a
 * Node-only API, so both runtimes map identical rows to identical values.
 */
import {
  actorDisplayName,
  MAX_CONTENT_ENTRY_SEARCH_LENGTH,
  opaqueCursor,
} from "@lacecms/application";
import type {
  ContentEntryListValues,
  ContentEntrySort,
  ContentEntryStatus,
  ContentEntryStatusTotals,
  ContentEntrySummary,
  ListContentEntriesInput,
  ListMediaInput,
  MediaCatalogItem,
  MediaSort,
  MediaUsageEntry,
  MediaUsageLocation,
  MediaUsageState,
  SiteBuildRecord,
  StoredContentModelState,
} from "@lacecms/application";
import { MAX_TOP_LEVEL_BLOCKS } from "@lacecms/content";
import type { JsonObject } from "@lacecms/content";
import {
  DomainError,
  normalizeBuildFailure,
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  siteBuildId,
  unixMilliseconds,
} from "@lacecms/domain";
import type {
  Actor,
  ContentBlock,
  ContentEntry,
  ContentModelRoute,
  DraftSnapshot,
  MediaMetadata,
  PublishedSnapshot,
  Role,
} from "@lacecms/domain";

// Web-platform globals available in both Node and Workers; this package compiles
// against ES2024 only, so declare the narrow surface it uses.
declare function atob(data: string): string;
declare function btoa(data: string): string;
declare const TextDecoder: new () => { decode(input: Uint8Array): string };
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

export const SQL_CURSOR_VERSION = 1;
export const SQL_SORT_CURSOR_VERSION = 2;
export const SQL_MAX_PAGE_SIZE = 100;
export const SQL_MAX_MEDIA_FILENAME_LENGTH = 255;
/** Architecture caps that keep one complete draft within one D1 batch. */
export const SQL_MAX_DRAFT_BLOCKS = MAX_TOP_LEVEL_BLOCKS;
export const SQL_MAX_DRAFT_MEDIA_REFERENCES = 200;
export const PUBLICATION_IDEMPOTENCY_TTL_MS = 86_400_000;

/** Maps the current runtime configuration to a persisted content-model identity. */
export type ContentModelResolver = (key: string) => ContentModelRoute | undefined;

export interface SiteBuildRow {
  readonly id: string;
  readonly reason: string;
  readonly status: SiteBuildRecord["status"];
  readonly target_version: number;
  readonly requested_by: string;
  readonly requested_at: number;
  readonly started_at: number | null;
  readonly completed_at: number | null;
  readonly provider_build_id: string | null;
  readonly error: string | null;
}

export interface EntryRow {
  readonly draft_snapshot_id: string | null;
  readonly id: string;
  readonly model_key: string;
  readonly published_snapshot_id: string | null;
}

export interface OutboxRow {
  readonly attempts: number;
  readonly available_at: number;
  readonly id: string;
  readonly payload_json: string;
  readonly type: string;
}

export interface SnapshotRow {
  readonly created_at: number;
  readonly entry_id: string;
  readonly fields_json: string;
  readonly id: string;
  readonly revision: number;
  readonly role: string | null;
  readonly schema_version: number;
  readonly slug: string | null;
  readonly title: string;
  readonly updated_at: number;
  readonly updated_by: string;
}

export interface BlockRow {
  readonly block_key: string;
  readonly block_type: string;
  readonly created_at: number;
  readonly data_json: string;
  readonly position: number;
  readonly schema_version: number;
  readonly snapshot_id: string;
  readonly updated_at: number;
}

export interface StoredSnapshot {
  readonly blocks: readonly ContentBlock[];
  readonly createdAt: number;
  readonly entryId: string;
  readonly fields: JsonObject;
  readonly id: string;
  readonly revision: number;
  readonly slug?: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly updatedBy: Actor;
}

export interface SummaryRow {
  readonly draft_revision: number;
  readonly fields_json: string;
  readonly id: string;
  readonly model_key: string;
  readonly published_at: number | null;
  readonly published_snapshot_id: string | null;
  readonly slug: string | null;
  readonly sort_value: number | string;
  readonly status: string;
  readonly title: string;
  readonly updated_at: number;
  readonly updated_by: string;
  readonly updated_by_name: string | null;
}

export interface TotalsRow {
  readonly changed_count: number | null;
  readonly draft_count: number | null;
  readonly published_count: number | null;
  readonly total_count: number;
}

export interface MediaUsageRow {
  readonly block_type: string | null;
  readonly entry_id: string;
  readonly field_path: string;
  readonly model_key: string;
  readonly position: number | null;
  readonly slug: string | null;
  readonly source_key: string;
  readonly state: MediaUsageState;
  readonly status: string;
  readonly title: string;
}

export interface PublicRow extends EntryRow {
  readonly path: string;
  readonly published_created_at: number;
}

export interface StoredModelStateRow {
  readonly draft_snapshot_count: number;
  readonly entry_count: number;
  readonly key: string;
  readonly kind: string;
  readonly projection_hash: string;
  readonly published_snapshot_count: number;
  readonly structure_hash: string;
  readonly version: number;
}

export interface DecodedCursor {
  readonly id: string;
  readonly timestamp: number;
}

export interface DecodedSortCursor {
  readonly id: string;
  readonly value: number | string;
}

export interface SortSql {
  readonly order: string;
  readonly value: string;
}

export const ENTRY_SOURCE_SQL = `content_entries e
  join content_snapshots d on d.id = e.draft_snapshot_id
  left join content_snapshots p on p.id = e.published_snapshot_id`;
export const ENTRY_STATUS_SQL = `case when e.published_snapshot_id is null then 'draft'
  when p.revision = d.revision then 'published' else 'changed' end`;
export const ENTRY_SEARCH_SQL =
  "(instr(lower(d.title), ?) > 0 or instr(coalesce(d.slug, ''), ?) > 0)";
export const ENTRY_SORT_SQL: Readonly<Record<string, SortSql>> = {
  publishedAt: { order: "coalesce(p.created_at, -1)", value: "coalesce(p.created_at, -1)" },
  title: { order: "d.title collate nocase", value: "d.title" },
  updatedAt: { order: "e.updated_at", value: "e.updated_at" },
};
export const ENTRY_COLUMNS_SQL =
  "select id, model_key, draft_snapshot_id, published_snapshot_id from content_entries";
export const MEDIA_COLUMNS_SQL =
  "m.id, m.storage_key, m.filename, m.mime_type, m.size, m.width, m.height, m.status, m.created_by, m.created_at, m.updated_at";
/** Distinct entries whose current draft or published snapshot references the media row `m`. */
export const MEDIA_USAGE_COUNT_SQL = `(select count(distinct s.entry_id)
  from content_media_references r
  join content_snapshots s on s.id = r.snapshot_id
  where r.media_id = m.id)`;
export const MEDIA_CATALOG_SQL = `select ${MEDIA_COLUMNS_SQL}, u.name as created_by_name,
  ${MEDIA_USAGE_COUNT_SQL} as usage_count`;
export const MEDIA_SORT_SQL: Readonly<Record<string, SortSql>> = {
  createdAt: { order: "m.created_at", value: "m.created_at" },
  filename: { order: "m.filename collate nocase", value: "m.filename" },
  size: { order: "m.size", value: "m.size" },
};
export const PUBLIC_ROUTE_SQL = `select e.id, e.model_key, e.draft_snapshot_id, e.published_snapshot_id,
        r.path, s.created_at as published_created_at
   from published_routes r
   join content_entries e on e.id = r.entry_id and e.published_snapshot_id = r.snapshot_id
   join content_snapshots s on s.id = r.snapshot_id`;
export const PUBLIC_MEDIA_SQL = `select ${MEDIA_COLUMNS_SQL}
   from media m
  where m.id = ? and exists (
    select 1 from content_media_references r
    join content_entries e on e.published_snapshot_id = r.snapshot_id
    where r.media_id = m.id
  ) limit 1`;
export const MEDIA_BY_ID_SQL = `select ${MEDIA_COLUMNS_SQL} from media m where m.id = ? limit 1`;
/** Binds media ID, entry limit, and media ID. */
export const MEDIA_USAGE_SQL = `with used as (
   select distinct s.entry_id
     from content_media_references r
     join content_snapshots s on s.id = r.snapshot_id
    where r.media_id = ?
 ), page as (
   select e.id
     from content_entries e
     join used on used.entry_id = e.id
    order by e.updated_at desc, e.id desc
    limit ?
 )
 select e.id as entry_id, e.model_key, d.title, d.slug,
        ${ENTRY_STATUS_SQL} as status,
        case when r.snapshot_id = e.draft_snapshot_id then 'draft' else 'published' end as state,
        r.source_key, r.field_path, b.block_type, b.position
   from content_media_references r
   join content_snapshots s on s.id = r.snapshot_id
   join content_entries e on e.id = s.entry_id
   join content_snapshots d on d.id = e.draft_snapshot_id
   left join content_snapshots p on p.id = e.published_snapshot_id
   left join content_blocks b on b.snapshot_id = r.snapshot_id and b.block_key = r.source_key
  where r.media_id = ? and e.id in (select id from page)
  order by e.updated_at desc, e.id desc`;
export const STORED_MODEL_STATE_SQL = `select m.key, m.kind, m.config_version as version, m.structure_hash, m.projection_hash,
        count(e.id) as entry_count,
        sum(case when e.draft_snapshot_id is null then 0 else 1 end) as draft_snapshot_count,
        sum(case when e.published_snapshot_id is null then 0 else 1 end) as published_snapshot_count
   from content_models m
   left join content_entries e on e.model_key = m.key
  group by m.key, m.kind, m.config_version, m.structure_hash, m.projection_hash
  order by m.key asc`;
/**
 * Renders the stored synchronization state as one JSON text so a D1 batch can
 * compare it with the state its plan was derived from.
 */
export const STORED_MODEL_STATE_JSON_SQL = `(select coalesce(json_group_array(json_array(
    state.key, state.kind, state.version, state.structure_hash, state.projection_hash,
    state.entry_count, state.draft_snapshot_count, state.published_snapshot_count)), '[]')
   from (${STORED_MODEL_STATE_SQL}) state)`;
export const SNAPSHOT_COLUMNS_SQL = `select s.id, s.entry_id, s.revision, s.slug, s.title, s.fields_json, s.schema_version,
        s.created_at, s.updated_at, s.updated_by, u.role
   from content_snapshots s left join user u on u.id = s.updated_by`;
export const BLOCK_COLUMNS_SQL =
  "select snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at from content_blocks";
export const PENDING_SITE_BUILD_SQL =
  "type = 'site.build.requested' and processed_at is null and locked_at is null";

export function failure(message: string): never {
  throw new DomainError("CONTENT_INVALID_STATE", message);
}

export function revisionConflict(message: string): never {
  throw new DomainError("CONTENT_REVISION_CONFLICT", message);
}

export function siteBuildRecord(row: SiteBuildRow): SiteBuildRecord {
  return {
    id: siteBuildId(row.id),
    reason: row.reason,
    status: row.status,
    targetVersion: row.target_version,
    requestedBy: row.requested_by,
    requestedAt: unixMilliseconds(row.requested_at),
    ...(row.started_at === null ? {} : { startedAt: unixMilliseconds(row.started_at) }),
    ...(row.completed_at === null ? {} : { completedAt: unixMilliseconds(row.completed_at) }),
    ...(row.provider_build_id === null ? {} : { providerBuildId: row.provider_build_id }),
    ...(row.error === null ? {} : buildErrorRecord(row.error)),
  };
}

export function sameStoredModelStates(
  expected: readonly StoredContentModelState[],
  actual: readonly StoredContentModelState[],
): boolean {
  if (expected.length !== actual.length) return false;
  return expected.every((value, index) => {
    const candidate = actual[index];
    return (
      candidate !== undefined &&
      value.key === candidate.key &&
      value.kind === candidate.kind &&
      value.version === candidate.version &&
      value.structureHash === candidate.structureHash &&
      value.projectionHash === candidate.projectionHash &&
      value.entryCount === candidate.entryCount &&
      value.draftSnapshotCount === candidate.draftSnapshotCount &&
      value.publishedSnapshotCount === candidate.publishedSnapshotCount
    );
  });
}

export function storedModelStates(
  rows: readonly StoredModelStateRow[],
): readonly StoredContentModelState[] {
  return Object.freeze(
    rows.map((row) => {
      if (row.kind !== "collection" && row.kind !== "page")
        failure("Stored model kind is invalid.");
      return Object.freeze({
        draftSnapshotCount: row.draft_snapshot_count,
        entryCount: row.entry_count,
        key: contentModelKey(row.key),
        kind: row.kind,
        projectionHash: row.projection_hash,
        publishedSnapshotCount: row.published_snapshot_count,
        structureHash: row.structure_hash,
        version: row.version,
      });
    }),
  );
}

export function assertPageSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > SQL_MAX_PAGE_SIZE) {
    failure(`Page limit must be a positive integer no greater than ${SQL_MAX_PAGE_SIZE}.`);
  }
  return value;
}

export function assertNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    failure(`${label} is invalid.`);
  }
  return value;
}

export function assertTimestamp(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0)
    failure(`${label} must be a UTC millisecond value.`);
  return value;
}

/** Rejects drafts that cannot be persisted in one bounded atomic write. */
export function assertDraftPersistenceBounds(
  blocks: readonly unknown[],
  references: readonly unknown[],
): void {
  if (blocks.length > SQL_MAX_DRAFT_BLOCKS) {
    failure(`A draft must not contain more than ${SQL_MAX_DRAFT_BLOCKS} blocks.`);
  }
  if (references.length > SQL_MAX_DRAFT_MEDIA_REFERENCES) {
    failure(
      `A draft must not contain more than ${SQL_MAX_DRAFT_MEDIA_REFERENCES} media references.`,
    );
  }
}

export function sanitizeDispatchError(value: string): string {
  return (
    value
      .replace(/[\r\n\t]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 160) || "storage_unavailable"
  );
}

export function sanitizeBuildReason(value: string): string {
  return normalizeBuildFailure(value).reason;
}
export function encodeBuildError(reason: string, path?: string): string {
  const failure = normalizeBuildFailure(reason, path);
  return failure.path === undefined ? failure.reason : JSON.stringify(failure);
}
export function buildErrorRecord(value: string): { error: string; errorPath?: string } {
  let failure = normalizeBuildFailure(value);
  if (value.startsWith("{") && value.length <= 1024) {
    try {
      const record: unknown = JSON.parse(value);
      if (record !== null && typeof record === "object" && !Array.isArray(record)) {
        const item = record as Record<string, unknown>;
        if (
          Object.keys(item).every((key) => key === "reason" || key === "path") &&
          typeof item.reason === "string" &&
          (item.path === undefined || typeof item.path === "string")
        )
          failure = normalizeBuildFailure(item.reason, item.path);
      }
    } catch {
      /* malformed stored data never reaches transport */
    }
  }
  return {
    error: failure.reason,
    ...(failure.path === undefined ? {} : { errorPath: failure.path }),
  };
}

export function parseObject(value: string, label: string): JsonObject {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      failure(`${label} must contain a JSON object.`);
    }
    return parsed as JsonObject;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    failure(`${label} contains invalid JSON.`);
  }
}

export function storedRole(value: string | null | undefined): Role {
  return value === "admin" || value === "editor" || value === "viewer" ? value : "viewer";
}

/** Base64url without padding, byte-identical to Node's `Buffer` `base64url` encoding. */
export function encodeBase64Url(text: string): string {
  let binary = "";
  for (const byte of new TextEncoder().encode(text)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

export function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/gu, "+").replace(/_/gu, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  return new TextDecoder().decode(
    Uint8Array.from(binary, (character: string) => character.charCodeAt(0)),
  );
}

function parseCursorObject(value: string): Record<string, unknown> {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) failure("Cursor is not base64url encoded.");
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(value));
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 4
    ) {
      failure("Cursor has an invalid shape.");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    failure("Cursor contains invalid JSON.");
  }
}

export function encodeCursor(
  kind: string,
  timestamp: number,
  id: string,
): ReturnType<typeof opaqueCursor> {
  return opaqueCursor(
    encodeBase64Url(JSON.stringify({ id, kind, timestamp, version: SQL_CURSOR_VERSION })),
  );
}

export function decodeCursor(value: string, kind: string): DecodedCursor {
  const candidate = parseCursorObject(value);
  if (
    candidate.version !== SQL_CURSOR_VERSION ||
    candidate.kind !== kind ||
    typeof candidate.id !== "string" ||
    candidate.id.length === 0 ||
    typeof candidate.timestamp !== "number"
  ) {
    failure("Cursor is unsupported or belongs to a different list.");
  }
  return { id: candidate.id, timestamp: assertTimestamp(candidate.timestamp, "Cursor timestamp") };
}

export function encodeSortCursor(
  kind: string,
  value: number | string,
  id: string,
): ReturnType<typeof opaqueCursor> {
  return opaqueCursor(
    encodeBase64Url(JSON.stringify({ id, kind, value, version: SQL_SORT_CURSOR_VERSION })),
  );
}

export function decodeSortCursor(
  value: string,
  kind: string,
  validValue: (sortValue: unknown) => boolean,
): DecodedSortCursor {
  const candidate = parseCursorObject(value);
  if (
    candidate.version !== SQL_SORT_CURSOR_VERSION ||
    candidate.kind !== kind ||
    typeof candidate.id !== "string" ||
    candidate.id.length === 0
  ) {
    failure("Cursor is unsupported or belongs to a different list.");
  }
  if (!validValue(candidate.value)) failure("Cursor sort value is invalid.");
  return { id: candidate.id, value: candidate.value as number | string };
}

export function entryCursorKind(input: ListContentEntriesInput): string {
  return JSON.stringify([
    "entries",
    input.modelKey,
    input.sort,
    input.status ?? null,
    input.q ?? null,
  ]);
}

export function decodeEntryCursor(
  value: string,
  kind: string,
  sort: ContentEntrySort,
): DecodedSortCursor {
  return decodeSortCursor(value, kind, (sortValue) =>
    sort.endsWith("title")
      ? typeof sortValue === "string" && sortValue.length <= MAX_CONTENT_ENTRY_SEARCH_LENGTH
      : typeof sortValue === "number" && Number.isSafeInteger(sortValue) && sortValue >= -1,
  );
}

export function mediaCursorKind(input: ListMediaInput): string {
  return JSON.stringify(["media", input.sort, input.type ?? null, input.q ?? null]);
}

export function decodeMediaCursor(value: string, kind: string, sort: MediaSort): DecodedSortCursor {
  return decodeSortCursor(value, kind, (sortValue) =>
    sort.endsWith("filename")
      ? typeof sortValue === "string" && sortValue.length <= SQL_MAX_MEDIA_FILENAME_LENGTH
      : typeof sortValue === "number" && Number.isSafeInteger(sortValue) && sortValue >= 0,
  );
}

export function entryStatus(value: string): ContentEntryStatus {
  if (value === "changed" || value === "draft" || value === "published") return value;
  failure("Entry status is invalid.");
}

function listValues(fieldsJson: string, listFields: readonly string[]): ContentEntryListValues {
  const values: Record<string, boolean | number | string> = {};
  if (listFields.length === 0) return Object.freeze(values);
  const fields = parseObject(fieldsJson, "Snapshot fields");
  for (const key of listFields) {
    const value = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      values[key] = value;
    }
  }
  return Object.freeze(values);
}

export function entrySummary(row: SummaryRow, listFields: readonly string[]): ContentEntrySummary {
  const status = entryStatus(row.status);
  return Object.freeze({
    draftRevision: row.draft_revision,
    id: contentEntryId(row.id),
    listValues: listValues(row.fields_json, listFields),
    modelKey: contentModelKey(row.model_key),
    ...(row.published_snapshot_id === null || row.published_at === null
      ? {}
      : {
          publishedAt: unixMilliseconds(assertTimestamp(row.published_at, "Publication time")),
          publishedSnapshotId: contentSnapshotId(row.published_snapshot_id),
        }),
    ...(row.slug === null ? {} : { slug: row.slug }),
    status,
    title: row.title,
    updatedAt: unixMilliseconds(assertTimestamp(row.updated_at, "Entry timestamp")),
    updatedBy: Object.freeze({
      displayName: actorDisplayName(row.updated_by, row.updated_by_name),
      id: actorId(row.updated_by),
    }),
  });
}

export function entryTotals(row: TotalsRow): ContentEntryStatusTotals {
  return Object.freeze({
    all: assertNonNegativeInteger(row.total_count, "Entry total"),
    changed: assertNonNegativeInteger(row.changed_count ?? 0, "Changed entry total"),
    draft: assertNonNegativeInteger(row.draft_count ?? 0, "Draft entry total"),
    published: assertNonNegativeInteger(row.published_count ?? 0, "Published entry total"),
  });
}

/** Binds model key and, when searching, the folded term twice. */
export function entryTotalsSql(searching: boolean): string {
  return `select count(*) as total_count,
          sum(case when e.published_snapshot_id is null then 1 else 0 end) as draft_count,
          sum(case when p.revision = d.revision then 1 else 0 end) as published_count,
          sum(case when p.revision <> d.revision then 1 else 0 end) as changed_count
     from ${ENTRY_SOURCE_SQL}
    where e.model_key = ? ${searching ? `and ${ENTRY_SEARCH_SQL}` : ""}`;
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
  return Object.freeze({
    createdAt: unixMilliseconds(integer("created_at")),
    createdBy: actorId(string("created_by")),
    filename: string("filename"),
    ...(typeof height === "number" ? { height } : {}),
    id: string("id") as MediaMetadata["id"],
    mimeType: string("mime_type"),
    size: integer("size"),
    status,
    storageKey: string("storage_key"),
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

interface MediaUsageLocationDraft {
  readonly blockKey?: string;
  blockType?: string;
  readonly field: string;
  position: number;
  readonly states: Set<MediaUsageState>;
}

/** Orders usage locations: entry fields by name, then blocks by position and key. */
function compareUsageLocations(
  left: MediaUsageLocationDraft,
  right: MediaUsageLocationDraft,
): number {
  if ((left.blockKey === undefined) !== (right.blockKey === undefined)) {
    return left.blockKey === undefined ? -1 : 1;
  }
  if (left.position !== right.position) return left.position - right.position;
  const leftKey = `${left.blockKey ?? ""}\u0000${left.field}`;
  const rightKey = `${right.blockKey ?? ""}\u0000${right.field}`;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function usageStates(states: ReadonlySet<MediaUsageState>): readonly MediaUsageState[] {
  return Object.freeze((["draft", "published"] as const).filter((state) => states.has(state)));
}

/** Groups `MEDIA_USAGE_SQL` rows into ordered per-entry usage locations. */
export function mediaUsageEntries(rows: readonly MediaUsageRow[]): readonly MediaUsageEntry[] {
  const entries = new Map<
    string,
    { readonly locations: Map<string, MediaUsageLocationDraft>; readonly row: MediaUsageRow }
  >();
  for (const row of rows) {
    let entry = entries.get(row.entry_id);
    if (entry === undefined) {
      entry = { locations: new Map(), row };
      entries.set(row.entry_id, entry);
    }
    const isBlock = row.source_key !== "$fields";
    if (isBlock && (row.block_type === null || row.position === null)) {
      throw new Error("A media reference names a block that does not exist.");
    }
    const key = `${row.source_key}\u0000${row.field_path}`;
    let location = entry.locations.get(key);
    if (location === undefined) {
      location = {
        ...(isBlock ? { blockKey: row.source_key, blockType: row.block_type! } : {}),
        field: row.field_path,
        position: isBlock ? row.position! : 0,
        states: new Set(),
      };
      entry.locations.set(key, location);
    } else if (isBlock) {
      // The draft's block type describes what an editor sees now.
      if (row.state === "draft") location.blockType = row.block_type!;
      location.position = Math.min(location.position, row.position!);
    }
    location.states.add(row.state);
  }
  return Object.freeze(
    [...entries.values()].map(({ locations, row }) =>
      Object.freeze({
        entryId: contentEntryId(row.entry_id),
        locations: Object.freeze(
          [...locations.values()].sort(compareUsageLocations).map((location): MediaUsageLocation =>
            location.blockKey === undefined
              ? Object.freeze({
                  field: location.field,
                  source: "field" as const,
                  states: usageStates(location.states),
                })
              : Object.freeze({
                  blockKey: blockKey(location.blockKey),
                  blockType: location.blockType!,
                  field: location.field,
                  source: "block" as const,
                  states: usageStates(location.states),
                }),
          ),
        ),
        modelKey: contentModelKey(row.model_key),
        ...(row.slug === null ? {} : { slug: row.slug }),
        status: entryStatus(row.status),
        title: row.title,
      }),
    ),
  );
}

export function chunks<Value>(
  values: readonly Value[],
  size: number,
): readonly (readonly Value[])[] {
  const result: Value[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function storedSnapshot(row: SnapshotRow): StoredSnapshot {
  return {
    blocks: [],
    createdAt: assertTimestamp(row.created_at, "Snapshot creation time"),
    entryId: row.entry_id,
    fields: parseObject(row.fields_json, "Snapshot fields"),
    id: row.id,
    revision: row.revision,
    ...(row.slug === null ? {} : { slug: row.slug }),
    title: row.title,
    updatedAt: assertTimestamp(row.updated_at, "Snapshot update time"),
    updatedBy: { id: actorId(row.updated_by), role: storedRole(row.role) },
  };
}

/** Attaches position-ordered block rows to their snapshots. */
export function storedSnapshots(
  snapshotRows: readonly SnapshotRow[],
  blockRows: readonly BlockRow[],
): Map<string, StoredSnapshot> {
  const snapshots = new Map(snapshotRows.map((row) => [row.id, storedSnapshot(row)]));
  const grouped = new Map<string, ContentBlock[]>();
  for (const row of blockRows) {
    const blocks = grouped.get(row.snapshot_id) ?? [];
    blocks.push({
      data: parseObject(row.data_json, "Block data"),
      key: blockKey(row.block_key),
      position: row.position,
      schemaVersion: row.schema_version,
      type: row.block_type,
    });
    grouped.set(row.snapshot_id, blocks);
  }
  for (const [id, snapshot] of snapshots) {
    snapshots.set(id, { ...snapshot, blocks: Object.freeze(grouped.get(id) ?? []) });
  }
  return snapshots;
}

export function snapshotIdsOf(rows: readonly EntryRow[]): readonly string[] {
  return [
    ...new Set(
      rows
        .flatMap((row) => [row.draft_snapshot_id, row.published_snapshot_id])
        .filter((id): id is string => id !== null),
    ),
  ];
}

export function snapshotValue(source: StoredSnapshot, state: "draft"): DraftSnapshot;
export function snapshotValue(source: StoredSnapshot, state: "published"): PublishedSnapshot;
export function snapshotValue(
  source: StoredSnapshot,
  state: "draft" | "published",
): DraftSnapshot | PublishedSnapshot {
  return Object.freeze({
    blocks: source.blocks,
    createdAt: unixMilliseconds(source.createdAt),
    entryId: contentEntryId(source.entryId),
    fields: source.fields,
    id: contentSnapshotId(source.id),
    revision: source.revision,
    ...(source.slug === undefined ? {} : { slug: source.slug }),
    state,
    title: source.title,
    updatedAt: unixMilliseconds(source.updatedAt),
    updatedBy: Object.freeze({ ...source.updatedBy }),
  }) as DraftSnapshot | PublishedSnapshot;
}

export function hydrateEntries(
  rows: readonly EntryRow[],
  snapshots: ReadonlyMap<string, StoredSnapshot>,
  resolveModel: ContentModelResolver,
): Map<string, ContentEntry> {
  const result = new Map<string, ContentEntry>();
  for (const row of rows) {
    if (row.draft_snapshot_id === null) failure("Content entry is missing its draft snapshot.");
    const draftSource = snapshots.get(row.draft_snapshot_id);
    if (draftSource === undefined) failure("Content entry draft snapshot is missing.");
    const model = resolveModel(row.model_key);
    if (model === undefined)
      failure(`Content model ${row.model_key} is unavailable in runtime configuration.`);
    const publishedSource =
      row.published_snapshot_id === null ? undefined : snapshots.get(row.published_snapshot_id);
    if (row.published_snapshot_id !== null && publishedSource === undefined) {
      failure("Content entry published snapshot is missing.");
    }
    result.set(
      row.id,
      Object.freeze({
        draft: snapshotValue(draftSource, "draft"),
        id: contentEntryId(row.id),
        model: Object.freeze({ ...model }),
        ...(publishedSource === undefined
          ? {}
          : { published: snapshotValue(publishedSource, "published") }),
      }),
    );
  }
  return result;
}

/** Public projections cannot disclose the independently mutable draft snapshot. */
export function publicEntry(entry: ContentEntry): ContentEntry {
  if (entry.published === undefined) failure("Public entry is missing its published snapshot.");
  return Object.freeze({
    draft: Object.freeze({ ...entry.published, state: "draft" as const }),
    id: entry.id,
    model: entry.model,
    published: entry.published,
  });
}

/** Validates a claimed `site.build.requested` payload; `null` marks an invalid event. */
export function siteBuildPayload(payloadJson: string): JsonObject | null {
  let payload: JsonObject;
  try {
    payload = parseObject(payloadJson, "Build payload");
  } catch {
    return null;
  }
  return !Number.isSafeInteger(payload.targetVersion) ||
    Number(payload.targetVersion) < 0 ||
    typeof payload.requestedBy !== "string" ||
    !payload.requestedBy ||
    typeof payload.reason !== "string" ||
    !payload.reason ||
    !Number.isSafeInteger(payload.requestedAt)
    ? null
    : payload;
}

/** Maps SQLite and D1 constraint failures to stable domain errors. */
export function sqliteWriteError(error: unknown, pageCreation: boolean, runtime: string): never {
  if (error instanceof DomainError) throw error;
  const message = error instanceof Error ? error.message : "";
  if (
    pageCreation &&
    (message.includes("content_entries_singleton_idx") ||
      message.includes("UNIQUE constraint failed: content_entries.model_key"))
  ) {
    throw new DomainError(
      "CONTENT_MODEL_CARDINALITY_CONFLICT",
      "A page model already has its singleton entry.",
    );
  }
  if (message.includes("UNIQUE constraint failed: published_routes.path")) {
    throw new DomainError("CONTENT_ROUTE_CONFLICT", "The public path belongs to another entry.");
  }
  if (message.includes("NOT NULL constraint failed: content_media_references.media_id")) {
    failure("Media is unavailable for reference.");
  }
  throw new DomainError("CONTENT_INVALID_STATE", `${runtime} content write failed.`);
}
