import type { WritePlan, WritePlanResult } from "@lacecms/db";
import { D1_MAX_BATCH_STATEMENTS, D1_MAX_BOUND_PARAMETERS } from "../d1/database.js";
import type { D1Database } from "../d1/database.js";
import { bind } from "./sql.js";

declare const crypto: { randomUUID(): string };

/** Executes the plan in one D1 batch, including admission and diagnostics. */
export async function executeWritePlan<Miss>(
  database: D1Database,
  plan: WritePlan<Miss>,
  now: number,
  checkpoint?: (name: string) => void,
): Promise<WritePlanResult<Miss>> {
  const token = `guard:${crypto.randomUUID()}`;
  const guard = {
    sql: `exists (select 1 from mutation_guards where token = ?${plan.admissionOutcome === undefined ? "" : " and created_at = 1"})`,
    params: [token],
  };
  const queries: { sql: string; params: readonly unknown[] }[] = [
    plan.admissionOutcome === undefined
      ? {
          sql: `insert into mutation_guards (token, created_at) select ?, ? where ${plan.admission.sql}`,
          params: [token, now, ...plan.admission.params],
        }
      : {
          sql: `insert into mutation_guards (token, created_at) values (?, (${plan.admissionOutcome.sql})) returning created_at`,
          params: [token, ...plan.admissionOutcome.params],
        },
  ];
  const diagnostics: Record<string, number> = {};
  for (const [slot, query] of Object.entries(plan.diagnostics)) {
    diagnostics[slot] = queries.length;
    queries.push(query);
  }
  const statements = plan.statements(guard);
  const indexes: number[] = [];
  for (const statement of statements) {
    if (statement.checkpoint !== undefined) {
      try {
        checkpoint?.(statement.checkpoint);
      } catch {
        queries.push({
          sql: "insert into mutation_guards (token, created_at) values (null, 0)",
          params: [],
        });
      }
    }
    indexes.push(queries.length);
    queries.push(statement);
    if (statement.expectedChanges !== undefined) {
      queries.push({
        sql: `insert into mutation_guards (token, created_at) select null, 0 where changes() <> ? and ${guard.sql}`,
        params: [statement.expectedChanges, ...guard.params],
      });
    }
  }
  queries.push({ sql: "delete from mutation_guards where token = ?", params: [token] });
  if (
    queries.length > D1_MAX_BATCH_STATEMENTS ||
    queries.some((query) => query.params.length > D1_MAX_BOUND_PARAMETERS)
  )
    throw new Error("Write plan exceeds D1 statement or parameter budget.");
  const results = await database.batch(
    queries.map((query) => bind(database.prepare(query.sql), query.params)),
  );
  if (plan.admissionOutcome !== undefined) {
    const outcome = (results[0]?.results[0] as { created_at: number } | undefined)?.created_at;
    if (outcome !== 1) {
      if (outcome === undefined || plan.diagnoseOutcome === undefined)
        throw new Error("Write plan outcome decoder is missing.");
      return {
        kind: "rejected",
        reason: plan.diagnoseOutcome(outcome),
        committedOutboxWork: false,
      };
    }
  } else if (results[0]?.meta.changes !== 1) {
    const rows: Record<string, readonly unknown[]> = {};
    for (const [slot, index] of Object.entries(diagnostics)) rows[slot] = results[index]!.results;
    return { kind: "rejected", reason: plan.diagnose(rows), committedOutboxWork: false };
  }
  const slots: Record<string, readonly unknown[]> = {};
  const changes = indexes.map((index) => results[index]!.meta.changes);
  let committedOutboxWork = false;
  for (const [index, statement] of statements.entries()) {
    if (statement.slot !== undefined) slots[statement.slot] = results[indexes[index]!]!.results;
    if (statement.outbox && changes[index]! > 0) committedOutboxWork = true;
  }
  return { kind: "committed", changes, committedOutboxWork, slots };
}

/** Execute independently guarded statements without an outer admission token. */
export async function executeWritePlanGroup(
  database: D1Database,
  group: import("@lacecms/db").WritePlanGroup,
  checkpoint?: (name: string) => void,
): Promise<Extract<WritePlanResult<never>, { kind: "committed" }>> {
  const queries: { sql: string; params: readonly unknown[] }[] = [];
  const indexes: number[] = [];
  for (const statement of group.statements) {
    if (statement.checkpoint !== undefined) {
      try {
        checkpoint?.(statement.checkpoint);
      } catch {
        queries.push({
          sql: "insert into mutation_guards (token, created_at) values (null, 0)",
          params: [],
        });
      }
    }
    indexes.push(queries.length);
    queries.push(statement);
    if (statement.expectedChanges !== undefined) {
      queries.push({
        sql: "insert into mutation_guards (token, created_at) select null, 0 where changes() <> ?",
        params: [statement.expectedChanges],
      });
    }
  }
  if (
    queries.length > D1_MAX_BATCH_STATEMENTS ||
    queries.some((q) => q.params.length > D1_MAX_BOUND_PARAMETERS)
  )
    throw new Error("Write plan exceeds D1 statement or parameter budget.");
  if (queries.length === 0)
    return { kind: "committed", changes: [], slots: {}, committedOutboxWork: false };
  const results = await database.batch(
    queries.map((query) => bind(database.prepare(query.sql), query.params)),
  );
  const changes = indexes.map((index) => results[index]!.meta.changes);
  const slots: Record<string, readonly unknown[]> = {};
  let committedOutboxWork = false;
  for (const [index, statement] of group.statements.entries()) {
    if (statement.slot !== undefined) slots[statement.slot] = results[indexes[index]!]!.results;
    if (statement.outbox && changes[index]! > 0) committedOutboxWork = true;
  }
  return { kind: "committed", changes, slots, committedOutboxWork };
}
