import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, expect, test } from "vitest";
import { checkedInMigrations } from "../schema/migrations.js";
import { deleteSupersededSnapshotsStatement } from "../content/snapshots.js";
import {
  IDEMPOTENCY_PURGE_LIMIT,
  LIVE_IDEMPOTENCY_RECORD_SQL,
  NO_LIVE_IDEMPOTENCY_RECORD_SQL,
  deleteExpiredIdempotencyRecordStatement,
  purgeExpiredIdempotencyRecordsStatement,
} from "./idempotency.js";

let database: DatabaseSync;

beforeEach(async () => {
  database = new DatabaseSync(":memory:");
  for (const migration of checkedInMigrations)
    database.exec(
      await readFile(new URL(`../../drizzle/${migration.name}`, import.meta.url), "utf8"),
    );
  database.exec("pragma foreign_keys=on");
});

afterEach(() => database.close());

const insertRecord = (scope: string, key: string, expiresAt: number) =>
  database
    .prepare(
      "insert into idempotency_records (scope,key,request_hash,response_json,created_at,expires_at) values (?,?,'h','{}',1,?)",
    )
    .run(scope, key, expiresAt);
const keys = () =>
  (
    database.prepare("select key from idempotency_records order by key").all() as { key: string }[]
  ).map((row) => row.key);
const countRows = (table: string) =>
  (database.prepare(`select count(*) as n from ${table}`).get() as { n: number }).n;

test("live reads and guards treat a record expiring at or before now as absent", () => {
  insertRecord("s", "expired", 100);
  insertRecord("s", "live", 101);
  const live = (key: string) =>
    database.prepare(LIVE_IDEMPOTENCY_RECORD_SQL).get("s", key, 100) as
      | { request_hash: string; response_json: string }
      | undefined;
  const absent = (key: string) =>
    (
      database.prepare(`select ${NO_LIVE_IDEMPOTENCY_RECORD_SQL} as absent`).get("s", key, 100) as {
        absent: number;
      }
    ).absent;
  expect(live("expired")).toBeUndefined();
  expect(live("live")).toEqual({ request_hash: "h", response_json: "{}" });
  expect(absent("expired")).toBe(1);
  expect(absent("live")).toBe(0);
});

test("the expired-record delete removes only its own expired scope and key", () => {
  insertRecord("s", "a", 100);
  insertRecord("s", "b", 100);
  insertRecord("s", "c", 200);
  for (const key of ["a", "c"]) {
    const statement = deleteExpiredIdempotencyRecordStatement("s", key, 150);
    database.prepare(statement.sql).run(...statement.params);
  }
  expect(keys()).toEqual(["b", "c"]);
  const guarded = deleteExpiredIdempotencyRecordStatement("s", "b", 150, "0 = ?");
  database.prepare(guarded.sql).run(...guarded.params, 1);
  expect(keys()).toEqual(["b", "c"]);
});

test("the purge deletes at most its limit and never an unexpired record", () => {
  for (let index = 0; index < 4; index += 1) insertRecord("s", `old-${index}`, 100);
  insertRecord("s", "live", 101);
  const run = () => {
    const statement = purgeExpiredIdempotencyRecordsStatement(100, 3);
    return Number(database.prepare(statement.sql).run(...statement.params).changes);
  };
  expect(run()).toBe(3);
  expect(run()).toBe(1);
  expect(run()).toBe(0);
  expect(keys()).toEqual(["live"]);
  for (const limit of [0, 1.5, IDEMPOTENCY_PURGE_LIMIT + 1])
    expect(() => purgeExpiredIdempotencyRecordsStatement(100, limit)).toThrow(TypeError);
  expect(purgeExpiredIdempotencyRecordsStatement(1, IDEMPOTENCY_PURGE_LIMIT).params).toEqual([
    1,
    IDEMPOTENCY_PURGE_LIMIT,
  ]);
});

test("superseded-snapshot cleanup keeps the draft and the new publication", () => {
  database.exec(`
    insert into content_models (key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at) values ('posts','collection','Posts',1,'s','p',1,1);
    insert into content_entries (id,model_key,created_by,created_at,updated_at) values ('entry','posts','admin',1,1), ('other','posts','admin',1,1);
    insert into content_snapshots (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by) values
      ('draft','entry',3,'D','{}',1,1,1,'admin'), ('old','entry',1,'O','{}',1,1,1,'admin'),
      ('stray','entry',2,'S','{}',1,1,1,'admin'), ('new','entry',3,'N','{}',1,1,1,'admin'),
      ('foreign','other',1,'F','{}',1,1,1,'admin');
    insert into content_blocks (snapshot_id,block_key,block_type,schema_version,position,data_json,created_at,updated_at) values ('old','b1','hero',1,1,'{}',1,1);
  `);
  const refused = deleteSupersededSnapshotsStatement("entry", "draft", "new", "0 = ?");
  database.prepare(refused.sql).run(...refused.params, 1);
  expect(countRows("content_snapshots")).toBe(5);
  const statement = deleteSupersededSnapshotsStatement("entry", "draft", "new");
  database.prepare(statement.sql).run(...statement.params);
  expect(
    (
      database.prepare("select id from content_snapshots order by id").all() as { id: string }[]
    ).map((row) => row.id),
  ).toEqual(["draft", "foreign", "new"]);
  expect(countRows("content_blocks")).toBe(0);
});
