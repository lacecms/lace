import { expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import type { SQLInputValue } from "node:sqlite";
import {
  BUILD_EXPORT_CANDIDATES_SQL,
  BUILD_EXPORT_RECORD_CANDIDATES_SQL,
  buildExportPageRange,
  buildExportPageSql,
  decodeBuildExportCursor,
  encodeBuildExportCursor,
} from "./export.js";
import type { BuildExportCandidateRow, BuildExportRecordCandidateRow } from "./export.js";
import { PUBLIC_RECORD_SQL } from "../delivery/public.js";
import { encodeBase64Url } from "../shared/base64.js";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    create table content_models (key text primary key, kind text);
    create table content_entries (id text primary key, model_key text, draft_snapshot_id text, published_snapshot_id text);
    create table content_snapshots (id text primary key, entry_id text, revision integer, slug text, title text,
      fields_json text, seo_json text, schema_version integer, created_at integer, updated_at integer, updated_by text);
    create table content_blocks (snapshot_id text, block_key text, block_type text, position integer,
      schema_version integer, data_json text, anchor text, class_name text, hidden integer, settings_json text,
      created_at integer, updated_at integer);
    create table published_routes (path text primary key, entry_id text, snapshot_id text);
    create table user (id text primary key, role text);
    create table media (id text primary key, storage_key text, filename text, mime_type text, size integer,
      width integer, height integer, alt text, caption text, focal_x real, focal_y real, status text,
      created_by text, created_at integer, updated_at integer);
    create table content_media_references (snapshot_id text, source_key text, field_path text, media_id text);
    create table content_entry_link_references (snapshot_id text, source_key text, area text, field_path text, target_entry_id text, delivered integer);
    insert into content_models values ('posts', 'collection'), ('cv', 'collection'),
      ('testimonials', 'collection'), ('settings', 'global');
    insert into content_entries values
      ('a', 'posts', 'a-d', 'a-p'), ('cv2', 'cv', 'cv2-d', 'cv2-p'), ('cv1', 'cv', 'cv1-d', 'cv1-p'),
      ('cv3', 'cv', 'cv3-d', null), ('t1', 'testimonials', 't1-d', 't1-p'), ('g', 'settings', 'g-d', 'g-p');
    insert into content_snapshots values
      ('a-p', 'a', 1, 'a', 'A', '{}', null, 1, 1, 1, 'u'),
      ('cv1-p', 'cv1', 1, null, 'CV 1', '{"year":2020}', null, 1, 5, 5, 'u'),
      ('cv2-p', 'cv2', 1, null, 'CV 2', '{}', null, 1, 7, 7, 'u'),
      ('t1-p', 't1', 1, null, 'T 1', '{}', null, 1, 6, 6, 'u'),
      ('g-p', 'g', 1, null, 'G', '{}', null, 1, 1, 1, 'u');
    insert into content_blocks values
      ('cv1-p', 'k1', 'hero', 1000, 1, '{"m":"m1"}', null, null, 0, '{}', 1, 1);
    insert into published_routes values ('/a', 'a', 'a-p');
    insert into media (id, status) values ('m1', 'active'), ('m2', 'active');
    insert into content_media_references values ('cv1-p', 'k1', 'm', 'm1'), ('t1-p', '$fields', 'x', 'm2');
  `);
  return <Row = Record<string, unknown>>(sql: string, ...params: SQLInputValue[]): Row[] =>
    db
      .prepare(sql)
      .all(...params)
      .map((row) => ({ ...row }) as Row);
}

test("record candidates are published route-less entries ordered by model key and ID", () => {
  const all = database();
  // cv1: '{"year":2020}' (13) + '[]' (2) + '{"m":"m1"}' (10) + '{}' (2).
  expect(all(BUILD_EXPORT_RECORD_CANDIDATES_SQL, "", "", 10)).toEqual([
    { id: "cv1", model_key: "cv", stored_bytes: 27 },
    { id: "cv2", model_key: "cv", stored_bytes: 4 },
    { id: "t1", model_key: "testimonials", stored_bytes: 4 },
  ]);
  expect(all(BUILD_EXPORT_RECORD_CANDIDATES_SQL, "cv", "cv1", 10).map((row) => row.id)).toEqual([
    "cv2",
    "t1",
  ]);
  expect(all(BUILD_EXPORT_RECORD_CANDIDATES_SQL, "", "", 1).map((row) => row.id)).toEqual(["cv1"]);
  // Routed entries and records are disjoint; globals and drafts are neither.
  expect(all(BUILD_EXPORT_CANDIDATES_SQL, "", 10).map((row) => row.path)).toEqual(["/a"]);
  expect(all(`${PUBLIC_RECORD_SQL} order by e.id`).map((row) => row.id)).toEqual([
    "cv1",
    "cv2",
    "t1",
  ]);
});

test("a page delivers records only after the last routed entry", () => {
  const all = database();
  const routes = all<BuildExportCandidateRow>(BUILD_EXPORT_CANDIDATES_SQL, "", 3);
  const records = all<BuildExportRecordCandidateRow>(BUILD_EXPORT_RECORD_CANDIDATES_SQL, "", "", 3);
  const range = buildExportPageRange("", routes, 2, 0, ["", ""], records);
  expect(range).toEqual({
    after: "",
    afterRecord: ["", ""],
    last: "/a",
    lastRecord: ["cv", "cv1"],
    more: true,
  });
  const sql = buildExportPageSql(false);
  const recordRange = [...range.afterRecord, ...range.lastRecord];
  expect(all(sql.records, ...recordRange).map((row) => row.id)).toEqual(["cv1"]);
  const both = [range.after, range.last, ...recordRange];
  expect(
    all(sql.snapshots, ...both)
      .map((row) => row.id)
      .sort(),
  ).toEqual(["a-p", "cv1-p"]);
  expect(all(sql.blocks, ...both).map((row) => row.block_key)).toEqual(["k1"]);
  expect(all(sql.media, ...both).map((row) => [row.public_snapshot_id, row.id])).toEqual([
    ["cv1-p", "m1"],
  ]);

  const continued = buildExportPageRange(
    "/a",
    all<BuildExportCandidateRow>(BUILD_EXPORT_CANDIDATES_SQL, "/a", 3),
    2,
    0,
    ["cv", "cv1"],
    all<BuildExportRecordCandidateRow>(BUILD_EXPORT_RECORD_CANDIDATES_SQL, "cv", "cv1", 3),
  );
  expect(continued).toEqual({
    after: "/a",
    afterRecord: ["cv", "cv1"],
    last: "/a",
    lastRecord: ["testimonials", "t1"],
    more: false,
  });
  const rest = [continued.after, continued.last, ...continued.afterRecord, ...continued.lastRecord];
  expect(all(sql.media, ...rest).map((row) => row.id)).toEqual(["m2"]);
});

test("the record budget and limit apply across both phases", () => {
  const routes = [{ path: "/a", stored_bytes: 10 }];
  const records = [
    { id: "r1", model_key: "cv", stored_bytes: 4_000_000 },
    { id: "r2", model_key: "cv", stored_bytes: 1 },
  ];
  // An oversized record ends the page before it, then comes alone.
  expect(buildExportPageRange("", routes, 10, 0, ["", ""], records)).toMatchObject({
    last: "/a",
    lastRecord: ["", ""],
    more: true,
  });
  expect(buildExportPageRange("/a", [], 10, 0, ["", ""], records)).toMatchObject({
    lastRecord: ["cv", "r1"],
    more: true,
  });
});

test("record cursors round-trip; path cursors stay valid", () => {
  const cursor = encodeBuildExportCursor(7, "/a", ["cv", "cv1"]);
  expect(decodeBuildExportCursor(cursor)).toEqual({
    path: "/a",
    record: ["cv", "cv1"],
    version: 7,
  });
  expect(decodeBuildExportCursor(encodeBuildExportCursor(7, "/a"))).toEqual({
    path: "/a",
    version: 7,
  });
  const forged = (value: unknown) => encodeBase64Url(JSON.stringify(value));
  for (const record of [["cv"], ["", "x"], ["cv", 1], "cv/cv1"])
    expect(() =>
      decodeBuildExportCursor(
        forged({ id: "/a", kind: "build-export", record, value: 7, version: 1 }),
      ),
    ).toThrow(expect.objectContaining({ name: "BuildExportCursorError" }));
});
