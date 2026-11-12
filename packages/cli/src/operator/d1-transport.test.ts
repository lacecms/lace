// @ts-nocheck
// TODO(rf2): Type legacy command fixtures, filesystem helpers and recorded adapter calls.
import { expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RemoteD1Database, openLocalD1 } from "./d1-transport.js";
import { MissingLedgerError, missingLedger } from "../diagnostics/diagnostics.js";

const settings = {
  accountId: "account",
  apiToken: "private-credential",
  databaseId: "database",
};

test("maps prepared statements to one REST batch and preserves row order", async () => {
  const request = vi.fn(async (_url, init) => {
    expect(init.headers.authorization).toBe("Bearer private-credential");
    expect(JSON.parse(init.body)).toEqual({
      batch: [
        { sql: "select ? as value", params: ["first"] },
        { sql: "select ? as value", params: ["second"] },
      ],
    });
    return Response.json({
      success: true,
      result: [
        { success: true, meta: { changes: 0 }, results: [{ value: "first" }] },
        { success: true, meta: { changes: 0 }, results: [{ value: "second" }] },
      ],
    });
  });
  const db = new RemoteD1Database(settings, request);
  const rows = await db.batch([
    db.prepare("select ? as value").bind("first"),
    db.prepare("select ? as value").bind("second"),
  ]);
  expect(rows.map((row) => row.results[0].value)).toEqual(["first", "second"]);
  expect(request).toHaveBeenCalledTimes(1);
});

test("provider failures never echo secrets", async () => {
  const db = new RemoteD1Database(
    settings,
    async () => new Response("private-credential", { status: 403 }),
  );
  await expect(db.prepare("select 1").first()).rejects.toThrow("HTTP 403");
  await expect(db.prepare("select 1").first()).rejects.not.toThrow("private-credential");
});

test("successful remote mutations may omit the optional results array", async () => {
  const db = new RemoteD1Database(settings, async () =>
    Response.json({
      success: true,
      result: [{ success: true, meta: { changes: 1 } }],
    }),
  );
  expect(await db.prepare("delete from example").run()).toEqual({
    meta: { changes: 1 },
    results: [],
  });
});

test("local D1 batch rolls back failed mutations", async () => {
  const persistTo = await mkdtemp(join(tmpdir(), "lace-cli-d1-"));
  const opened = await openLocalD1({
    databaseId: "00000000-0000-0000-0000-000000000001",
    persistTo,
  });
  try {
    await opened.database.prepare("create table example (id integer primary key)").run();
    await expect(
      opened.database.batch([
        opened.database.prepare("insert into example (id) values (1)"),
        opened.database.prepare("insert into example (id) values (1)"),
      ]),
    ).rejects.toThrow();
    const row = await opened.database.prepare("select count(*) as count from example").first();
    expect(row.count).toBe(0);
  } finally {
    await opened.close();
    await rm(persistTo, { recursive: true, force: true });
  }
}, 30_000);

test("a missing ledger is recognized when D1 reports it as HTTP 400", async () => {
  const db = new RemoteD1Database(settings, async () =>
    Response.json(
      {
        success: false,
        result: [],
        errors: [
          { code: 7500, message: "no such table: d1_migrations: SQLITE_ERROR private-credential" },
        ],
      },
      { status: 400 },
    ),
  );
  const failure = await db
    .prepare("select name from d1_migrations")
    .all()
    .catch((error) => error);
  expect(failure).toBeInstanceOf(MissingLedgerError);
  expect(missingLedger(failure)).toBe(true);
  expect(failure.message).not.toContain("private-credential");
});

test("other rejected queries and provider outages keep sanitized distinct causes", async () => {
  for (const [status, body, kind] of [
    [
      400,
      { success: false, errors: [{ message: "near private-credential: syntax error" }] },
      "d1-response",
    ],
    [400, "private-credential", "d1-response"],
    [503, "private-credential", "d1-unavailable"],
    [429, { success: false, errors: [{ message: "private-credential" }] }, "d1-unavailable"],
  ]) {
    const db = new RemoteD1Database(settings, async () =>
      typeof body === "string" ? new Response(body, { status }) : Response.json(body, { status }),
    );
    const failure = await db
      .prepare("select name from d1_migrations")
      .all()
      .catch((error) => error);
    expect(failure).not.toBeInstanceOf(MissingLedgerError);
    expect(failure).toMatchObject({ code: "OPERATION_FAILED", diagnosticKind: kind });
    expect(failure.message).toBe(`Cloudflare D1 request failed (HTTP ${status}).`);
  }
});
