import { SqlOAuthIssuancePersistence } from "@lacecms/db";
import type { D1Database } from "./d1.js";

export function createD1OAuthPersistence(database: D1Database): SqlOAuthIssuancePersistence {
  return new SqlOAuthIssuancePersistence({
    rows: async (sql, values) =>
      (
        await database
          .prepare(sql)
          .bind(...values)
          .all()
      ).results,
    batch: async (statements) =>
      (
        await database.batch(
          statements.map(({ sql, values }) => database.prepare(sql).bind(...values)),
        )
      ).map((result) => result.meta.changes),
  });
}
