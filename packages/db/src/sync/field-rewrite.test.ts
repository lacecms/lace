// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { configurationSyncSnapshotRewriteStatements } from "./field-rewrite.js";

test("exact snapshot rewrite binds IDs/paths, preserves JSON types and other sources", () => {
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`create table content_entries(id text primary key, model_key text);
      create table content_snapshots(id text primary key, entry_id text, fields_json text, revision integer, updated_at integer);
      create table content_media_references(snapshot_id text, source_key text, field_path text, media_id text, created_at integer);
      insert into content_entries values('e','posts'),('other','elsewhere');
      insert into content_snapshots values('s','e','{}',7,42),('outside','other','{}',7,42);
      insert into content_media_references values('s','$fields','old','old',1),('s','$seo','image','keep',1),('s','block','image','keep',1);`);
    const row = {
      id: "s",
      fields: { nested: { bool: true, number: 1.5, array: [null, "x", {}] } },
      references: [{ fieldPath: "/nested/image", mediaId: "media'quoted" }],
    };
    const statements = configurationSyncSnapshotRewriteStatements(
      [row, { ...row, id: "outside" }, { ...row, id: "s'); drop table content_snapshots; --" }],
      "posts",
    );
    expect(statements).toHaveLength(3);
    for (const statement of statements) database.prepare(statement.sql).run(...statement.params);
    expect(
      JSON.parse(
        database.prepare("select fields_json from content_snapshots where id='s'").get()
          .fields_json,
      ),
    ).toEqual(row.fields);
    expect(
      database.prepare("select revision,updated_at from content_snapshots where id='s'").get(),
    ).toEqual({ revision: 7, updated_at: 42 });
    expect(
      database.prepare("select fields_json from content_snapshots where id='outside'").get()
        .fields_json,
    ).toBe("{}");
    expect(
      database
        .prepare(
          "select source_key,field_path,media_id from content_media_references order by source_key",
        )
        .all(),
    ).toEqual([
      { source_key: "$fields", field_path: "/nested/image", media_id: "media'quoted" },
      { source_key: "$seo", field_path: "image", media_id: "keep" },
      { source_key: "block", field_path: "image", media_id: "keep" },
    ]);
    expect(() => configurationSyncSnapshotRewriteStatements([row, row], "posts")).toThrow(
      /Duplicate/,
    );
    expect(configurationSyncSnapshotRewriteStatements([], "posts")).toEqual([]);
  } finally {
    database.close();
  }
});
