// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import {
  BUILD_EXPORT_CANDIDATES_SQL,
  BUILD_EXPORT_FIRST_PAGE_VERSION_SQL,
  BUILD_EXPORT_VERSION_SQL,
  buildExportPageRange,
  buildExportPageSql,
  decodeBuildExportCursor,
  encodeBuildExportCursor,
} from "./export.js";
import { decodeBase64Url, encodeBase64Url } from "../shared/base64.js";
import { encodeCursor, encodeSortCursor } from "../shared/cursors.js";

test("build-export cursors round-trip and reject foreign or malformed values", () => {
  const cursor = encodeBuildExportCursor(7, "/blog/hello");
  expect(decodeBuildExportCursor(cursor)).toEqual({ path: "/blog/hello", version: 7 });
  expect(JSON.parse(decodeBase64Url(cursor))).toEqual({
    id: "/blog/hello",
    kind: "build-export",
    value: 7,
    version: 1,
  });
  // A first page that holds no entry continues from the empty path.
  expect(decodeBuildExportCursor(encodeBuildExportCursor(0, ""))).toEqual({
    path: "",
    version: 0,
  });
  const forged = (value) => encodeBase64Url(JSON.stringify(value));
  for (const value of [
    "not a cursor",
    "%%%",
    encodeBase64Url("not json"),
    encodeCursor("public:posts", 1, "post-1"),
    encodeSortCursor("build-export", 7, "/blog/hello"),
    forged({ id: "/a", kind: "build-export", value: -1, version: 1 }),
    forged({ id: "/a", kind: "build-export", value: 1.5, version: 1 }),
    forged({ id: "/a", kind: "build-export", value: "7", version: 1 }),
    forged({ id: "relative", kind: "build-export", value: 7, version: 1 }),
    forged({ id: "/a", kind: "build-export", value: 7, version: 1, extra: true }),
  ]) {
    expect(() => decodeBuildExportCursor(value), value).toThrow(
      expect.objectContaining({ code: "CONTENT_INVALID_STATE", name: "BuildExportCursorError" }),
    );
  }
});

const noRecords = ["", "", "", ""];

