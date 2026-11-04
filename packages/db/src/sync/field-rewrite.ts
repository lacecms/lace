import { failure } from "../shared/failures.js";
import type { ConfigurationSyncSnapshotRewrite } from "@lacecms/application";
import type { ConfigurationSyncWriteStatement } from "./writes.js";

// Web-platform globals available in both Node and Workers; this package compiles
// against ES2024 only, so declare the narrow surface it uses.
declare const TextEncoder: new () => { encode(input: string): Uint8Array };

/** Parameterized bulk replacements; all returned statements belong to one guarded final mutation. */
export function configurationSyncSnapshotRewriteStatements(
  rows: readonly ConfigurationSyncSnapshotRewrite[],
  modelKey: string,
): readonly ConfigurationSyncWriteStatement[] {
  const chunks: string[] = [];
  const encoder = new TextEncoder();
  let parts: string[] = [];
  let bytes = 2;
  const ids = new Set<string>();
  for (const row of rows) {
    if (ids.has(row.id)) failure("Duplicate synchronization snapshot replacement.");
    ids.add(row.id);
    const json = JSON.stringify(row);
    const size = encoder.encode(json).length;
    if (size + 2 > 1_500_000)
      failure("Synchronization snapshot replacement exceeds payload capacity.");
    if (parts.length > 0 && bytes + size + 1 > 1_500_000) {
      chunks.push(`[${parts.join(",")}]`);
      parts = [];
      bytes = 2;
    }
    parts.push(json);
    bytes += size + 1;
  }
  if (parts.length > 0) chunks.push(`[${parts.join(",")}]`);
  return chunks.flatMap((json) => [
    {
      params: [json, json, modelKey],
      sql: `update content_snapshots set fields_json =
      (select value -> 'fields' from json_each(?) where value ->> 'id' = content_snapshots.id)
      where id in (select value ->> 'id' from json_each(?))
      and entry_id in (select id from content_entries where model_key = ?)`,
    },
    {
      params: [json, modelKey],
      sql: `delete from content_media_references
      where source_key = '$fields' and snapshot_id in (select value ->> 'id' from json_each(?))
      and snapshot_id in (select s.id from content_snapshots s join content_entries e on e.id = s.entry_id where e.model_key = ?)`,
    },
    {
      params: [json, modelKey],
      sql: `insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at)
      select s.id, '$fields', r.value ->> 'fieldPath', r.value ->> 'mediaId', s.updated_at
      from json_each(?) p join content_snapshots s on s.id = p.value ->> 'id'
      join content_entries e on e.id = s.entry_id, json_each(p.value -> 'references') r
      where e.model_key = ?`,
    },
  ]);
}

/** Binds model key and exclusive snapshot-ID cursor; at most 100 current snapshots. */
export const SYNC_FIELD_REWRITE_ROWS_SQL = `select s.id, s.fields_json,
  case when e.published_snapshot_id = s.id then 'published' else 'draft' end as state
  from content_snapshots s join content_entries e on e.id=s.entry_id
  where e.model_key=? and s.id>? and s.id in (e.draft_snapshot_id,e.published_snapshot_id)
  order by s.id limit 100`;

export interface SyncFieldRewriteRow {
  readonly id: string;
  readonly fields_json: string;
  readonly state: "draft" | "published";
}
