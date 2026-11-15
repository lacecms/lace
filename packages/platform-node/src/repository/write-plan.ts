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
      if (plan.admissionOutcome !== undefined) {
        const result = connection
          .prepare(`select (${plan.admissionOutcome.sql}) as outcome`)
          .get(...plan.admissionOutcome.params) as { outcome: number };
        if (result.outcome !== 1) {
          if (plan.diagnoseOutcome === undefined)
            throw new Error("Write plan outcome decoder is missing.");
          return {
            kind: "rejected",
            reason: plan.diagnoseOutcome(result.outcome),
            committedOutboxWork: false,
          };
        }
      } else {
        const admitted = connection
          .prepare(`select 1 where ${plan.admission.sql}`)
          .get(...plan.admission.params);
        if (admitted === undefined) {
          const rows: Record<string, readonly unknown[]> = {};
          for (const [slot, query] of Object.entries(plan.diagnostics))
            rows[slot] = connection.prepare(query.sql).all(...query.params);
          return { kind: "rejected", reason: plan.diagnose(rows), committedOutboxWork: false };
        }
      }
      return executeStatements(connection, plan.statements({ sql: "1", params: [] }), checkpoint);
    })
    .immediate();
}

function executeStatements(
  connection: Database.Database,
  statements: readonly import("@lacecms/db").WritePlanStatement[],
  checkpoint?: (name: string) => void,
): Extract<WritePlanResult<never>, { kind: "committed" }> {
  const slots: Record<string, readonly unknown[]> = {};
  const changes: number[] = [];
  let committedOutboxWork = false;
  for (const statement of statements) {
    if (statement.checkpoint !== undefined) checkpoint?.(statement.checkpoint);
    const prepared = connection.prepare(statement.sql);
    if (statement.slot !== undefined) {
      slots[statement.slot] = prepared.all(...statement.params);
      changes.push(0);
    } else {
      const bindings = /\?\d+/.test(statement.sql)
        ? [Object.fromEntries(statement.params.map((value, index) => [String(index + 1), value]))]
        : statement.params;
      const count = prepared.run(...bindings).changes;
      if (statement.expectedChanges !== undefined && count !== statement.expectedChanges)
        throw new Error("Write plan affected-row invariant failed.");
      changes.push(count);
      if (statement.outbox && count > 0) committedOutboxWork = true;
    }
  }
  return { kind: "committed", changes, committedOutboxWork, slots };
}

/** Execute independently guarded statements in one transaction. */
export function executeWritePlanGroup(
  connection: Database.Database,
  input: import("@lacecms/db").WritePlanGroup | (() => import("@lacecms/db").WritePlanGroup),
  checkpoint?: (name: string) => void,
): Extract<WritePlanResult<never>, { kind: "committed" }> {
  return connection
    .transaction(() => {
      const group = typeof input === "function" ? input() : input;
      return executeStatements(connection, group.statements, checkpoint);
    })
    .immediate();
}
