import type { ContentReadSql, SqlReadStatement } from "@lacecms/db";
import { D1_MAX_BOUND_PARAMETERS } from "../d1/database.js";
import type { D1Database, D1PreparedStatement, D1Result } from "../d1/database.js";

/** Binds positional parameters, mapping `undefined` to SQL `null`. */
export function bind(
  statement: D1PreparedStatement,
  params: readonly unknown[],
): D1PreparedStatement {
  return params.length === 0
    ? statement
    : statement.bind(...params.map((value) => (value === undefined ? null : value)));
}

/**
 * D1 read capability for the shared reader. Each read group is one atomic
 * `batch()`. Ordinary public reads need one group, exports use two.
 */
export function d1ContentReadSql(database: D1Database): ContentReadSql {
  const prepared = (statement: SqlReadStatement): D1PreparedStatement =>
    bind(database.prepare(statement.sql), statement.params);
  const rows = (results: readonly D1Result[]): readonly (readonly unknown[])[] =>
    results.map((result) => result.results);
  return {
    bindChunk: D1_MAX_BOUND_PARAMETERS,
    all: async <Row>(sql: string, ...params: readonly unknown[]) =>
      (await bind(database.prepare(sql), params).all<Row>()).results,
    readGroups: async (first, next) => {
      const firstRows = rows(await database.batch(first.map(prepared)));
      const second = next(firstRows);
      return [
        firstRows,
        second.length === 0 ? [] : rows(await database.batch(second.map(prepared))),
      ] as const;
    },
  };
}
