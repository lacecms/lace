// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  INVALID_PROJECTED_LINK_TARGETS_SQL,
  projectedBlocksSql,
  projectedMediaReferencesSql,
  projectedPublicationRows,
} from "./projection.js";

test("encodes and checks a conditional-field publication projection", () => {
  const projection = {
    blocks: [
      { key: "b1", data: { kind: "image" } },
      { key: "b2", data: {} },
    ],
    fields: { kind: "image" },
    internalLinks: [
      { sourceKey: "b1", area: "data", pointer: "/url", targetId: "t1", delivered: true },
    ],
    mediaReferences: [
      { sourceKey: "$fields", fieldPath: "/media", mediaId: "m1" },
      { sourceKey: "b2", fieldPath: "media", mediaId: "m2" },
    ],
  };
  const rows = projectedPublicationRows(["b1", "b2"], projection);
  expect(JSON.parse(rows.fieldsJson)).toEqual({ kind: "image" });
  expect(JSON.parse(rows.blockDataJson)).toEqual([
    { key: "b1", data: '{"kind":"image"}' },
    { key: "b2", data: "{}" },
  ]);
  expect(JSON.parse(rows.mediaReferencesJson)).toEqual([
    ["$fields", "/media", "m1"],
    ["b2", "media", "m2"],
  ]);
  expect(JSON.parse(rows.internalLinksJson)).toEqual([["b1", "data", "/url", "t1", 1]]);
  for (const keys of [["b1"], ["b1", "b2", "b3"], ["b1", "other"]])
    expect(() => projectedPublicationRows(keys, projection)).toThrow(/every draft block/u);
  expect(() =>
    projectedPublicationRows(["b1", "b2"], {
      ...projection,
      blocks: [...projection.blocks, projection.blocks[0]],
    }),
  ).toThrow(/every draft block/u);
  expect(() =>
    projectedPublicationRows(["b1", "b2"], {
      ...projection,
      mediaReferences: [{ sourceKey: "missing", fieldPath: "media", mediaId: "m1" }],
    }),
  ).toThrow(/media projection/u);

  const database = new DatabaseSync(":memory:");
  database.exec(`create table content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, anchor, class_name, hidden, settings_json, created_at, updated_at);
    create table content_media_references (snapshot_id, source_key, field_path, media_id, created_at);
    create table content_entries (id, published_snapshot_id);
    create table published_routes (path, entry_id, snapshot_id);
    insert into content_blocks values ('d', 'b1', 'feature', 1, 1, '{"stale":1}', 'a', null, 0, '{"s":1}', 1, 2),
      ('d', 'b2', 'feature', 2, 1, '{}', null, null, 1, '{}', 1, 2);
    insert into content_entries values ('t1', null), ('t2', 'p2');
    insert into published_routes values ('/t2', 't2', 'p2');`);
  database.prepare(projectedBlocksSql()).run("p", rows.blockDataJson, "d");
  expect(
    database
      .prepare(
        "select block_key, data_json, anchor, hidden, settings_json from content_blocks where snapshot_id = 'p' order by position",
      )
      .all()
      .map((row) => ({ ...row })),
  ).toEqual([
    {
      block_key: "b1",
      data_json: '{"kind":"image"}',
      anchor: "a",
      hidden: 0,
      settings_json: '{"s":1}',
    },
    { block_key: "b2", data_json: "{}", anchor: null, hidden: 1, settings_json: "{}" },
  ]);
  database.prepare(projectedMediaReferencesSql()).run("p", 9, rows.mediaReferencesJson);
  expect(
    database
      .prepare("select source_key, field_path, media_id, created_at from content_media_references")
      .all()
      .map((row) => ({ ...row })),
  ).toEqual([
    { source_key: "$fields", field_path: "/media", media_id: "m1", created_at: 9 },
    { source_key: "b2", field_path: "media", media_id: "m2", created_at: 9 },
  ]);
  const invalid = (links) =>
    database
      .prepare(INVALID_PROJECTED_LINK_TARGETS_SQL)
      .all(JSON.stringify(links), "source", null)
      .map((row) => row.target_entry_id);
  expect(
    invalid([
      ["b1", "data", "/url", "t1", 1],
      ["b1", "data", "/hidden", "t1", 0],
      ["b2", "data", "/url", "t2", 1],
    ]),
  ).toEqual(["t1"]);
});
