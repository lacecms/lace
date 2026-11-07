import { chunks } from "../shared/values.js";
import { syncInternalLinkStatements } from "../links/statements.js";
import type { ConfigurationSyncSnapshotMigration } from "@lacecms/application";
import type { ConfigurationSyncWriteStatement } from "./writes.js";

/** Guard condition and ordered writes of one migrated snapshot. */
export interface ConfigurationSyncMigrationStatements {
  /** A boolean SQL expression that holds only while the snapshot is unchanged since the scan. */
  readonly guard: ConfigurationSyncWriteStatement;
  /** Writes that each end in a `where` clause, so a D1 batch can append its guard. */
  readonly writes: readonly ConfigurationSyncWriteStatement[];
}

const MIGRATED_BLOCK_VALUES = 5;

const MIGRATED_REFERENCE_VALUES = 3;

function valueRows(rows: number, width: number): string {
  const tuple = `(${Array.from({ length: width }, () => "?").join(", ")})`;
  return Array.from({ length: rows }, () => tuple).join(", ");
}

/**
 * Guard and in-place writes for one snapshot of a block-migration unit. Each
 * write binds at most `maxParameters` anonymous values in textual order, so a
 * D1 batch can append its guard parameters after them.
 */
export function configurationSyncMigrationStatements(
  migration: ConfigurationSyncSnapshotMigration,
  migratedAt: number,
  maxParameters: number,
  linkDirtyToken?: string,
): ConfigurationSyncMigrationStatements {
  const current =
    migration.state === "draft" ? "e.draft_snapshot_id = s.id" : "e.published_snapshot_id = s.id";
  const expectedBlocks = JSON.stringify(
    migration.blocks.map((block) => [block.key, block.expectedSchemaVersion]),
  );
  const guardParams: (number | string)[] = [
    migration.snapshotId,
    migration.expectedRevision,
    expectedBlocks,
    migration.snapshotId,
    migration.blocks.length,
  ];
  let guardSql = `(exists (select 1 from content_snapshots s join content_entries e on e.id = s.entry_id
              where s.id = ? and s.revision = ? and ${current})
   and (select count(*) from content_blocks b, json_each(?) j
         where b.snapshot_id = ? and b.block_key = j.value ->> 0
           and b.schema_version = j.value ->> 1) = ?`;
  if (migration.draftGuard !== undefined) {
    guardSql += `
   and exists (select 1 from content_snapshots d join content_entries e on e.draft_snapshot_id = d.id
                where d.id = ? and d.revision = ?)`;
    guardParams.push(migration.draftGuard.snapshotId, migration.draftGuard.revision);
  }
  const links =
    migration.internalLinks === undefined
      ? undefined
      : syncInternalLinkStatements(
          [{ snapshotId: migration.snapshotId, references: migration.internalLinks }],
          linkDirtyToken ?? "sync-links",
        );
  for (const valid of links?.valid ?? []) {
    guardSql += ` and (${valid.sql})`;
    guardParams.push(...valid.params);
  }
  guardSql += ")";

  const writes: ConfigurationSyncWriteStatement[] = [...(links?.writes ?? [])];
  // Each write also binds the migration time and the snapshot ID.
  const shared = 2;
  const blockRows = Math.floor((maxParameters - shared) / MIGRATED_BLOCK_VALUES);
  for (const group of chunks(migration.blocks, blockRows)) {
    writes.push({
      params: [
        migratedAt,
        ...group.flatMap((block) => [
          block.key,
          block.schemaVersion,
          JSON.stringify(block.data),
          block.expectedSchemaVersion,
          JSON.stringify(block.settings),
        ]),
        migration.snapshotId,
      ],
      sql: `update content_blocks
     set schema_version = v.column2, data_json = v.column3, settings_json = v.column5, updated_at = ?
    from (values ${valueRows(group.length, MIGRATED_BLOCK_VALUES)}) as v
   where content_blocks.snapshot_id = ? and content_blocks.block_key = v.column1
     and content_blocks.schema_version = v.column4`,
    });
  }
  writes.push({
    params: [migration.snapshotId, JSON.stringify(migration.blocks.map((block) => block.key))],
    sql: `delete from content_media_references
   where snapshot_id = ? and source_key in (select value from json_each(?))`,
  });
  const referenceRows = Math.floor((maxParameters - shared) / MIGRATED_REFERENCE_VALUES);
  for (const group of chunks(migration.references, referenceRows)) {
    writes.push({
      params: [
        migration.snapshotId,
        migratedAt,
        ...group.flatMap((reference) => [
          reference.sourceKey,
          reference.fieldPath,
          reference.mediaId,
        ]),
      ],
      // A missing or inactive media ID yields NULL and fails the NOT NULL constraint.
      sql: `insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at)
   select ?, v.column1, v.column2,
          (select m.id from media m where m.id = v.column3 and m.status = 'active'), ?
     from (values ${valueRows(group.length, MIGRATED_REFERENCE_VALUES)}) as v
    where 1 = 1`,
    });
  }
  writes.push(
    migration.updatedBy === undefined
      ? {
          params: [migration.revision, migratedAt, migration.snapshotId],
          sql: "update content_snapshots set revision = ?, updated_at = ? where id = ?",
        }
      : {
          params: [migration.revision, migratedAt, migration.updatedBy, migration.snapshotId],
          sql: "update content_snapshots set revision = ?, updated_at = ?, updated_by = ? where id = ?",
        },
  );
  return Object.freeze({
    guard: { params: guardParams, sql: guardSql },
    writes: Object.freeze(writes),
  });
}
