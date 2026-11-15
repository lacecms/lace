// @ts-nocheck
// TODO(rf2): Type legacy SQLite/product harnesses, branded values and partial runtime adapters.
import { expect, test } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  listAppliedMigrations,
  migrateNodeDatabase,
  NodeContentRepository,
  NodeSqliteReadiness,
  openNodeDatabase,
  parseNodeRuntimeSettings,
  createNodeRuntime,
} from "./index.js";
import { defineConfig, definePage } from "@lacecms/config";

import { checkedInMigrations } from "@lacecms/db";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";

const minioEnvironment = Object.freeze({
  LACE_MINIO_ACCESS_KEY: "test-access-key",
  LACE_MINIO_BUCKET: "lace-media",
  LACE_MINIO_ENDPOINT: "http://minio.test:9000",
  LACE_MINIO_REGION: "us-east-1",
  LACE_MINIO_SECRET_KEY: "test-secret-key",
  LACE_MINIO_TIMEOUT_MS: "1000",
});

const editor = { id: actorId("editor"), role: "editor" };
const routes = new Map([
  ["posts", { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" }],
  ["home", { key: contentModelKey("home"), kind: "page", path: "/" }],
]);

function draftEntry(id, modelKey, updatedAt, title = id) {
  const entryId = contentEntryId(id);
  return createContentEntry({
    id: entryId,
    model: routes.get(modelKey),
    draft: {
      blocks: [
        {
          data: { image: "media-1", title },
          key: blockKey(`${id}-block`),
          position: 1000,
          schemaVersion: 1,
          type: "hero",
        },
      ],
      createdAt: unixMilliseconds(updatedAt),
      entryId,
      fields: { image: "media-1", title },
      id: contentSnapshotId(`${id}-draft`),
      revision: 1,
      slug: id,
      state: "draft",
      title,
      updatedAt: unixMilliseconds(updatedAt),
      updatedBy: editor,
    },
  });
}

function references(blockKeyValue) {
  return [
    { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: "$fields" },
    { fieldPath: "image", mediaId: mediaId("media-1"), sourceKey: blockKey(blockKeyValue) },
  ];
}

test("reports cheap SQLite readiness failures after the connection closes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-readiness-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    migrateNodeDatabase(databasePath);
    const database = openNodeDatabase(databasePath);
    const readiness = new NodeSqliteReadiness(database.connection);
    await expect(readiness.isReady()).resolves.toBe(true);
    database.connection.close();
    await expect(readiness.isReady()).resolves.toBe(false);
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("unmigrated SQLite is not ready until the explicit migration command runs", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-readiness-pending-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    let database = openNodeDatabase(databasePath);
    await expect(new NodeSqliteReadiness(database.connection).isReady()).resolves.toBe(false);
    database.connection.close();
    migrateNodeDatabase(databasePath);
    database = openNodeDatabase(databasePath);
    await expect(new NodeSqliteReadiness(database.connection).isReady()).resolves.toBe(true);
    database.connection.close();
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("Node API does not migrate an outdated database on startup", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-startup-pending-"));
  const databasePath = join(directory, "lace.sqlite");
  const settings = parseNodeRuntimeSettings({
    ...minioEnvironment,
    LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
    LACE_DATABASE_PATH: databasePath,
    LACE_PUBLIC_BASE_URL: "https://lace.test/",
  });
  const config = await defineConfig({
    content: [definePage({ key: "home", path: "/", version: 1 })],
  });
  try {
    const runtime = createNodeRuntime({ config, settings });
    try {
      await expect(runtime.readiness.isReady()).resolves.toBe(false);
      const tables = runtime.database.connection
        .prepare("select name from sqlite_master where type = 'table'")
        .all();
      expect(tables.some((row) => row.name === "__drizzle_migrations")).toBe(false);
    } finally {
      runtime.close();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("migrates an empty file, reopens with SQLite invariants, and enforces constraints", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-schema-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    expect(migrateNodeDatabase(databasePath)).toHaveLength(checkedInMigrations.length);
    const database = openNodeDatabase(databasePath);
    try {
      expect(database.connection.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(database.connection.pragma("journal_mode", { simple: true })).toBe("wal");
      expect(listAppliedMigrations(database.connection)).toHaveLength(checkedInMigrations.length);

      const tableNames = database.connection
        .prepare("select name from sqlite_master where type = 'table'")
        .all()
        .map(({ name }) => name);
      expect(tableNames).toEqual(
        expect.arrayContaining([
          "content_models",
          "content_entries",
          "content_snapshots",
          "content_actor_profiles",
          "outbox_events",
          "installation_state",
          "mutation_guards",
          "user",
        ]),
      );
      expect(() =>
        database.connection
          .prepare("insert into mutation_guards (token, created_at) values (null, 1)")
          .run(),
      ).toThrow();
      const indexNames = database.connection
        .prepare("select name from sqlite_master where type = 'index'")
        .all()
        .map(({ name }) => name);
      expect(indexNames).toEqual(
        expect.arrayContaining([
          "content_entries_singleton_idx",
          "content_entries_list_idx",
          "content_blocks_snapshot_position_idx",
          "content_media_references_media_idx",
          "outbox_events_available_idx",
          "site_builds_history_idx",
        ]),
      );
      const queryPlan = (sql, ...bindings) =>
        database.connection.prepare(`explain query plan ${sql}`).all(...bindings);
      expect(
        queryPlan("select * from content_blocks where snapshot_id = ? order by position", "x"),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            detail: expect.stringContaining("content_blocks_snapshot_position_idx"),
          }),
        ]),
      );
      expect(queryPlan("select * from content_media_references where media_id = ?", "x")).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            detail: expect.stringContaining("content_media_references_media_idx"),
          }),
        ]),
      );
      expect(
        queryPlan(
          "select * from content_entries where model_key = ? order by updated_at desc, id desc",
          "home",
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ detail: expect.stringContaining("content_entries_list_idx") }),
        ]),
      );
      expect(
        queryPlan(
          "select * from outbox_events where processed_at is null and locked_at is null and available_at <= ?",
          1,
        ),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            detail: expect.stringContaining("outbox_events_available_idx"),
          }),
        ]),
      );

      const insertModel = database.connection.prepare(
        "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      insertModel.run("home", "page", "Home", 1, "structure", "projection", 1, 1);
      expect(() =>
        insertModel.run("invalid", "unsupported", "Invalid", 1, "structure", "projection", 1, 1),
      ).toThrow();
      const insertEntry = database.connection.prepare(
        "insert into content_entries (id, model_key, singleton_key, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?)",
      );
      insertEntry.run("home-1", "home", 1, "admin", 1, 1);
      expect(() => insertEntry.run("home-2", "home", 1, "admin", 1, 1)).toThrow();
      expect(() =>
        database.connection
          .prepare(
            "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run("missing", "block", "hero", 1000, 1, "{}", 1, 1),
      ).toThrow();

      expect(() =>
        database.connection
          .prepare(
            "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          )
          .run(
            "invalid-media",
            "object-invalid",
            "image.png",
            "image/png",
            1,
            "{}",
            "missing",
            "admin",
            1,
            1,
          ),
      ).toThrow();
      expect(() =>
        database.connection.prepare("insert into published_state values (?, ?, ?)").run(2, 0, 1),
      ).toThrow();
      expect(() =>
        database.connection
          .prepare(
            "insert into site_builds (id, reason, status, target_version, requested_by, requested_at) values (?, ?, ?, ?, ?, ?)",
          )
          .run("invalid-build", "manual", "deployed", 0, "admin", 1),
      ).toThrow();

      insertModel.run("posts", "collection", "Posts", 1, "structure", "projection", 1, 1);
      insertEntry.run("post-1", "posts", null, "admin", 1, 1);
      insertEntry.run("post-2", "posts", null, "admin", 1, 1);
      const insertSnapshot = database.connection.prepare(
        "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      insertSnapshot.run("post-1-draft", "post-1", 1, null, "First", "{}", 1, 1, 1, "admin");
      insertSnapshot.run("post-2-draft", "post-2", 1, null, "Second", "{}", 1, 1, 1, "admin");
      database.connection
        .prepare("update content_entries set draft_snapshot_id = ? where id = ?")
        .run("post-1-draft", "post-1");
      database.connection
        .prepare("insert into published_routes values (?, ?, ?, ?)")
        .run("/posts/first", "post-1", "post-1-draft", 1);
      expect(() =>
        database.connection
          .prepare("insert into published_routes values (?, ?, ?, ?)")
          .run("/posts/first", "post-2", "post-2-draft", 1),
      ).toThrow();
      const insertIdempotency = database.connection.prepare(
        "insert into idempotency_records values (?, ?, ?, ?, ?, ?)",
      );
      insertIdempotency.run("publication:post-1", "request-1", "hash", "{}", 1, 2);
      expect(() =>
        insertIdempotency.run("publication:post-1", "request-1", "different", "{}", 1, 2),
      ).toThrow();

      database.connection
        .prepare(
          "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("media-1", "object-1", "image.png", "image/png", 1, "{}", "active", "admin", 1, 1);
      database.connection
        .prepare("insert into content_media_references values (?, ?, ?, ?, ?)")
        .run("post-1-draft", "$fields", "image", "media-1", 1);
      expect(() =>
        database.connection.prepare("delete from media where id = ?").run("media-1"),
      ).toThrow();

      database.connection
        .prepare("update content_models set key = ? where key = ?")
        .run("articles", "posts");
      expect(
        database.connection
          .prepare("select model_key from content_entries where id = ?")
          .get("post-1"),
      ).toEqual({ model_key: "articles" });
      expect(() =>
        database.connection.prepare("delete from content_models where key = ?").run("articles"),
      ).toThrow();

      database.connection.prepare("delete from content_snapshots where id = ?").run("post-1-draft");
      expect(
        database.connection
          .prepare("select draft_snapshot_id from content_entries where id = ?")
          .get("post-1"),
      ).toEqual({ draft_snapshot_id: null });
      expect(
        database.connection.prepare("select count(*) as count from content_media_references").get(),
      ).toEqual({ count: 0 });
      database.connection.prepare("delete from media where id = ?").run("media-1");

      database.connection
        .prepare(
          "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("post-2-draft", "block-1", "hero", 1000, 1, "{}", 1, 1);
      database.connection.prepare("delete from content_entries where id = ?").run("post-2");
      expect(
        database.connection.prepare("select count(*) as count from content_blocks").get(),
      ).toEqual({
        count: 0,
      });
    } finally {
      database.connection.close();
    }

    const migrationFile = (await readdir(new URL("../../db/drizzle", import.meta.url))).find(
      (file) => file.endsWith(".sql"),
    );
    expect(migrationFile).toBeDefined();
    const migrationSql = await readFile(
      new URL(`../../db/drizzle/${migrationFile}`, import.meta.url),
      "utf8",
    );
    expect(migrationSql).not.toContain("journal_mode");
    expect(migrationSql).not.toContain("foreign_keys = ON");
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("bounds Node build-export queries and selects the entry-list index", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-node-plans-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    migrateNodeDatabase(databasePath);
    const database = openNodeDatabase(databasePath);
    try {
      database.connection
        .prepare(
          "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("posts", "collection", "Posts", 1, "structure", "projection", 1, 1);
      database.connection
        .prepare(
          "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("media-1", "object-1", "image.png", "image/png", 1, "{}", "active", "editor", 1, 1);
      const repository = new NodeContentRepository(database.connection, (key) => routes.get(key));
      for (const [id, at] of [
        ["post-a", 20],
        ["post-b", 21],
      ]) {
        await repository.create({
          entry: draftEntry(id, "posts", at),
          mediaReferences: references(`${id}-block`),
        });
        await repository.publish({
          entryId: contentEntryId(id),
          expectedRevision: 1,
          publishedAt: unixMilliseconds(at + 10),
          publishedBy: editor,
          publishedSnapshotId: contentSnapshotId(`${id}-published`),
        });
      }
      const prepare = database.connection.prepare.bind(database.connection);
      const statements = [];
      database.connection.prepare = (sql) => {
        statements.push(sql);
        return prepare(sql);
      };
      expect(await repository.exportBuildContentPage({ limit: 100 })).toMatchObject({
        entries: [
          { media: [{ id: "media-1" }], path: "/blog/post-a" },
          { media: [{ id: "media-1" }], path: "/blog/post-b" },
        ],
        globals: [],
        version: 2,
      });
      // Version with global sizes, entry and record candidates, the shared
      // protocol's version re-read (same transaction), routes, records, globals,
      // snapshots, blocks and delivered media: fixed, independent of the entry count.
      expect(statements.length).toBeLessThanOrEqual(10);
      expect(statements.join("\n")).not.toMatch(/ in \(\?/u);
      const mediaStatement = statements.find((sql) => sql.includes("public_snapshot_id"));
      expect(
        database.connection
          .prepare(`explain query plan ${mediaStatement}`)
          .all("", "/blog/post-b", "", "", "", ""),
      ).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ detail: expect.stringMatching(/^SCAN r\b/u) }),
        ]),
      );
      statements.length = 0;
      await repository.list({
        limit: 100,
        listFields: [],
        modelKey: contentModelKey("posts"),
        sort: "-updatedAt",
      });
      database.connection.prepare = prepare;
      const listStatement = statements.find((sql) => sql.includes("sort_value"));
      expect(
        database.connection
          .prepare(`explain query plan ${listStatement}`)
          .all({ 1: "posts", 2: 101 }),
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ detail: expect.stringContaining("content_entries_list_idx") }),
        ]),
      );
    } finally {
      database.connection.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});

