import { SQL_MAX_DRAFT_BLOCKS, SQL_MAX_DRAFT_MEDIA_REFERENCES } from "../shared/limits.js";
import { failure } from "../shared/failures.js";
import { assertTimestamp, parseObject, storedRole } from "../shared/values.js";
import type { JsonObject } from "@lacecms/content";
import {
  actorId,
  blockKey,
  cloneEntrySeo,
  contentEntryId,
  contentSnapshotId,
  normalizeEntrySeo,
  unixMilliseconds,
} from "@lacecms/domain";
import type {
  Actor,
  ContentBlock,
  ContentEntry,
  DraftSnapshot,
  EntrySeo,
  PublishedSnapshot,
} from "@lacecms/domain";
import type { ContentModelResolver, EntryRow } from "./entries.js";
import type { BlockRow } from "./blocks.js";

export interface SnapshotRow {
  readonly created_at: number;
  readonly entry_id: string;
  readonly fields_json: string;
  readonly id: string;
  readonly revision: number;
  readonly role: string | null;
  readonly schema_version: number;
  readonly seo_json: string | null;
  readonly slug: string | null;
  readonly title: string;
  readonly updated_at: number;
  readonly updated_by: string;
}

export interface StoredSnapshot {
  readonly blocks: readonly ContentBlock[];
  readonly createdAt: number;
  readonly entryId: string;
  readonly fields: JsonObject;
  readonly id: string;
  readonly revision: number;
  readonly seo?: EntrySeo;
  readonly slug?: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly updatedBy: Actor;
}

export const SNAPSHOT_COLUMNS_SQL = `select s.id, s.entry_id, s.revision, s.slug, s.title, s.fields_json, s.seo_json, s.schema_version,
        s.created_at, s.updated_at, s.updated_by, u.role
   from content_snapshots s left join user u on u.id = s.updated_by`;

/** Idempotency scope of one actor's unpublications of one entry. */
export function unpublicationScope(entryId: string, actorId: string): string {
  return `unpublication:${entryId}:${actorId}`;
}

/** Reads a duplicate source's current draft revision. */
export const DUPLICATE_SOURCE_REVISION_SQL =
  "select d.revision from content_entries e join content_snapshots d on d.id = e.draft_snapshot_id where e.id = ?";

/**
 * Replaces a draft's scalar content with its publication and advances the
 * draft revision. Parameters: updated_at, updated_by, published ID, draft ID,
 * then those of `condition`.
 */
export function revertDraftSnapshotSql(condition: string): string {
  return `update content_snapshots
     set revision = revision + 1, slug = p.slug, title = p.title, fields_json = p.fields_json,
         seo_json = p.seo_json, schema_version = p.schema_version, updated_at = ?, updated_by = ?
    from (select slug, title, fields_json, seo_json, schema_version from content_snapshots where id = ?) as p
   where content_snapshots.id = ? and ${condition}`;
}

/** Copies one snapshot's media references into another. Parameters: target, source, then `condition`'s. */
export function copySnapshotReferencesSql(condition = "1 = 1"): string {
  return `insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at)
  select ?, source_key, field_path, media_id, created_at
    from content_media_references where snapshot_id = ? and ${condition}`;
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

/** Serializes a normalized SEO group for `content_snapshots.seo_json`; `NULL` when absent. */
export function seoJson(seo: EntrySeo | undefined): string | null {
  return seo === undefined ? null : JSON.stringify(cloneEntrySeo(seo));
}

/** Parses a stored SEO group, re-applying the shared rules to catch corrupt rows. */
function storedSeo(value: string): EntrySeo {
  const seo = normalizeEntrySeo(parseObject(value, "Snapshot SEO"), { enabled: true });
  if (seo === undefined) failure("A stored SEO group must hold at least one value.");
  return seo;
}

export function storedSnapshot(row: SnapshotRow): StoredSnapshot {
  return {
    blocks: [],
    createdAt: assertTimestamp(row.created_at, "Snapshot creation time"),
    entryId: row.entry_id,
    fields: parseObject(row.fields_json, "Snapshot fields"),
    id: row.id,
    revision: row.revision,
    ...(row.seo_json === null ? {} : { seo: storedSeo(row.seo_json) }),
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
      ...(row.anchor === null ? {} : { anchor: row.anchor }),
      ...(row.class_name === null ? {} : { className: row.class_name }),
      data: parseObject(row.data_json, "Block data"),
      hidden: row.hidden === 1,
      key: blockKey(row.block_key),
      position: row.position,
      schemaVersion: row.schema_version,
      settings: parseObject(row.settings_json, "Block settings"),
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
    ...(source.seo === undefined ? {} : { seo: source.seo }),
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
