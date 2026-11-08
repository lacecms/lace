import { SqlOAuthIssuancePersistence } from "@lacecms/db";
import type Database from "better-sqlite3";

export function createNodeOAuthPersistence(
  connection: Database.Database,
): SqlOAuthIssuancePersistence {
  return new SqlOAuthIssuancePersistence({
    rows: async (sql, values) =>
      connection.prepare(sql).all(...values) as Record<string, unknown>[],
    batch: async (statements) =>
      connection.transaction(() =>
        statements.map(({ sql, values }) => connection.prepare(sql).run(...values).changes),
      )(),
  });
}