test("reads each Node build-export page from one snapshot despite concurrent commits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-node-export-"));
  const databasePath = join(directory, "lace.sqlite");
  try {
    migrateNodeDatabase(databasePath);
    const database = openNodeDatabase(databasePath);
    const writer = openNodeDatabase(databasePath);
    try {
      database.connection
        .prepare(
          "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("posts", "collection", "Posts", 1, "structure", "projection", 1, 1);
      database.connection
        .prepare(
          "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .run("media-1", "object-1", "image.png", "image/png", 1, "{}", "active", "editor", 1, 1);
      const repository = new NodeContentRepository(database.connection, (key) => routes.get(key));
      for (const [id, at] of [
        ["post-a", 20],
        ["post-b", 21],
      ]) {
        await repository.create({
          entry: draftEntry(id, "posts", at),
          mediaReferences: references(`${id}-block`),
        });
        await repository.publish({
          entryId: contentEntryId(id),
          expectedRevision: 1,
          publishedAt: unixMilliseconds(at + 10),
          publishedBy: editor,
          publishedSnapshotId: contentSnapshotId(`${id}-published`),
        });
      }
      // Another connection unpublishes post-b after the page chose its range.
      const prepare = database.connection.prepare.bind(database.connection);
      let committed = false;
      database.connection.prepare = (sql) => {
        if (!committed && sql.includes("hidden = 0 and")) {
          committed = true;
          writer.connection.transaction(() => {
            // An unpublication removes the route and the publication together.
            writer.connection
              .prepare("delete from published_routes where path = ?")
              .run("/blog/post-b");
            writer.connection
              .prepare("update content_entries set published_snapshot_id = null where id = ?")
              .run("post-b");
            writer.connection
              .prepare("update published_state set version = version + 1 where singleton_key = 1")
              .run();
          })();
        }
        return prepare(sql);
      };
      const page = await repository.exportBuildContentPage({ limit: 2 });
      database.connection.prepare = prepare;
      expect(committed).toBe(true);
      expect(page.version).toBe(2);
      expect(page.entries.map((item) => item.path)).toEqual(["/blog/post-a", "/blog/post-b"]);
      expect(page.entries.map((item) => item.media.map((media) => media.id))).toEqual([
        ["media-1"],
        ["media-1"],
      ]);
      const current = await repository.exportBuildContentPage({ limit: 1 });
      expect(current).toMatchObject({ entries: [{ path: "/blog/post-a" }], version: 3 });
      expect(current).not.toHaveProperty("nextCursor");

      // A cursor issued before another connection's commit cannot continue.
      writer.connection
        .prepare(
          "insert into published_routes (path, entry_id, snapshot_id, updated_at) values (?, ?, ?, ?)",
        )
        .run("/blog/post-b", "post-b", "post-b-published", 50);
      writer.connection
        .prepare("update content_entries set published_snapshot_id = ? where id = ?")
        .run("post-b-published", "post-b");
      const before = await repository.exportBuildContentPage({ limit: 1 });
      expect(before).toMatchObject({ entries: [{ path: "/blog/post-a" }], version: 3 });
      writer.connection
        .prepare("update published_state set version = version + 1 where singleton_key = 1")
        .run();
      await expect(
        repository.exportBuildContentPage({ after: before.nextCursor, limit: 1 }),
      ).rejects.toMatchObject({
        actualVersion: 4,
        code: "BUILD_EXPORT_VERSION_CHANGED",
        expectedVersion: 3,
      });
    } finally {
      writer.connection.close();
      database.connection.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