test("build-export SQL measures stored bytes and reads a page by path range", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    create table published_state (singleton_key integer primary key, version integer);
    create table content_models (key text primary key, kind text);
    create table content_entries (id text primary key, model_key text, draft_snapshot_id text, published_snapshot_id text);
    create table content_snapshots (id text primary key, entry_id text, revision integer, slug text, title text,
      fields_json text, seo_json text, schema_version integer, created_at integer, updated_at integer, updated_by text);
    create table user (id text primary key, role text);
    create table content_blocks (snapshot_id text, block_key text, block_type text, position integer,
      schema_version integer, data_json text, anchor text, class_name text, hidden integer, settings_json text,
      created_at integer, updated_at integer);
    create table published_routes (path text primary key, entry_id text, snapshot_id text);
    create table media (id text primary key, storage_key text, filename text, mime_type text, size integer,
      width integer, height integer, alt text, caption text, focal_x real, focal_y real, status text,
      created_by text, created_at integer, updated_at integer);
    create table content_media_references (snapshot_id text, source_key text, field_path text, media_id text);
    create table content_entry_link_references (snapshot_id text, source_key text, area text, field_path text, target_entry_id text, delivered integer);
    insert into published_state values (1, 4);
    insert into content_models values ('posts', 'collection'), ('settings', 'global');
    insert into content_entries values
      ('a', 'posts', 'a-d', 'a-p'), ('b', 'posts', 'b-d', 'b-p'), ('c', 'posts', 'c-d', 'c-p'),
      ('draft', 'posts', 'draft-d', null), ('g', 'settings', 'g-d', 'g-p');
    insert into content_snapshots values
      ('a-p', 'a', 1, 'a', 'A', '{"t":"é"}', '{"title":"A"}', 1, 1, 1, 'u'),
      ('b-p', 'b', 1, 'b', 'B', '{}', null, 1, 1, 1, 'u'),
      ('c-p', 'c', 1, 'c', 'C', '{}', null, 1, 1, 1, 'u'),
      ('g-p', 'g', 1, null, 'G', '{"x":1}', null, 1, 1, 1, 'u');
    insert into content_blocks values
      ('a-p', 'k1', 'hero', 1000, 1, '{"m":"m1"}', null, null, 0, '{}', 1, 1),
      ('a-p', 'k2', 'hero', 2000, 1, '{"m":"m2"}', null, null, 1, '{"long":true}', 1, 1),
      ('b-p', 'k3', 'hero', 1000, 1, '{"m":"m3"}', null, null, 0, '{"a":1}', 1, 1);
    insert into published_routes values ('/a', 'a', 'a-p'), ('/b', 'b', 'b-p'), ('/c', 'c', 'c-p');
    insert into media (id, status) values ('m1', 'active'), ('m2', 'active'), ('m3', 'active'), ('m4', 'active');
    insert into content_media_references values
      ('a-p', 'k1', 'm', 'm1'), ('a-p', 'k2', 'm', 'm2'), ('b-p', 'k3', 'm', 'm3'),
      ('g-p', '$fields', 'x', 'm4'), ('draft-d', '$fields', 'x', 'm1');
  `);
  const all = (sql, ...params) =>
    database
      .prepare(sql)
      .all(...params)
      .map((row) => ({ ...row }));
  expect(all(BUILD_EXPORT_VERSION_SQL)).toEqual([{ version: 4 }]);
  // Fields plus the two JSON bytes of an empty local manifest.
  expect(all(BUILD_EXPORT_FIRST_PAGE_VERSION_SQL)).toEqual([{ globals_bytes: 9, version: 4 }]);
  // a: '{"t":"é"}' (10 bytes, é is two) + '{"title":"A"}' (13) + visible '{"m":"m1"}' (10) + '{}' (2).
  // The hidden block's 21 bytes do not count.
  const candidates = all(BUILD_EXPORT_CANDIDATES_SQL, "", 3);
  expect(candidates).toEqual([
    { path: "/a", stored_bytes: 37 },
    { path: "/b", stored_bytes: 2 + 10 + 7 + 2 },
    { path: "/c", stored_bytes: 4 },
  ]);
  expect(all(BUILD_EXPORT_CANDIDATES_SQL, "/a", 3).map((row) => row.path)).toEqual(["/b", "/c"]);

  const manifest = [{ sourceKey: "$fields", area: "fields", pointer: "/url", targetId: "b" }];
  database.exec(
    "insert into content_entry_link_references values ('a-p','$fields','fields','/url','b',1),('a-p','k2','data','/url','b',0)",
  );
  const linkedFields = '{"t":"é","url":"entry:b"}';
  database.prepare("update content_snapshots set fields_json=? where id='a-p'").run(linkedFields);
  const linked = all(BUILD_EXPORT_CANDIDATES_SQL, "", 1)[0];
  expect(linked.stored_bytes).toBe(
    35 + Buffer.byteLength(linkedFields) - 10 + Buffer.byteLength(JSON.stringify(manifest)),
  );
  const publicRoute = all(buildExportPageSql(true).routes, "", "/a")[0];
  expect(JSON.parse(publicRoute.internal_links_json)).toEqual(manifest);
  const range = buildExportPageRange("", candidates.slice(0, 3), 2, 7);
  expect(range).toEqual({
    after: "",
    afterRecord: ["", ""],
    last: "/b",
    lastRecord: ["", ""],
    more: true,
  });
  const first = buildExportPageSql(true);
  expect(all(first.routes, range.after, range.last).map((row) => row.path)).toEqual(["/a", "/b"]);
  expect(all(first.globals).map((row) => row.id)).toEqual(["g"]);
  expect(
    all(first.snapshots, range.after, range.last, ...noRecords)
      .map((row) => row.id)
      .sort(),
  ).toEqual(["a-p", "b-p", "g-p"]);
  expect(
    all(first.blocks, range.after, range.last, ...noRecords).map((row) => row.block_key),
  ).toEqual(["k1", "k3"]);
  expect(
    all(first.media, range.after, range.last, ...noRecords).map((row) => [
      row.public_snapshot_id,
      row.id,
    ]),
  ).toEqual([
    ["a-p", "m1"],
    ["b-p", "m3"],
    ["g-p", "m4"],
  ]);
  const next = buildExportPageSql(false);
  expect(next.globals).toBeUndefined();
  expect(all(next.snapshots, "/b", "/c", ...noRecords).map((row) => row.id)).toEqual(["c-p"]);
  expect(all(next.media, "/b", "/c", ...noRecords)).toEqual([]);
  expect(buildExportPageRange("/b", [{ path: "/c", stored_bytes: 2 }], 2, 0)).toEqual({
    after: "/b",
    afterRecord: ["", ""],
    last: "/c",
    lastRecord: ["", ""],
    more: false,
  });
  expect(buildExportPageRange("", [], 100, 7)).toEqual({
    after: "",
    afterRecord: ["", ""],
    last: "",
    lastRecord: ["", ""],
    more: false,
  });
});
