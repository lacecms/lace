import { failure } from "../shared/failures.js";
import type { ConfigurationSyncContentWrite } from "@lacecms/application";

const BACKFILL_FIELD_KEY = /^[A-Za-z][A-Za-z0-9]*$/u;

/**
 * Set-based default backfill for one field of one model. Binds the default as
 * JSON text and the model key; rows that already hold the key are untouched.
 */
export function backfillFieldSql(fieldKey: string): string {
  if (!BACKFILL_FIELD_KEY.test(fieldKey)) failure("Backfill field key is invalid.");
  return `update content_snapshots set fields_json = json_set(fields_json, '$.${fieldKey}', json(?))
   where entry_id in (select id from content_entries where model_key = ?)
     and json_type(fields_json, '$.${fieldKey}') is null`;
}

function syncFieldPath(fieldKey: string): string {
  if (!BACKFILL_FIELD_KEY.test(fieldKey)) failure("Synchronization field key is invalid.");
  return `'$.${fieldKey}'`;
}

/** One parameterized statement of a synchronization content write. */
export interface ConfigurationSyncWriteStatement {
  readonly params: readonly (number | string)[];
  readonly sql: string;
}

const MODEL_ENTRY_IDS_SQL = "select id from content_entries where model_key = ?";

const MODEL_SNAPSHOT_IDS_SQL = `select s.id from content_snapshots s
     join content_entries e on e.id = s.entry_id where e.model_key = ?`;

/**
 * Set-based statements for one synchronization content write of one model.
 * Every statement ends in a `where` clause so a D1 batch can append its guard.
 * Field keys are checked before they are interpolated into JSON paths; block
 * types, field keys used as values and the model key are bound.
 */
export function configurationSyncWriteStatements(
  write: ConfigurationSyncContentWrite,
  modelKey: string,
): readonly ConfigurationSyncWriteStatement[] {
  switch (write.action) {
    case "rename-field": {
      const from = syncFieldPath(write.from);
      const to = syncFieldPath(write.to);
      return [
        {
          // `->` keeps the JSON representation of every value type.
          params: [modelKey],
          sql: `update content_snapshots
     set fields_json = json_remove(json_set(fields_json, ${to}, json(fields_json -> ${from})), ${from})
   where entry_id in (${MODEL_ENTRY_IDS_SQL}) and json_type(fields_json, ${from}) is not null`,
        },
        {
          params: [write.to, write.from, modelKey],
          sql: `update content_media_references set field_path = ?
   where source_key = '$fields' and field_path = ? and snapshot_id in (${MODEL_SNAPSHOT_IDS_SQL})`,
        },
      ];
    }
    case "remove-field": {
      const path = syncFieldPath(write.fieldKey);
      return [
        {
          params: [modelKey],
          sql: `update content_snapshots set fields_json = json_remove(fields_json, ${path})
   where entry_id in (${MODEL_ENTRY_IDS_SQL}) and json_type(fields_json, ${path}) is not null`,
        },
        {
          params: [write.fieldKey, modelKey],
          sql: `delete from content_media_references
   where source_key = '$fields' and field_path = ? and snapshot_id in (${MODEL_SNAPSHOT_IDS_SQL})`,
        },
      ];
    }
    case "remove-block-type":
      return [
        {
          params: [modelKey, write.blockType],
          sql: `delete from content_media_references
   where snapshot_id in (${MODEL_SNAPSHOT_IDS_SQL})
     and exists (select 1 from content_blocks b
                  where b.snapshot_id = content_media_references.snapshot_id
                    and b.block_key = content_media_references.source_key
                    and b.block_type = ?)`,
        },
        {
          params: [write.blockType, modelKey],
          sql: `delete from content_blocks
   where block_type = ? and snapshot_id in (${MODEL_SNAPSHOT_IDS_SQL})`,
        },
      ];
    case "backfill-field":
      return [{ params: [write.json, modelKey], sql: backfillFieldSql(write.fieldKey) }];
    case "remove-seo":
      return [
        {
          params: [modelKey],
          sql: `update content_snapshots set seo_json = null
   where entry_id in (${MODEL_ENTRY_IDS_SQL}) and seo_json is not null`,
        },
        {
          params: [modelKey],
          sql: `delete from content_media_references
   where source_key = '$seo' and snapshot_id in (${MODEL_SNAPSHOT_IDS_SQL})`,
        },
      ];
  }
}
