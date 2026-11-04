// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { configurationSyncWriteStatements } from "./writes.js";

function syncWriteDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    create table content_entries (id text primary key, model_key text not null);
    create table content_snapshots (id text primary key, entry_id text not null, fields_json text not null);
    create table content_blocks (snapshot_id text, block_key text, block_type text, position integer);
    create table content_media_references (snapshot_id text, source_key text, field_path text, media_id text);
    create table content_entry_link_references (snapshot_id text, source_key text, area text, field_path text, target_entry_id text, delivered integer);
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

test("the SEO removal write clears groups and SEO references of one model only", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    create table content_entries (id text primary key, model_key text not null);
    create table content_snapshots (id text primary key, entry_id text not null, seo_json text);
    create table content_media_references (snapshot_id text, source_key text, field_path text, media_id text);
    create table content_entry_link_references (snapshot_id text, source_key text, area text, field_path text, target_entry_id text, delivered integer);
    insert into content_entries values ('e1', 'posts'), ('e2', 'pages');
    insert into content_snapshots values
      ('s1', 'e1', '{"image":"media-1","title":"A"}'), ('s2', 'e1', null),
      ('s3', 'e2', '{"title":"B"}');
    insert into content_media_references values
      ('s1', '$seo', 'image', 'media-1'), ('s1', '$fields', 'cover', 'media-2'),
      ('s3', '$seo', 'image', 'media-1');
  `);
  for (const statement of configurationSyncWriteStatements({ action: "remove-seo" }, "posts")) {
    database.prepare(`${statement.sql} and ? = 1`).run(...statement.params, 1);
  }
  const rows = (sql) =>
    database
      .prepare(sql)
      .all()
      .map((row) => ({ ...row }));
  expect(rows("select id, seo_json from content_snapshots order by id")).toEqual([
    { id: "s1", seo_json: null },
    { id: "s2", seo_json: null },
    { id: "s3", seo_json: '{"title":"B"}' },
  ]);
  expect(
    rows("select snapshot_id, source_key from content_media_references order by snapshot_id"),
  ).toEqual([
    { snapshot_id: "s1", source_key: "$fields" },
    { snapshot_id: "s3", source_key: "$seo" },
  ]);
});
