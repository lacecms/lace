import type { WritePlan, WritePlanResult } from "@lacecms/db";
import type Database from "better-sqlite3";

/** Executes admission, diagnostics and writes in one SQLite transaction. */
export function executeWritePlan<Miss>(
  connection: Database.Database,
  input: WritePlan<Miss> | (() => WritePlan<Miss>),
  checkpoint?: (name: string) => void,
): WritePlanResult<Miss> {
  return connection
    .transaction((): WritePlanResult<Miss> => {
      const plan = typeof input === "function" ? input() : input;
      const admitted = connection
        .prepare(`select 1 where ${plan.admission.sql}`)
        .get(...plan.admission.params);
      if (admitted === undefined) {
        const rows: Record<string, readonly unknown[]> = {};
        for (const [slot, query] of Object.entries(plan.diagnostics))
          rows[slot] = connection.prepare(query.sql).all(...query.params);
        return { kind: "rejected", reason: plan.diagnose(rows), committedOutboxWork: false };
      }
      const slots: Record<string, readonly unknown[]> = {};
      const changes: number[] = [];
      let committedOutboxWork = false;
      for (const statement of plan.statements({ sql: "1", params: [] })) {
        if (statement.checkpoint !== undefined) checkpoint?.(statement.checkpoint);
        const prepared = connection.prepare(statement.sql);
        if (statement.slot !== undefined) {
          slots[statement.slot] = prepared.all(...statement.params);
          changes.push(0);
        } else {
          const bindings = /\?\d+/.test(statement.sql)
            ? [
                Object.fromEntries(
                  statement.params.map((value, index) => [String(index + 1), value]),
                ),
              ]
            : statement.params;
          const count = prepared.run(...bindings).changes;
          if (statement.expectedChanges !== undefined && count !== statement.expectedChanges)
            throw new Error("Write plan affected-row invariant failed.");
          changes.push(count);
          if (statement.outbox && count > 0) committedOutboxWork = true;
        }
      }
      return { kind: "committed", changes, committedOutboxWork, slots };
    })
    .immediate();
}
