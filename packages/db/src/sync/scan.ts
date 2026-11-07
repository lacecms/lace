import { parseObject } from "../shared/values.js";
import { SNAPSHOT_INTERNAL_LINKS_JSON_SQL } from "../links/statements.js";
import type {
  ConfigurationSyncSnapshot,
  ConfigurationSyncSnapshotPage,
} from "@lacecms/application";

export interface SyncSnapshotRow {
  readonly internal_links_json?: string;
  readonly references_json?: string;
  readonly entry_id: string;
  readonly fields_json: string;
  /** 1 when the snapshot holds an SEO group. */
  readonly has_seo: number;
  readonly id: string;
  readonly revision: number;
  readonly state: string;
  readonly title: string;
}

export interface SyncBlockRow {
  readonly settings_json?: string;
  readonly data_json?: string;
  readonly hidden?: number;
  readonly block_key: string;
  readonly block_type: string;
  readonly schema_version: number;
  readonly snapshot_id: string;
}

/** Binds model key, exclusive snapshot-ID cursor, and page limit. */
export const SYNC_SNAPSHOTS_SQL = `select ${SNAPSHOT_INTERNAL_LINKS_JSON_SQL} as internal_links_json, s.id, s.entry_id, s.revision, s.title, s.fields_json,
        s.seo_json is not null as has_seo,
        (select coalesce(json_group_array(json_object('sourceKey',r.source_key,'fieldPath',r.field_path,'mediaId',r.media_id)), '[]') from content_media_references r where r.snapshot_id=s.id) as references_json,
        case when e.published_snapshot_id = s.id then 'published' else 'draft' end as state
   from content_snapshots s
   join content_entries e on e.id = s.entry_id
  where e.model_key = ? and (s.id = e.draft_snapshot_id or s.id = e.published_snapshot_id)
    and s.id > ?
  order by s.id asc
  limit ?`;

/** Block summaries for a list of snapshot IDs; append the placeholders. */
export const SYNC_BLOCKS_SQL =
  "select snapshot_id, block_key, block_type, schema_version, data_json, settings_json, hidden from content_blocks where snapshot_id in";

/** Maps one scan page of snapshot and block rows to portable values. */
export function syncSnapshotPage(
  rows: readonly SyncSnapshotRow[],
  blockRows: readonly SyncBlockRow[],
  limit: number,
): ConfigurationSyncSnapshotPage {
  const blocks = new Map<string, ConfigurationSyncSnapshot["blocks"][number][]>();
  for (const row of blockRows) {
    const list = blocks.get(row.snapshot_id) ?? [];
    list.push({
      key: row.block_key,
      schemaVersion: row.schema_version,
      type: row.block_type,
      data: parseObject(row.data_json ?? "{}", "Block data"),
      settings: parseObject(row.settings_json ?? "{}", "Block settings"),
      hidden: row.hidden === 1,
    });
    blocks.set(row.snapshot_id, list);
  }
  const items: ConfigurationSyncSnapshot[] = rows.map((row) =>
    Object.freeze({
      blocks: Object.freeze(blocks.get(row.id) ?? []),
      ...(row.internal_links_json === undefined
        ? {}
        : {
            internalLinks: JSON.parse(
              row.internal_links_json,
            ) as readonly import("@lacecms/content").InternalLinkReference[],
          }),
      entryId: row.entry_id,
      fields: parseObject(row.fields_json, "Snapshot fields"),
      references: JSON.parse(row.references_json ?? "[]") as NonNullable<
        ConfigurationSyncSnapshot["references"]
      >,
      hasSeo: row.has_seo === 1,
      revision: row.revision,
      snapshotId: row.id,
      state: row.state === "published" ? "published" : "draft",
      title: row.title,
    }),
  );
  const last = rows.at(-1);
  return Object.freeze({
    items: Object.freeze(items),
    ...(rows.length === limit && last !== undefined ? { next: last.id } : {}),
  });
}
