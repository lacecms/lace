import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import {
  BUILD_EXPORT_CANDIDATES_SQL,
  BUILD_EXPORT_FIRST_PAGE_VERSION_SQL,
  BUILD_EXPORT_VERSION_SQL,
  buildExportPageRange,
  buildExportPageSql,
  decodeBuildExportCursor,
  encodeBuildExportCursor,
  assertDraftPersistenceBounds,
  decodeBase64Url,
  decodeCursor,
  encodeBase64Url,
  encodeCursor,
  encodeSortCursor,
  packageName,
  checkedInMigrations,
  configurationSyncMigrationStatements,
  configurationSyncSnapshotRewriteStatements,
  configurationSyncWriteStatements,
  mediaMetadata,
  mediaMetadataUpdateParams,
  mediaUsageEntries,
  seoJson,
  publicEntry,
  storedSnapshot,
  storedSnapshots,
  sqliteWriteError,
  syncMigrationPage,
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

test("the SEO removal write clears groups and SEO references of one model only", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    create table content_entries (id text primary key, model_key text not null);
    create table content_snapshots (id text primary key, entry_id text not null, seo_json text);
    create table content_media_references (snapshot_id text, source_key text, field_path text, media_id text);
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

test("SEO groups round-trip through snapshot rows", () => {
  const row = {
    created_at: 1,
    entry_id: "e1",
    fields_json: "{}",
    id: "s1",
    revision: 1,
    role: "editor",
    schema_version: 1,
    seo_json: seoJson({ title: "Hello", noindex: true, image: "media-1" }),
    slug: null,
    title: "Hello",
    updated_at: 1,
    updated_by: "editor-1",
  };
  expect(row.seo_json).toBe('{"image":"media-1","noindex":true,"title":"Hello"}');
  expect(storedSnapshot(row).seo).toEqual({ image: "media-1", noindex: true, title: "Hello" });
  expect(storedSnapshot({ ...row, seo_json: null })).not.toHaveProperty("seo");
  expect(seoJson(undefined)).toBeNull();
  expect(() => storedSnapshot({ ...row, seo_json: '{"canonical":"/a"}' })).toThrow();
});

test("media usage maps SEO image references between fields and blocks", () => {
  const base = {
    block_type: null,
    entry_id: "e1",
    model_key: "posts",
    position: null,
    slug: "hello",
    status: "published",
    title: "Hello",
  };
  const [entry] = mediaUsageEntries([
    {
      ...base,
      field_path: "media",
      source_key: "b1",
      block_type: "image",
      position: 1000,
      state: "draft",
    },
    { ...base, field_path: "image", source_key: "$seo", state: "published" },
    { ...base, field_path: "image", source_key: "$seo", state: "draft" },
    { ...base, field_path: "cover", source_key: "$fields", state: "draft" },
  ]);
  expect(entry.locations).toEqual([
    { field: "cover", source: "field", states: ["draft"] },
    { field: "image", source: "seo", states: ["draft", "published"] },
    { blockKey: "b1", blockType: "image", field: "media", source: "block", states: ["draft"] },
  ]);
});

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

test("maps migration scan rows into ordered entries", () => {
  const page = syncMigrationPage(
    [
      { draft_snapshot_id: "d1", id: "e1", published_snapshot_id: "p1" },
      { draft_snapshot_id: "d2", id: "e2", published_snapshot_id: null },
    ],
    [
      { id: "d1", fields_json: "{}", revision: 2, title: "One" },
      { id: "p1", fields_json: "{}", revision: 2, title: "One" },
      { id: "d2", fields_json: "{}", revision: 1, title: "Two" },
    ],
    [
      {
        block_key: "b2",
        block_type: "hero",
        data_json: "{}",
        hidden: 1,
        position: 2,
        schema_version: 1,
        settings_json: null,
        snapshot_id: "d1",
      },
      {
        block_key: "b1",
        block_type: "note",
        data_json: '{"a":1}',
        hidden: 0,
        position: 1,
        schema_version: 1,
        settings_json: '{"tone":"dark"}',
        snapshot_id: "d1",
      },
    ],
    [{ field_path: "image", media_id: "m1", snapshot_id: "p1", source_key: "b1" }],
    2,
  );
  expect(page.next).toBe("e2");
  expect(page.items[0].draft.blocks).toEqual([
    {
      data: { a: 1 },
      hidden: false,
      key: "b1",
      position: 1,
      schemaVersion: 1,
      settings: { tone: "dark" },
      type: "note",
    },
    { data: {}, hidden: true, key: "b2", position: 2, schemaVersion: 1, type: "hero" },
  ]);
  expect(page.items[0].published.references).toEqual([
    { fieldPath: "image", mediaId: "m1", sourceKey: "b1" },
  ]);
  expect(page.items[1]).toEqual({
    draft: {
      blocks: [],
      fields: {},
      references: [],
      revision: 1,
      snapshotId: "d2",
      state: "draft",
      title: "Two",
    },
    entryId: "e2",
  });
});

test("maps descriptive media metadata and refuses inconsistent rows", () => {
  const row = {
    created_at: 1,
    created_by: "editor",
    filename: "bike.png",
    height: 2,
    id: "m-1",
    mime_type: "image/png",
    size: 3,
    status: "active",
    storage_key: "media/m-1",
    updated_at: 4,
    width: 5,
  };
  const bare = mediaMetadata({ ...row, alt: null, caption: null, focal_x: null, focal_y: null });
  expect(bare).not.toHaveProperty("alt");
  expect(bare).not.toHaveProperty("caption");
  expect(bare).not.toHaveProperty("focalPoint");
  expect(
    mediaMetadata({ ...row, alt: "Bike", caption: "A\nbike", focal_x: 0, focal_y: 1 }),
  ).toMatchObject({ alt: "Bike", caption: "A\nbike", focalPoint: { x: 0, y: 1 } });
  for (const invalid of [
    { focal_x: 0.5, focal_y: null },
    { focal_x: 0.5, focal_y: 1.5 },
    { alt: "" },
    { alt: 7 },
    { caption: "x".repeat(2001) },
  ]) {
    expect(() => mediaMetadata({ ...row, ...invalid })).toThrow(
      expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
    );
  }
  const input = {
    alt: "Bike",
    caption: null,
    expectedUpdatedAt: 4,
    focalPoint: { x: 0.25, y: 0.75 },
    mediaId: "m-1",
    requestedBy: { id: "editor", role: "editor" },
    updatedAt: 5,
  };
  expect(mediaMetadataUpdateParams(input)).toEqual(["Bike", null, 0.25, 0.75, 5, "m-1", 4]);
  expect(() => mediaMetadataUpdateParams({ ...input, updatedAt: 4 })).toThrow(
    expect.objectContaining({ code: "CONTENT_INVALID_STATE" }),
  );
});

test("maps stored block envelopes and drops hidden blocks from public entries", () => {
  const snapshotRow = (id) => ({
    created_at: 1,
    entry_id: "e1",
    fields_json: "{}",
    id,
    revision: 1,
    role: "editor",
    schema_version: 1,
    seo_json: null,
    slug: null,
    title: "Home",
    updated_at: 1,
    updated_by: "editor",
  });
  const blockRow = (key, overrides = {}) => ({
    anchor: null,
    block_key: key,
    block_type: "note",
    class_name: null,
    created_at: 1,
    data_json: "{}",
    hidden: 0,
    position: 1,
    schema_version: 1,
    settings_json: "{}",
    snapshot_id: "p1",
    updated_at: 1,
    ...overrides,
  });
  const snapshots = storedSnapshots(
    [snapshotRow("p1")],
    [
      blockRow("b1", { anchor: "pricing", class_name: "wide", settings_json: '{"tone":"dark"}' }),
      blockRow("b2", { hidden: 1, position: 2 }),
    ],
  );
  const blocks = snapshots.get("p1").blocks;
  expect(blocks[0]).toEqual({
    anchor: "pricing",
    className: "wide",
    data: {},
    hidden: false,
    key: "b1",
    position: 1,
    schemaVersion: 1,
    settings: { tone: "dark" },
    type: "note",
  });
  expect(blocks[1]).toMatchObject({ hidden: true, key: "b2", settings: {} });
  expect(blocks[1]).not.toHaveProperty("anchor");
  const published = { ...snapshots.get("p1"), state: "published" };
  const projected = publicEntry({
    draft: { ...published, state: "draft" },
    id: "e1",
    model: { key: "home", kind: "page", path: "/" },
    published,
  });
  expect(projected.published.blocks.map((block) => block.key)).toEqual(["b1"]);
  expect(projected.draft.blocks.map((block) => block.key)).toEqual(["b1"]);
});

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
  // '{"x":1}' is 7 bytes.
  expect(all(BUILD_EXPORT_FIRST_PAGE_VERSION_SQL)).toEqual([{ globals_bytes: 7, version: 4 }]);
  // a: '{"t":"é"}' (10 bytes, é is two) + '{"title":"A"}' (13) + visible '{"m":"m1"}' (10) + '{}' (2).
  // The hidden block's 21 bytes do not count.
  const candidates = all(BUILD_EXPORT_CANDIDATES_SQL, "", 3);
  expect(candidates).toEqual([
    { path: "/a", stored_bytes: 35 },
    { path: "/b", stored_bytes: 2 + 10 + 7 },
    { path: "/c", stored_bytes: 2 },
  ]);
  expect(all(BUILD_EXPORT_CANDIDATES_SQL, "/a", 3).map((row) => row.path)).toEqual(["/b", "/c"]);

  const range = buildExportPageRange("", candidates.slice(0, 3), 2, 7);
  expect(range).toEqual({ after: "", last: "/b", more: true });
  const first = buildExportPageSql(true);
  expect(all(first.routes, range.after, range.last).map((row) => row.path)).toEqual(["/a", "/b"]);
  expect(all(first.globals).map((row) => row.id)).toEqual(["g"]);
  expect(
    all(first.snapshots, range.after, range.last)
      .map((row) => row.id)
      .sort(),
  ).toEqual(["a-p", "b-p", "g-p"]);
  expect(all(first.blocks, range.after, range.last).map((row) => row.block_key)).toEqual([
    "k1",
    "k3",
  ]);
  expect(
    all(first.media, range.after, range.last).map((row) => [row.public_snapshot_id, row.id]),
  ).toEqual([
    ["a-p", "m1"],
    ["b-p", "m3"],
    ["g-p", "m4"],
  ]);
  const next = buildExportPageSql(false);
  expect(next.globals).toBeUndefined();
  expect(all(next.snapshots, "/b", "/c").map((row) => row.id)).toEqual(["c-p"]);
  expect(all(next.media, "/b", "/c")).toEqual([]);
  expect(buildExportPageRange("/b", [{ path: "/c", stored_bytes: 2 }], 2, 0)).toEqual({
    after: "/b",
    last: "/c",
    more: false,
  });
  expect(buildExportPageRange("", [], 100, 7)).toEqual({ after: "", last: "", more: false });
});
