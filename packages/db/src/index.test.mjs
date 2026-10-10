import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  assertDraftPersistenceBounds,
  decodeBase64Url,
  decodeCursor,
  encodeBase64Url,
  encodeCursor,
  encodeSortCursor,
  packageName,
  checkedInMigrations,
  configurationSyncWriteStatements,
  sqliteWriteError,
} from "../dist/index.js";

test("exports its package identity", () => expect(packageName).toBe("@lacecms/db"));

test("checked-in migration inventory matches the Drizzle journal", async () => {
  const journal = JSON.parse(
    await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  expect(checkedInMigrations).toEqual(
    journal.entries.map((entry) => ({
      createdAt: entry.when,
      name: `${entry.tag}.sql`,
    })),
  );
});

test("encodes cursors byte-identically to Node Buffer base64url", () => {
  for (const text of ["", "a", "ab", "abc", '{"kind":"é✓😀","id":"x"}', "\u0000ÿ/+?"]) {
    expect(encodeBase64Url(text)).toBe(Buffer.from(text).toString("base64url"));
    expect(decodeBase64Url(encodeBase64Url(text))).toBe(text);
  }
  const payload = { id: "e-1", kind: "public:posts", timestamp: 7, version: 1 };
  expect(encodeCursor("public:posts", 7, "e-1")).toBe(
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
  );
  expect(decodeCursor(encodeCursor("public:posts", 7, "e-1"), "public:posts")).toEqual({
    id: "e-1",
    timestamp: 7,
  });
  expect(encodeSortCursor("k", "Ünïcode", "id")).toBe(
    Buffer.from(JSON.stringify({ id: "id", kind: "k", value: "Ünïcode", version: 2 })).toString(
      "base64url",
    ),
  );
  for (const invalid of ["not a cursor", "a", encodeBase64Url("[]")]) {
    expect(() => decodeCursor(invalid, "public:posts")).toThrow(
      expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
    );
  }
});

test("bounds drafts and maps SQLite constraint failures to stable codes", () => {
  expect(() => assertDraftPersistenceBounds(new Array(200), new Array(200))).not.toThrow();
  expect(() => assertDraftPersistenceBounds(new Array(201), [])).toThrow(
    expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
  );
  expect(() => assertDraftPersistenceBounds([], new Array(201))).toThrow(
    expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
  );
  const mapped = (message, page = false) => {
    try {
      sqliteWriteError(new Error(message), page, "Test");
    } catch (error) {
      return [error.code, error.message];
    }
  };
  expect(mapped("D1_ERROR: UNIQUE constraint failed: published_routes.path: SQLITE")).toEqual([
    "CONTENT_ROUTE_CONFLICT",
    "The public path belongs to another entry.",
  ]);
  expect(mapped("UNIQUE constraint failed: content_entries.model_key", true)[0]).toBe(
    "CONTENT_MODEL_CARDINALITY_CONFLICT",
  );
  expect(mapped("NOT NULL constraint failed: content_media_references.media_id")).toEqual([
    "CONTENT_INVALID_STATE",
    "Media is unavailable for reference.",
  ]);
  expect(mapped("anything else")).toEqual(["CONTENT_INVALID_STATE", "Test content write failed."]);
});

test("site-build status SQL mirrors the portable vocabulary", async () => {
  const { siteBuildStatuses, retryableSiteBuildStatuses } = await import("@lacecms/domain");
  const { RETRYABLE_SITE_BUILD_STATUS_SQL, siteBuildRecord } = await import("../dist/index.js");
  const migration = await readFile(
    new URL("../drizzle/0003_site_build_outcomes.sql", import.meta.url),
    "utf8",
  );
  const check = /CHECK\("status" in \(([^)]*)\)\)/u.exec(migration)?.[1];
  expect(check?.split(", ")).toEqual(siteBuildStatuses.map((status) => `'${status}'`));
  expect(RETRYABLE_SITE_BUILD_STATUS_SQL).toBe(
    `(${retryableSiteBuildStatuses.map((status) => `'${status}'`).join(", ")})`,
  );
  expect(migration).not.toMatch(/^\s*PRAGMA/imu);
  const row = {
    completed_at: null,
    error: null,
    id: "build-1",
    provider_build_id: null,
    reason: "manual",
    requested_at: 1,
    requested_by: "admin",
    started_at: null,
    status: "deployed",
    target_version: 1,
  };
  expect(() => siteBuildRecord(row)).toThrow(
    expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
  );
  expect(siteBuildRecord({ ...row, status: "accepted" }).status).toBe("accepted");
});

function syncWriteDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    create table content_entries (id text primary key, model_key text not null);
    create table content_snapshots (id text primary key, entry_id text not null, fields_json text not null);
    create table content_blocks (snapshot_id text, block_key text, block_type text, position integer);
    create table content_media_references (snapshot_id text, source_key text, field_path text, media_id text);
    insert into content_entries values ('e1', 'posts'), ('e2', 'pages');
    insert into content_snapshots values
      ('s1', 'e1', '{"a":true,"b":"str","c":null,"d":{"x":[1,2]},"e":1.5,"m":"media-1","keep":"k"}'),
      ('s2', 'e1', '{"keep":"k"}'),
      ('s3', 'e2', '{"a":true,"m":"media-1"}');
    insert into content_blocks values
      ('s1', 'q1', 'quote', 1000), ('s1', 'i1', 'image', 2000), ('s1', 'q2', 'quote', 3000),
      ('s3', 'q3', 'quote', 1000);
    insert into content_media_references values
      ('s1', '$fields', 'm', 'media-1'), ('s1', 'q1', 'media', 'media-2'),
      ('s1', 'i1', 'media', 'media-3'), ('s3', '$fields', 'm', 'media-1'),
      ('s3', 'q3', 'media', 'media-2');
  `);
  const run = (write) => {
    for (const statement of configurationSyncWriteStatements(write, "posts")) {
      // Appending a guard condition, as the D1 batch does, must keep the statement valid.
      database.prepare(`${statement.sql} and ? = 1`).run(...statement.params, 1);
    }
  };
  const fields = (id) =>
    JSON.parse(
      database.prepare("select fields_json from content_snapshots where id = ?").get(id)
        .fields_json,
    );
  const all = (sql) =>
    database
      .prepare(sql)
      .all()
      .map((row) => ({ ...row }));
  return { all, fields, run };
}

test("synchronization writes move, prune and drop data of one model only", () => {
  const { all, fields, run } = syncWriteDatabase();
  for (const key of ["a", "b", "c", "d", "e", "m"]) {
    run({ action: "rename-field", from: key, to: `${key}New` });
  }
  expect(fields("s1")).toEqual({
    aNew: true,
    bNew: "str",
    cNew: null,
    dNew: { x: [1, 2] },
    eNew: 1.5,
    keep: "k",
    mNew: "media-1",
  });
  expect(fields("s2")).toEqual({ keep: "k" });
  expect(fields("s3")).toEqual({ a: true, m: "media-1" });

  run({ action: "remove-field", fieldKey: "mNew" });
  run({ action: "remove-block-type", blockType: "quote" });
  run({ action: "backfill-field", fieldKey: "flag", json: '"on"' });
  expect(fields("s1")).not.toHaveProperty("mNew");
  expect(fields("s2")).toEqual({ flag: "on", keep: "k" });
  expect(fields("s3")).toEqual({ a: true, m: "media-1" });
  expect(
    all("select snapshot_id, block_key from content_blocks order by snapshot_id, position"),
  ).toEqual([
    { block_key: "i1", snapshot_id: "s1" },
    { block_key: "q3", snapshot_id: "s3" },
  ]);
  expect(
    all(
      "select snapshot_id, source_key, field_path from content_media_references order by snapshot_id, source_key",
    ),
  ).toEqual(
    [
      { field_path: "m", snapshot_id: "s3", source_key: "$fields" },
      { field_path: "media", snapshot_id: "s1", source_key: "i1" },
      { field_path: "media", snapshot_id: "s3", source_key: "q3" },
    ].sort(
      (left, right) =>
        left.snapshot_id.localeCompare(right.snapshot_id) ||
        left.source_key.localeCompare(right.source_key),
    ),
  );
});

test("synchronization writes keep renamed media references and reject unsafe keys", () => {
  const { all, run } = syncWriteDatabase();
  run({ action: "rename-field", from: "m", to: "cover" });
  expect(
    all(
      "select snapshot_id, field_path from content_media_references where source_key = '$fields' order by snapshot_id",
    ),
  ).toEqual([
    { field_path: "cover", snapshot_id: "s1" },
    { field_path: "m", snapshot_id: "s3" },
  ]);
  expect(() =>
    configurationSyncWriteStatements({ action: "remove-field", fieldKey: "a') --" }, "posts"),
  ).toThrow();
  expect(() =>
    configurationSyncWriteStatements({ action: "rename-field", from: "a", to: "b.c" }, "posts"),
  ).toThrow();
});
