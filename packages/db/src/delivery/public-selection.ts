import type { ListPublicContentInput } from "@lacecms/application";
import { BLOCK_COLUMNS_SQL } from "../content/blocks.js";
import { SNAPSHOT_FIELDS_SQL, SNAPSHOT_FROM_SQL } from "../content/snapshot-columns.js";
import { decodeCursor } from "../shared/cursors.js";
import { assertPageSize } from "../shared/values.js";
import {
  PUBLIC_GLOBAL_FROM_SQL,
  PUBLIC_INTERNAL_LINKS_JSON_SQL,
  PUBLIC_RECORD_FROM_SQL,
  PUBLIC_ROUTE_FROM_SQL,
  publicSnapshotMediaBySelectionSql,
} from "./public.js";

export interface PublicSelection {
  readonly sql: string;
  readonly params: readonly (string | number)[];
  readonly limit: number;
  readonly cursorKind?: string;
}

const CANDIDATE_SQL =
  "select e.id, e.model_key, e.published_snapshot_id, s.created_at as published_created_at";
const ROUTED_CANDIDATE_SQL = `${CANDIDATE_SQL}, r.path ${PUBLIC_ROUTE_FROM_SQL}`;

export function publicPathSelection(path: string): PublicSelection {
  return { sql: `${ROUTED_CANDIDATE_SQL} where r.path = ? limit ?`, params: [path], limit: 1 };
}

export function publicGlobalSelection(modelKey: string): PublicSelection {
  return {
    sql: `${CANDIDATE_SQL} ${PUBLIC_GLOBAL_FROM_SQL} where e.model_key = ? limit ?`,
    params: [modelKey],
    limit: 1,
  };
}

export function publicListSelection(
  input: ListPublicContentInput,
  family: "public" | "public-records",
): PublicSelection {
  const limit = assertPageSize(input.limit);
  const cursorKind = `${family}:${input.modelKey}`;
  const after = input.after === undefined ? undefined : decodeCursor(input.after, cursorKind);
  const base =
    family === "public"
      ? `${ROUTED_CANDIDATE_SQL} where`
      : `${CANDIDATE_SQL} ${PUBLIC_RECORD_FROM_SQL} and`;
  const boundary =
    after === undefined ? "" : "and (s.created_at < ? or (s.created_at = ? and e.id < ?))";
  return {
    sql: `${base} e.model_key = ? ${boundary} order by s.created_at desc, e.id desc limit ?`,
    params:
      after === undefined
        ? [input.modelKey]
        : [input.modelKey, after.timestamp, after.timestamp, after.id],
    limit,
    cursorKind,
  };
}

/** The lookahead selects keys only. Every payload statement is capped at the delivered page. */
export function publicReadStatements(selection: PublicSelection) {
  const selected = `with selected as (${selection.sql})`;
  const ids = "select published_snapshot_id from selected";
  const payloadParams = [...selection.params, selection.limit];
  return [
    {
      sql: selection.sql,
      params: [...selection.params, selection.limit + (selection.cursorKind === undefined ? 0 : 1)],
    },
    {
      sql: `${selected}
        select ${SNAPSHOT_FIELDS_SQL}, ${PUBLIC_INTERNAL_LINKS_JSON_SQL} as internal_links_json
        ${SNAPSHOT_FROM_SQL} where s.id in (${ids})`,
      params: payloadParams,
    },
    {
      sql: `${selected}
        ${BLOCK_COLUMNS_SQL} where hidden = 0 and snapshot_id in (${ids})
        order by snapshot_id asc, position asc`,
      params: payloadParams,
    },
    {
      sql: `${selected} ${publicSnapshotMediaBySelectionSql(ids)}`,
      params: payloadParams,
    },
  ];
}
