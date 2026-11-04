export interface BlockRow {
  readonly anchor: string | null;
  readonly block_key: string;
  readonly block_type: string;
  readonly class_name: string | null;
  readonly created_at: number;
  readonly data_json: string;
  readonly hidden: number;
  readonly position: number;
  readonly schema_version: number;
  readonly settings_json: string;
  readonly snapshot_id: string;
  readonly updated_at: number;
}

export const BLOCK_COLUMNS_SQL =
  "select snapshot_id, block_key, block_type, position, schema_version, data_json, anchor, class_name, hidden, settings_json, created_at, updated_at from content_blocks";

/** Columns of a content block row, listed by every copy between snapshots. */
export const BLOCK_COPY_COLUMNS_SQL =
  "block_key, block_type, position, schema_version, data_json, anchor, class_name, hidden, settings_json, created_at, updated_at";

/** Copies one snapshot's blocks into another. Parameters: target, source, then `condition`'s. */
export function copySnapshotBlocksSql(condition = "1 = 1"): string {
  return `insert into content_blocks (snapshot_id, ${BLOCK_COPY_COLUMNS_SQL})
  select ?, ${BLOCK_COPY_COLUMNS_SQL}
    from content_blocks where snapshot_id = ? and ${condition}`;
}
