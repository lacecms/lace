import type { ContractSql } from "@lacecms/test-utils";
import type { D1Database } from "../d1/database.js";

/** Contract callers choose the row shape for their own SQL projections. */
export function contractSql(database: D1Database): ContractSql {
  const bind = (sql: string, params: unknown[]) =>
    params.length === 0 ? database.prepare(sql) : database.prepare(sql).bind(...params);
  return {
    all: async <Row>(sql: string, ...params: unknown[]) =>
      (await bind(sql, params).all<Row>()).results,
    get: async <Row>(sql: string, ...params: unknown[]) =>
      (await bind(sql, params).first<Row>()) ?? undefined,
    run: async (sql, ...params) => {
      await bind(sql, params).run();
    },
  };
}
