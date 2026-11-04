// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { configurationSyncMigrationStatements } from "./block-migration-writes.js";

function migrationDatabase(blockCount) {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    create table content_entries (id text primary key, draft_snapshot_id text, published_snapshot_id text);
    create table content_snapshots (id text primary key, entry_id text not null, revision integer not null,
      updated_at integer not null, updated_by text not null);
    create table content_blocks (snapshot_id text, block_key text, block_type text, position integer,
      schema_version integer, data_json text, updated_at integer, anchor text, hidden integer default 0,
      settings_json text not null default '{}');
    create table media (id text primary key, status text not null);
    create table content_media_references (snapshot_id text, source_key text, field_path text,
      media_id text not null, created_at integer);
    insert into content_entries values ('e1', 'd1', 'p1');
    insert into content_snapshots values ('d1', 'e1', 3, 1, 'editor'), ('p1', 'e1', 3, 1, 'publisher');
    insert into media values ('m1', 'active'), ('gone', 'deleting');
  `);
  const insertBlock = database.prepare(
    "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, updated_at, anchor, hidden) values (?, ?, 'note', ?, 1, '{}', 1, ?, 1)",
  );
  const insertReference = database.prepare(
    "insert into content_media_references values (?, ?, 'image', 'm1', 1)",
  );
  for (const snapshot of ["d1", "p1"]) {
    for (let index = 0; index < blockCount; index += 1) {
      insertBlock.run(snapshot, `b${index}`, index + 1, `a${index}`);
      insertReference.run(snapshot, `b${index}`);
    }
  }
  return database;
}

function migration(state, blockCount, overrides = {}) {
  return {
    blocks: Array.from({ length: blockCount }, (_, index) => ({
      data: { cover: "m1", text: `t${index}` },
      expectedSchemaVersion: 1,
      key: `b${index}`,
      schemaVersion: 3,
      settings: { tone: `s${index}` },
    })),
    expectedRevision: 3,
    references: Array.from({ length: blockCount }, (_, index) => ({
      fieldPath: "cover",
      mediaId: "m1",
      sourceKey: `b${index}`,
    })),
    revision: 4,
    snapshotId: state === "draft" ? "d1" : "p1",
    state,
    ...(state === "draft" ? { updatedBy: "system:content-sync" } : {}),
    ...overrides,
  };
}

function runMigration(database, statements) {
  const guard = database
    .prepare(`select ${statements.guard.sql} as ok`)
    .get(...statements.guard.params);
  if (guard.ok !== 1) return false;
  for (const write of statements.writes) {
    // Appending a guard condition, as the D1 batch does, must keep the statement valid.
    database.prepare(`${write.sql} and ? = 1`).run(...write.params, 1);
  }
  return true;
}

test("block migration statements rewrite in place within the D1 parameter limit", () => {
  const database = migrationDatabase(200);
  const published = configurationSyncMigrationStatements(
    migration("published", 200, { draftGuard: { revision: 3, snapshotId: "d1" } }),
    50,
    99,
  );
  const draft = configurationSyncMigrationStatements(migration("draft", 200), 50, 99);
  for (const statements of [published, draft]) {
    for (const write of statements.writes) expect(write.params.length).toBeLessThanOrEqual(99);
    // 200 blocks: 11 block rewrites (5 values per row), 1 delete, 7 reference inserts, 1 head.
    expect(statements.writes.length).toBeLessThanOrEqual(20);
  }
  expect(runMigration(database, published)).toBe(true);
  expect(runMigration(database, draft)).toBe(true);
  expect(
    database
      .prepare("select id, revision, updated_at, updated_by from content_snapshots order by id")
      .all()
      .map((row) => ({ ...row })),
  ).toEqual([
    { id: "d1", revision: 4, updated_at: 50, updated_by: "system:content-sync" },
    { id: "p1", revision: 4, updated_at: 50, updated_by: "publisher" },
  ]);
  const block = database
    .prepare(
      "select schema_version, data_json, settings_json, anchor, hidden, position, updated_at from content_blocks where snapshot_id = 'p1' and block_key = 'b7'",
    )
    .get();
  // Settings migrate with the data; the anchor and hidden flag stay.
  expect({ ...block }).toEqual({
    anchor: "a7",
    data_json: '{"cover":"m1","text":"t7"}',
    hidden: 1,
    position: 8,
    schema_version: 3,
    settings_json: '{"tone":"s7"}',
    updated_at: 50,
  });
  expect(
    database
      .prepare("select count(*) as n from content_media_references where field_path = 'cover'")
      .get().n,
  ).toBe(400);
  expect(
    database
      .prepare("select count(*) as n from content_media_references where field_path = 'image'")
      .get().n,
  ).toBe(0);
  // Repeating the same unit fails its revision and block-version guards.
  expect(runMigration(database, draft)).toBe(false);
});

test("block migration guards check versions, current snapshots and the draft revision", () => {
  const database = migrationDatabase(2);
  const guarded = (value) => {
    const statements = configurationSyncMigrationStatements(value, 50, 99);
    return database.prepare(`select ${statements.guard.sql} as ok`).get(...statements.guard.params)
      .ok;
  };
  expect(guarded(migration("draft", 2))).toBe(1);
  expect(guarded(migration("draft", 2, { expectedRevision: 2 }))).toBe(0);
  expect(guarded(migration("published", 2, { snapshotId: "d1" }))).toBe(0);
  expect(
    guarded(migration("published", 2, { draftGuard: { revision: 2, snapshotId: "d1" } })),
  ).toBe(0);
  database.exec("update content_blocks set schema_version = 2 where block_key = 'b1'");
  expect(guarded(migration("draft", 2))).toBe(0);

  const inactive = configurationSyncMigrationStatements(
    migration("published", 1, {
      references: [{ fieldPath: "cover", mediaId: "gone", sourceKey: "b0" }],
    }),
    50,
    99,
  );
  expect(() => runMigration(database, inactive)).toThrow(/NOT NULL/u);
});
