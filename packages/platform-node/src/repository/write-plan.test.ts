import Database from "better-sqlite3";
import { expect, test } from "vitest";
import type { WritePlan } from "@lacecms/db";
import { executeWritePlan } from "./write-plan.js";

function plan(admitted: boolean, expectedChanges = 1): WritePlan<string> {
  return {
    admission: { sql: "? = 1", params: [admitted ? 1 : 0] },
    diagnostics: { evidence: { sql: "select count(*) as count from items", params: [] } },
    diagnose: () => "not admitted",
    statements: (guard) => [
      {
        sql: `insert into items select 1 where ${guard.sql}`,
        params: guard.params,
        expectedChanges,
      },
      { sql: `insert into items select 2 where ${guard.sql}`, params: guard.params, outbox: true },
      { sql: "select count(*) as count from items", params: [], slot: "count" },
    ],
  };
}

test("write plans admit atomically and report only committed outbox changes", () => {
  const db = new Database(":memory:");
  try {
    db.exec("create table items (id integer primary key)");
    expect(executeWritePlan(db, plan(false))).toEqual({
      kind: "rejected",
      reason: "not admitted",
      committedOutboxWork: false,
    });
    expect(executeWritePlan(db, plan(true))).toMatchObject({
      kind: "committed",
      committedOutboxWork: true,
      slots: { count: [{ count: 2 }] },
    });
    db.exec("delete from items");
    expect(() => executeWritePlan(db, plan(true, 2))).toThrow();
    expect(db.prepare("select count(*) as count from items").get()).toEqual({ count: 0 });
    db.exec("insert into items values (2)");
    expect(() => executeWritePlan(db, plan(true))).toThrow();
    expect(db.prepare("select id from items").all()).toEqual([{ id: 2 }]);
    db.exec("delete from items");
    const lateFailure: WritePlan<string> = {
      ...plan(true),
      statements: (guard) => [
        ...plan(true).statements(guard),
        { sql: `insert into items select 2 where ${guard.sql}`, params: guard.params },
      ],
    };
    expect(() => executeWritePlan(db, lateFailure)).toThrow();
    expect(db.prepare("select count(*) as count from items").get()).toEqual({ count: 0 });
    const noChange: WritePlan<string> = {
      ...plan(true),
      statements: (guard) => [
        { sql: `delete from items where ${guard.sql}`, params: guard.params, outbox: true },
      ],
    };
    expect(executeWritePlan(db, noChange)).toMatchObject({
      kind: "committed",
      committedOutboxWork: false,
    });
  } finally {
    db.close();
  }
});
