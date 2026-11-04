import { failure } from "../shared/failures.js";
import { parseObject } from "../shared/values.js";
import { SNAPSHOT_INTERNAL_LINKS_JSON_SQL } from "../links/statements.js";
import type {
  ConfigurationSyncMediaReference,
  ConfigurationSyncMigrationBlock,
  ConfigurationSyncMigrationPage,
  ConfigurationSyncMigrationSnapshot,
  ConfigurationSyncMigrationTarget,
} from "@lacecms/application";

/**
 * Entries of one model holding a block of a target type at another schema
 * version. Binds model key, target JSON (`[[type, version], …]`), exclusive
 * entry-ID cursor and page limit.
 */
export const SYNC_MIGRATION_ENTRIES_SQL = `select e.id, e.draft_snapshot_id, e.published_snapshot_id
   from content_entries e
  where e.model_key = ?
    and exists (select 1 from content_blocks b, json_each(?) t
                 where b.snapshot_id in (e.draft_snapshot_id, e.published_snapshot_id)
                   and b.block_type = t.value ->> 0 and b.schema_version <> t.value ->> 1)
    and e.id > ?
  order by e.id asc
  limit ?`;

/** Snapshot heads for a list of snapshot IDs; append the placeholders. */
export const SYNC_MIGRATION_SNAPSHOTS_SQL = `select s.id, s.revision, s.title, s.fields_json, ${SNAPSHOT_INTERNAL_LINKS_JSON_SQL} as internal_links_json from content_snapshots s where s.id in`;

/**
 * Blocks of a list of snapshot IDs with all data for list budgets and settings only for target types. Binds the
 * target type JSON array first; append the snapshot placeholders and the order.
 */
export const SYNC_MIGRATION_BLOCKS_SQL = `with target(type) as (select value from json_each(?))
 select snapshot_id, block_key, block_type, position, schema_version, hidden,
        data_json,
        case when block_type in (select type from target) then settings_json end as settings_json
   from content_blocks where snapshot_id in`;

/** Media references of a list of snapshot IDs; append the placeholders. */
export const SYNC_MIGRATION_REFERENCES_SQL =
  "select snapshot_id, source_key, field_path, media_id from content_media_references where snapshot_id in";

export interface SyncMigrationEntryRow {
  readonly draft_snapshot_id: string | null;
  readonly id: string;
  readonly published_snapshot_id: string | null;
}

export interface SyncMigrationSnapshotRow {
  readonly internal_links_json?: string;
  readonly fields_json: string;
  readonly id: string;
  readonly revision: number;
  readonly title: string;
}

export interface SyncMigrationBlockRow {
  readonly block_key: string;
  readonly block_type: string;
  readonly data_json: string;
  readonly hidden: number;
  readonly position: number;
  readonly schema_version: number;
  readonly settings_json: string | null;
  readonly snapshot_id: string;
}

export interface SyncMigrationReferenceRow {
  readonly field_path: string;
  readonly media_id: string;
  readonly snapshot_id: string;
  readonly source_key: string;
}

/** Largest migration scan page either adapter serves. */
export const SQL_MAX_MIGRATION_PAGE_SIZE = 50;

export function assertMigrationPageSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > SQL_MAX_MIGRATION_PAGE_SIZE) {
    failure(`Migration page size must be between 1 and ${SQL_MAX_MIGRATION_PAGE_SIZE}.`);
  }
  return value;
}

/** The stale-plan failure raised when a block-migration guard no longer holds. */
export function staleBlockMigration(): never {
  failure("Block migration guard failed; the synchronization plan is stale.");
}

/** Bound JSON of migration targets for {@link SYNC_MIGRATION_ENTRIES_SQL}. */
export function syncMigrationTargetsJson(
  targets: readonly ConfigurationSyncMigrationTarget[],
): string {
  return JSON.stringify(targets.map((target) => [target.type, target.version]));
}

/** Snapshot IDs referenced by migration entry rows, in row order. */
export function syncMigrationSnapshotIds(rows: readonly SyncMigrationEntryRow[]): string[] {
  return rows.flatMap((row) =>
    [row.draft_snapshot_id, row.published_snapshot_id].filter((id): id is string => id !== null),
  );
}

/** Maps one migration scan page of entry, snapshot, block and reference rows. */
export function syncMigrationPage(
  rows: readonly SyncMigrationEntryRow[],
  snapshotRows: readonly SyncMigrationSnapshotRow[],
  blockRows: readonly SyncMigrationBlockRow[],
  referenceRows: readonly SyncMigrationReferenceRow[],
  limit: number,
): ConfigurationSyncMigrationPage {
  const blocks = new Map<string, ConfigurationSyncMigrationBlock[]>();
  for (const row of [...blockRows].sort(
    (left, right) =>
      left.snapshot_id.localeCompare(right.snapshot_id) || left.position - right.position,
  )) {
    const list = blocks.get(row.snapshot_id) ?? [];
    list.push(
      Object.freeze({
        data: parseObject(row.data_json, "Block data"),
        hidden: row.hidden === 1,
        key: row.block_key,
        position: row.position,
        schemaVersion: row.schema_version,
        ...(row.settings_json === null
          ? {}
          : { settings: parseObject(row.settings_json, "Block settings") }),
        type: row.block_type,
      }),
    );
    blocks.set(row.snapshot_id, list);
  }
  const references = new Map<string, ConfigurationSyncMediaReference[]>();
  for (const row of [...referenceRows].sort(
    (left, right) =>
      left.snapshot_id.localeCompare(right.snapshot_id) ||
      left.source_key.localeCompare(right.source_key) ||
      left.field_path.localeCompare(right.field_path),
  )) {
    const list = references.get(row.snapshot_id) ?? [];
    list.push(
      Object.freeze({
        fieldPath: row.field_path,
        mediaId: row.media_id,
        sourceKey: row.source_key,
      }),
    );
    references.set(row.snapshot_id, list);
  }
  const snapshots = new Map(snapshotRows.map((row) => [row.id, row]));
  const snapshot = (
    id: string | null,
    state: "draft" | "published",
  ): ConfigurationSyncMigrationSnapshot | undefined => {
    const row = id === null ? undefined : snapshots.get(id);
    if (row === undefined) return undefined;
    return Object.freeze({
      blocks: Object.freeze(blocks.get(row.id) ?? []),
      fields: parseObject(row.fields_json, "Snapshot fields"),
      ...(row.internal_links_json === undefined || row.internal_links_json === "[]"
        ? {}
        : {
            internalLinks: JSON.parse(
              row.internal_links_json,
            ) as readonly import("@lacecms/content").InternalLinkReference[],
          }),
      references: Object.freeze(references.get(row.id) ?? []),
      revision: row.revision,
      snapshotId: row.id,
      state,
      title: row.title,
    });
  };
  const items = rows.map((row) => {
    const draft = snapshot(row.draft_snapshot_id, "draft");
    const published = snapshot(row.published_snapshot_id, "published");
    return Object.freeze({
      ...(draft === undefined ? {} : { draft }),
      entryId: row.id,
      ...(published === undefined ? {} : { published }),
    });
  });
  const last = rows.at(-1);
  return Object.freeze({
    items: Object.freeze(items),
    ...(rows.length === limit && last !== undefined ? { next: last.id } : {}),
  });
}
