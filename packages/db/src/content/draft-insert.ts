import { isSingletonKind } from "@lacecms/domain";
import type { ContentBlock, ContentEntry } from "@lacecms/domain";
import type { WritePlanGuard, WritePlanStatement } from "../write-plan/plan.js";
import { seoJson } from "./snapshots.js";

export function values(rows: number, width: number, offset: number): string {
  return Array.from(
    { length: rows },
    (_, row) =>
      `(${Array.from({ length: width }, (_, col) => `?${offset + row * width + col + 1}`).join(", ")})`,
  ).join(", ");
}

export function blockStatements(
  snapshotId: string,
  timestamp: number,
  blocks: readonly ContentBlock[],
  guard: WritePlanGuard,
): WritePlanStatement[] {
  const statements: WritePlanStatement[] = [];
  const shared = [snapshotId, timestamp, ...guard.params];
  const size = Math.floor((100 - shared.length) / 6);
  for (let offset = 0; offset < blocks.length; offset += size) {
    const group = blocks.slice(offset, offset + size);
    statements.push({
      sql: `insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, anchor, class_name, hidden, settings_json, created_at, updated_at)
      select ?1, v.column1, v.column2, v.column3, v.column4, v.column5, v.column6 ->> '$.anchor', v.column6 ->> '$.className', coalesce(v.column6 ->> '$.hidden', 0), coalesce(v.column6 -> '$.settings', '{}'), ?2, ?2
      from (values ${values(group.length, 6, shared.length)}) v where ${guard.params.length ? guard.sql.replace("?", "?3") : guard.sql}`,
      params: [
        ...shared,
        ...group.flatMap((block) => [
          block.key,
          block.type,
          block.position,
          block.schemaVersion,
          JSON.stringify(block.data),
          JSON.stringify({
            ...(block.anchor === undefined ? {} : { anchor: block.anchor }),
            ...(block.className === undefined ? {} : { className: block.className }),
            hidden: block.hidden ? 1 : 0,
            settings: block.settings,
          }),
        ]),
      ],
    });
  }
  return statements;
}

/** The ordered inserts and pointer write shared by entry and sync creation. */
export function draftInserts(
  entry: ContentEntry,
  g: WritePlanGuard,
): {
  readonly entry: WritePlanStatement;
  readonly snapshot: WritePlanStatement;
  readonly blocks: readonly WritePlanStatement[];
  readonly pointer: WritePlanStatement;
} {
  const { id, model, draft } = entry;
  return {
    entry: {
      sql: `insert into content_entries (id,model_key,singleton_key,created_by,created_at,updated_at) select ?,?,?,?,?,? where ${g.sql}`,
      params: [
        id,
        model.key,
        isSingletonKind(model.kind) ? 1 : null,
        draft.updatedBy.id,
        draft.createdAt,
        draft.updatedAt,
        ...g.params,
      ],
    },
    snapshot: {
      sql: `insert into content_snapshots (id,entry_id,revision,slug,title,fields_json,seo_json,schema_version,created_at,updated_at,updated_by) select ?,?,?,?,?,?,?,config_version,?,?,? from content_models where key=? and ${g.sql}`,
      params: [
        draft.id,
        id,
        draft.revision,
        draft.slug ?? null,
        draft.title,
        JSON.stringify(draft.fields),
        seoJson(draft.seo),
        draft.createdAt,
        draft.updatedAt,
        draft.updatedBy.id,
        model.key,
        ...g.params,
      ],
    },
    blocks: blockStatements(draft.id, draft.updatedAt, draft.blocks, g),
    pointer: {
      sql: `update content_entries set draft_snapshot_id=? where id=? and ${g.sql}`,
      params: [draft.id, id, ...g.params],
    },
  };
}
