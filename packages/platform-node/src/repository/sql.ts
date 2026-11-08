import type { ContentReadSql, SqlReadStatement } from "@lacecms/db";
import type Database from "better-sqlite3";

/** Identifiers bound per `in (...)` list; well below SQLite's compiled limit. */
export const SQLITE_BIND_CHUNK = 200;

/**
 * Node read capability for the shared reader. Both read groups run inside one
 * better-sqlite3 transaction, so they observe one WAL snapshot.
 */
export function nodeContentReadSql(connection: Database.Database): ContentReadSql {
  const read = (statement: SqlReadStatement): readonly unknown[] =>
    connection.prepare(statement.sql).all(...statement.params);
  return {
    bindChunk: SQLITE_BIND_CHUNK,
    all: async <Row>(sql: string, ...params: readonly unknown[]) =>
      connection.prepare(sql).all(...params) as readonly Row[],
    readGroups: async (first, next) =>
      connection.transaction(() => {
        const rows = first.map(read);
        return [rows, next(rows).map(read)] as const;
      })(),
  };
}
