import type Database from "better-sqlite3";
import type { ContractSql } from "@lacecms/test-utils";

/** Contract callers choose the row shape for their own SQL projections. */
export function contractSql(connection: Database.Database): ContractSql {
  return {
    all: async <Row>(sql: string, ...params: unknown[]) =>
      connection.prepare(sql).all(...params) as Row[],
    get: async <Row>(sql: string, ...params: unknown[]) =>
      connection.prepare(sql).get(...params) as Row | undefined,
    run: async (sql, ...params) => {
      connection.prepare(sql).run(...params);
    },
  };
}
