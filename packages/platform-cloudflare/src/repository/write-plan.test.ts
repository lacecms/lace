import { expect, test } from "vitest";
import type { WritePlan } from "@lacecms/db";
import { openLocalD1 } from "../test-support/d1-test-harness.js";
import { executeWritePlan, executeWritePlanGroup } from "./write-plan.js";

function plan(admitted: boolean, expectedChanges = 1): WritePlan<string> {
  return {
    admission: { sql: "? = 1", params: [admitted ? 1 : 0] },
    diagnostics: { evidence: { sql: "select count(*) as count from plan_test", params: [] } },
    diagnose: () => "not admitted",
    statements: (guard) => [
      {
        sql: `insert into plan_test select 1 where ${guard.sql}`,
        params: guard.params,
        expectedChanges,
      },
      {
        sql: `insert into plan_test select 2 where ${guard.sql}`,
        params: guard.params,
        outbox: true,
      },
      { sql: "select count(*) as count from plan_test", params: [], slot: "count" },
    ],
  };
}

test("D1 plans roll back invariant and SQL failures and release their guard", async () => {
  const { database, dispose } = await openLocalD1();
  try {
    await database.prepare("create table plan_test (id integer primary key)").run();
    expect(await executeWritePlan(database, plan(false), 0)).toEqual({
      kind: "rejected",
      reason: "not admitted",
      committedOutboxWork: false,
    });
    expect(await executeWritePlan(database, plan(true), 0)).toMatchObject({
      kind: "committed",
      committedOutboxWork: true,
      slots: { count: [{ count: 2 }] },
    });
    await database.prepare("delete from plan_test").run();
    await expect(executeWritePlan(database, plan(true, 2), 0)).rejects.toThrow();
    expect(await database.prepare("select count(*) as count from plan_test").first()).toEqual({
      count: 0,
    });
    await database.prepare("insert into plan_test values (2)").run();
    await expect(executeWritePlan(database, plan(true), 0)).rejects.toThrow();
    expect((await database.prepare("select id from plan_test").all()).results).toEqual([{ id: 2 }]);
    await database.prepare("delete from plan_test").run();
    const lateFailure: WritePlan<string> = {
      ...plan(true),
      statements: (guard) => [
        ...plan(true).statements(guard),
        { sql: `insert into plan_test select 2 where ${guard.sql}`, params: guard.params },
      ],
    };
    await expect(executeWritePlan(database, lateFailure, 0)).rejects.toThrow();
    expect(await database.prepare("select count(*) as count from plan_test").first()).toEqual({
      count: 0,
    });
    const noChange: WritePlan<string> = {
      ...plan(true),
      statements: (guard) => [
        { sql: `delete from plan_test where ${guard.sql}`, params: guard.params, outbox: true },
      ],
    };
    expect(await executeWritePlan(database, noChange, 0)).toMatchObject({
      kind: "committed",
      committedOutboxWork: false,
    });
    expect(await database.prepare("select count(*) as count from mutation_guards").first()).toEqual(
      { count: 0 },
    );
  } finally {
    await dispose();
  }
}, 60_000);

test("independent guarded writes commit together and roll back on a late failure", async () => {
  const { database, dispose } = await openLocalD1();
  try {
    await database
      .prepare("create table plan_group_test (id integer primary key, lease text)")
      .run();
    await database.prepare("insert into plan_group_test values (1, 'old'), (2, null)").run();
    const statements = [1, 2].map((id) => ({
      sql: "update plan_group_test set lease = ? where id = ? and lease is null",
      params: [`lease-${id}`, id],
    }));
    expect(await executeWritePlanGroup(database, { statements })).toMatchObject({
      changes: [0, 1],
      committedOutboxWork: false,
    });
    await expect(
      executeWritePlanGroup(database, {
        statements: [
          { sql: "update plan_group_test set lease = null", params: [] },
          { sql: "insert into plan_group_test values (1, null)", params: [] },
        ],
      }),
    ).rejects.toThrow();
    expect(
      await database.prepare("select lease from plan_group_test where id = 2").first(),
    ).toEqual({ lease: "lease-2" });
    expect(await database.prepare("select count(*) as count from mutation_guards").first()).toEqual(
      { count: 0 },
    );
  } finally {
    await dispose();
  }
}, 60_000);
