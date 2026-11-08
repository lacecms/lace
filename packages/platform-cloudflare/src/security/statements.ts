import type { D1Database, D1PreparedStatement } from "../d1/database.js";

/** True once first-run setup has completed; guards setup writes inside their statement. */
export const SETUP_COMPLETED_SQL =
  "exists (select 1 from installation_state where singleton_key = 1 and setup_completed_at is not null)";

/** Prepares `sql` and binds `params` when there are any. */
export function bindStatement(
  database: D1Database,
  sql: string,
  ...params: unknown[]
): D1PreparedStatement {
  const statement = database.prepare(sql);
  return params.length === 0 ? statement : statement.bind(...params);
}
