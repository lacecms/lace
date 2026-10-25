import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vitest";
import { migrateNodeDatabase, openNodeDatabase } from "../dist/index.js";

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, mkdirSync: vi.fn(actual.mkdirSync) };
});

test("explicit migration creates nested parents and preserves data on repeat", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-fresh-migrate-"));
  const path = join(root, "nested", "data", "lace.sqlite");
  try {
    const versions = migrateNodeDatabase(path);
    expect(versions.length).toBeGreaterThan(0);
    await writeFile(join(root, "nested", "data", "keep.txt"), "neighbour");
    const database = openNodeDatabase(path);
    try {
      database.connection
        .prepare(
          "insert into published_state (singleton_key, version, updated_at) values (1, 42, 0)",
        )
        .run();
    } finally {
      database.connection.close();
    }
    expect(migrateNodeDatabase(path)).toEqual(versions);
    const reopened = openNodeDatabase(path);
    try {
      expect(
        reopened.connection
          .prepare("select version from published_state where singleton_key = 1")
          .get(),
      ).toEqual({ version: 42 });
      expect(
        reopened.connection.prepare("select count(*) as count from __drizzle_migrations").get(),
      ).toEqual({ count: versions.length });
    } finally {
      reopened.connection.close();
    }
    expect(await readFile(join(root, "nested", "data", "keep.txt"), "utf8")).toBe("neighbour");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("memory migration never prepares directories", () => {
  vi.mocked(mkdirSync).mockClear();
  expect(migrateNodeDatabase(":memory:").length).toBeGreaterThan(0);
  expect(mkdirSync).not.toHaveBeenCalled();
});

test("blocked parent stops migration without changing existing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-blocked-migrate-"));
  const blocked = join(root, "blocked");
  try {
    await writeFile(blocked, "preserve me");
    expect(() => migrateNodeDatabase(join(blocked, "data/lace.sqlite"))).toThrow();
    expect(existsSync(join(blocked, "data/lace.sqlite"))).toBe(false);
    expect(await readFile(blocked, "utf8")).toBe("preserve me");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("parent created concurrently is accepted without replacement", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-race-migrate-"));
  const actual = await vi.importActual("node:fs");
  try {
    vi.mocked(mkdirSync).mockImplementationOnce((path, options) => {
      actual.mkdirSync(path, options);
      return actual.mkdirSync(path, options);
    });
    expect(migrateNodeDatabase(join(root, "nested/data/lace.sqlite")).length).toBeGreaterThan(0);
  } finally {
    vi.mocked(mkdirSync).mockImplementation(actual.mkdirSync);
    await rm(root, { recursive: true, force: true });
  }
});

test(
  "runtime executable resolves a fresh relative database from its working directory",
  { timeout: 30_000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "lace-relative-migrate-"));
    try {
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("../dist/migrate.js", import.meta.url))],
        {
          cwd: root,
          env: { ...process.env, LACE_DATABASE_PATH: "nested/data/lace.sqlite" },
          encoding: "utf8",
          // Bound the child separately, leaving time for assertions and cleanup.
          timeout: 25_000,
          killSignal: "SIGKILL",
        },
      );
      expect(result.error, result.error?.message ?? result.stderr).toBeUndefined();
      expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(result.stdout).length).toBeGreaterThan(0);
      expect(await readFile(join(root, "nested/data/lace.sqlite"))).toBeDefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test("site-build outcome migration keeps Node builder successes and accepts provider rows", async () => {
  const { cp } = await import("node:fs/promises");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const source = fileURLToPath(new URL("../../db/drizzle", import.meta.url));
  const root = await mkdtemp(join(tmpdir(), "lace-build-outcomes-"));
  const previous = join(root, "previous");
  const path = join(root, "lace.sqlite");
  try {
    await cp(source, previous, { recursive: true });
    await rm(join(previous, "0003_site_build_outcomes.sql"));
    const journalPath = join(previous, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8"));
    journal.entries = journal.entries.filter((entry) => entry.idx < 3);
    await writeFile(journalPath, JSON.stringify(journal));
    const database = openNodeDatabase(path);
    try {
      migrate(database.drizzle, { migrationsFolder: previous });
      const insert = database.connection.prepare(
        "insert into site_builds (id, reason, status, target_version, provider_build_id, requested_by, requested_at, started_at, completed_at, error) values (?, 'manual', ?, 1, ?, 'admin', 10, ?, ?, ?)",
      );
      insert.run("built", "succeeded", null, 11, 12, null);
      insert.run("failed", "failed", null, 11, 12, "build_failed");
      insert.run("queued", "pending", null, null, null, "trigger_unavailable");
      insert.run("hooked", "running", "dep-1", 11, null, null);
    } finally {
      database.connection.close();
    }
    migrateNodeDatabase(path);
    const migrated = openNodeDatabase(path);
    try {
      expect(
        migrated.connection
          .prepare(
            "select id, status, provider_build_id, started_at, completed_at, error from site_builds order by id",
          )
          .all(),
      ).toEqual([
        {
          id: "built",
          status: "succeeded",
          provider_build_id: null,
          started_at: 11,
          completed_at: 12,
          error: null,
        },
        {
          id: "failed",
          status: "failed",
          provider_build_id: null,
          started_at: 11,
          completed_at: 12,
          error: "build_failed",
        },
        {
          id: "hooked",
          status: "accepted",
          provider_build_id: "dep-1",
          started_at: 11,
          completed_at: 11,
          error: null,
        },
        {
          id: "queued",
          status: "pending",
          provider_build_id: null,
          started_at: null,
          completed_at: null,
          error: "trigger_unavailable",
        },
      ]);
      expect(() =>
        migrated.connection
          .prepare("update site_builds set status = 'deployed' where id = 'built'")
          .run(),
      ).toThrow(/CHECK constraint/u);
      for (const status of ["accepted", "cancelled", "unknown"])
        migrated.connection
          .prepare("update site_builds set status = ? where id = 'built'")
          .run(status);
      expect(
        migrated.connection
          .prepare(
            "select name from sqlite_master where type = 'index' and tbl_name = 'site_builds' order by name",
          )
          .all()
          .map((row) => row.name),
      ).toEqual(expect.arrayContaining(["site_builds_history_idx", "site_builds_tracking_idx"]));
    } finally {
      migrated.connection.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("account-token migration upgrades a 0003 database and allows one active invitation per email", async () => {
  const { cp } = await import("node:fs/promises");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const source = fileURLToPath(new URL("../../db/drizzle", import.meta.url));
  const root = await mkdtemp(join(tmpdir(), "lace-account-tokens-"));
  const previous = join(root, "previous");
  const path = join(root, "lace.sqlite");
  try {
    await cp(source, previous, { recursive: true });
    const journalPath = join(previous, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8"));
    journal.entries = journal.entries.filter((entry) => entry.idx < 4);
    await writeFile(journalPath, JSON.stringify(journal));
    const database = openNodeDatabase(path);
    try {
      migrate(database.drizzle, { migrationsFolder: previous });
      database.connection
        .prepare(
          "insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) values ('u1', 'Admin', 'admin@example.com', 0, 'admin', 0, 1, 1)",
        )
        .run();
    } finally {
      database.connection.close();
    }
    migrateNodeDatabase(path);
    const migrated = openNodeDatabase(path);
    try {
      expect(migrated.connection.prepare("select email from user").all()).toEqual([
        { email: "admin@example.com" },
      ]);
      const invite = migrated.connection.prepare(
        "insert into invitations (id, email, role, token_hash, invited_by, created_at, expires_at, accepted_at, revoked_at) values (?, 'new@example.com', ?, ?, 'u1', 1, 2, ?, ?)",
      );
      invite.run("i1", "editor", "h1", null, null);
      invite.run("i0", "editor", "h0", 5, null);
      invite.run("i9", "viewer", "h9", null, 5);
      expect(() => invite.run("i2", "viewer", "h2", null, null)).toThrow(/UNIQUE constraint/u);
      expect(() => invite.run("i3", "owner", "h3", null, 5)).toThrow(/CHECK constraint/u);
      migrated.connection
        .prepare(
          "insert into password_reset_tokens (token_hash, user_id, created_at, expires_at) values ('r1', 'u1', 1, 2)",
        )
        .run();
      migrated.connection.prepare("delete from user where id = 'u1'").run();
      expect(
        migrated.connection.prepare("select count(*) as n from password_reset_tokens").get().n,
      ).toBe(0);
    } finally {
      migrated.connection.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("media metadata migration upgrades a 0005 database with referenced media", async () => {
  const { cp } = await import("node:fs/promises");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const { checkedInMigrations, listAppliedMigrations } = await import("../dist/index.js");
  const source = fileURLToPath(new URL("../../db/drizzle", import.meta.url));
  const root = await mkdtemp(join(tmpdir(), "lace-media-metadata-"));
  const previous = join(root, "previous");
  const path = join(root, "lace.sqlite");
  try {
    await cp(source, previous, { recursive: true });
    const journalPath = join(previous, "meta", "_journal.json");
    const journal = JSON.parse(await readFile(journalPath, "utf8"));
    journal.entries = journal.entries.filter((entry) => entry.idx < 6);
    await writeFile(journalPath, JSON.stringify(journal));
    const database = openNodeDatabase(path);
    try {
      migrate(database.drizzle, { migrationsFolder: previous });
      for (const statement of [
        "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('posts', 'collection', 'Posts', 1, 's1', 'p1', 1, 1)",
        "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('e1', 'posts', 'admin', 1, 1)",
        "insert into content_snapshots (id, entry_id, revision, title, fields_json, schema_version, created_at, updated_at, updated_by) values ('s1', 'e1', 1, 'Post', '{}', 1, 1, 1, 'admin')",
        "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values ('m1', 'media/m1', 'a.png', 'image/png', 1, '{}', 'active', 'admin', 1, 1)",
        "insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at) values ('s1', '$fields', 'cover', 'm1', 1)",
      ]) {
        database.connection.prepare(statement).run();
      }
    } finally {
      database.connection.close();
    }
    migrateNodeDatabase(path);
    const migrated = openNodeDatabase(path);
    try {
      expect(
        migrated.connection
          .prepare("select alt, caption, focal_x, focal_y, metadata_json from media")
          .all(),
      ).toEqual([{ alt: null, caption: null, focal_x: null, focal_y: null, metadata_json: "{}" }]);
      expect(
        migrated.connection.prepare("select media_id from content_media_references").all(),
      ).toEqual([{ media_id: "m1" }]);
      const applied = listAppliedMigrations(migrated.connection);
      expect(applied).toHaveLength(checkedInMigrations.length);
      expect(() =>
        migrated.connection.prepare("update media set focal_x = 0.5 where id = 'm1'").run(),
      ).toThrow(/CHECK constraint/u);
      migrated.connection
        .prepare("update media set alt = 'Bike', focal_x = 0.5, focal_y = 0.5 where id = 'm1'")
        .run();
    } finally {
      migrated.connection.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function databaseAtMigration(root, before, seed) {
  const { cp } = await import("node:fs/promises");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const source = fileURLToPath(new URL("../../db/drizzle", import.meta.url));
  const previous = join(root, "previous");
  const path = join(root, "lace.sqlite");
  await cp(source, previous, { recursive: true });
  const journalPath = join(previous, "meta", "_journal.json");
  const journal = JSON.parse(await readFile(journalPath, "utf8"));
  journal.entries = journal.entries.filter((entry) => entry.idx < before);
  await writeFile(journalPath, JSON.stringify(journal));
  const database = openNodeDatabase(path);
  try {
    migrate(database.drizzle, { migrationsFolder: previous });
    seed(database.connection);
  } finally {
    database.connection.close();
  }
  return path;
}

const POPULATED_0006 = [
  "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, structure_json, structure_json_hash, created_at, updated_at) values ('home', 'page', 'Home', 1, 's-home', 'p-home', '{}', 's-home', 1, 2)",
  "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('posts', 'collection', 'Posts', 2, 's-posts', 'p-posts', 1, 2)",
  "insert into content_entries (id, model_key, singleton_key, created_by, created_at, updated_at) values ('home', 'home', 1, 'admin', 1, 1)",
  "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('e1', 'posts', 'admin', 1, 1)",
  "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) values ('d1', 'e1', 1, 'post', 'Post', '{}', 2, 1, 1, 'admin')",
  "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) values ('p1', 'e1', 1, 'post', 'Post', '{}', 2, 1, 1, 'admin')",
  "update content_entries set draft_snapshot_id = 'd1', published_snapshot_id = 'p1' where id = 'e1'",
  "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at) values ('p1', 'b1', 'image', 1000, 2, '{\"image\":\"m1\"}', 1, 1)",
  "insert into published_routes (path, entry_id, snapshot_id, updated_at) values ('/blog/post', 'e1', 'p1', 1)",
  "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values ('m1', 'media/m1', 'a.png', 'image/png', 1, '{}', 'active', 'admin', 1, 1)",
  "insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at) values ('p1', 'b1', 'image', 'm1', 1)",
];

const CONTENT_TABLES = [
  "content_models",
  "content_entries",
  "content_snapshots",
  "content_blocks",
  "published_routes",
  "content_media_references",
];

/**
 * Later migrations add `content_snapshots.seo_json` (0008) and the block
 * envelope (0009), plus nullable public identity (0011), with empty or default
 * values for existing rows.
 */
function withEmptySeo(tables) {
  return withDefaultEnvelope({
    ...tables,
    content_snapshots: tables.content_snapshots.map((row) => ({ ...row, seo_json: null })),
  });
}

function withDefaultEnvelope(tables) {
  return {
    ...tables,
    content_models: tables.content_models.map((row) => ({
      ...row,
      public_projection_hash: null,
      public_projection_source_hash: null,
    })),
    content_blocks: tables.content_blocks.map((row) => ({
      ...row,
      anchor: null,
      class_name: null,
      hidden: 0,
      settings_json: "{}",
    })),
  };
}

function snapshotTables(connection) {
  return Object.fromEntries(
    CONTENT_TABLES.map((table) => [
      table,
      connection.prepare(`select * from ${table} order by 1, 2`).all(),
    ]),
  );
}

test("global-kind migration rebuilds content models of a populated 0006 database", async () => {
  const { checkedInMigrations, listAppliedMigrations } = await import("../dist/index.js");
  const root = await mkdtemp(join(tmpdir(), "lace-global-kind-"));
  try {
    let before;
    const path = await databaseAtMigration(root, 7, (connection) => {
      for (const statement of POPULATED_0006) connection.prepare(statement).run();
      before = snapshotTables(connection);
    });
    migrateNodeDatabase(path);
    const migrated = openNodeDatabase(path);
    try {
      const connection = migrated.connection;
      expect(connection.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(listAppliedMigrations(connection)).toHaveLength(checkedInMigrations.length);
      expect(snapshotTables(connection)).toEqual(withEmptySeo(before));
      connection
        .prepare(
          "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('settings', 'global', 'Settings', 1, 's', 'p', 3, 3)",
        )
        .run();
      expect(() =>
        connection
          .prepare(
            "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('bad', 'singleton', 'Bad', 1, 's', 'p', 3, 3)",
          )
          .run(),
      ).toThrow(/CHECK constraint/u);
      expect(() =>
        connection.prepare("delete from content_models where key = 'posts'").run(),
      ).toThrow(/FOREIGN KEY/u);
      expect(() =>
        connection
          .prepare(
            "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('e2', 'missing', 'admin', 1, 1)",
          )
          .run(),
      ).toThrow(/FOREIGN KEY/u);
      connection.prepare("update content_models set key = 'articles' where key = 'posts'").run();
      expect(
        connection.prepare("select model_key from content_entries where id = 'e1'").get(),
      ).toEqual({ model_key: "articles" });
      expect(connection.pragma("foreign_key_check")).toEqual([]);
    } finally {
      migrated.connection.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("SEO migration adds an empty nullable column to a populated 0007 database", async () => {
  const { checkedInMigrations, listAppliedMigrations } = await import("../dist/index.js");
  const root = await mkdtemp(join(tmpdir(), "lace-snapshot-seo-"));
  try {
    let before;
    const path = await databaseAtMigration(root, 8, (connection) => {
      for (const statement of POPULATED_0006) connection.prepare(statement).run();
      before = snapshotTables(connection);
    });
    migrateNodeDatabase(path);
    const migrated = openNodeDatabase(path);
    try {
      const connection = migrated.connection;
      expect(listAppliedMigrations(connection)).toHaveLength(checkedInMigrations.length);
      expect(snapshotTables(connection)).toEqual(withEmptySeo(before));
      connection
        .prepare("update content_snapshots set seo_json = ? where id = 'd1'")
        .run('{"title":"Hello"}');
      expect(
        connection.prepare("select seo_json from content_snapshots where id = 'd1'").get(),
      ).toEqual({ seo_json: '{"title":"Hello"}' });
      expect(connection.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(connection.pragma("foreign_key_check")).toEqual([]);
    } finally {
      migrated.connection.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("block envelope migration adds default columns and the anchor index to a populated 0008 database", async () => {
  const { checkedInMigrations, listAppliedMigrations } = await import("../dist/index.js");
  const root = await mkdtemp(join(tmpdir(), "lace-block-envelope-"));
  try {
    let before;
    const path = await databaseAtMigration(root, 9, (connection) => {
      for (const statement of POPULATED_0006) connection.prepare(statement).run();
      before = snapshotTables(connection);
    });
    migrateNodeDatabase(path);
    const migrated = openNodeDatabase(path);
    try {
      const connection = migrated.connection;
      expect(listAppliedMigrations(connection)).toHaveLength(checkedInMigrations.length);
      expect(snapshotTables(connection)).toEqual(withDefaultEnvelope(before));
      const insert = connection.prepare(
        "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, anchor, hidden, created_at, updated_at) values (?, ?, 'image', 2000, 2, '{}', ?, ?, 1, 1)",
      );
      insert.run("p1", "b2", "pricing", 0);
      expect(() => insert.run("p1", "b3", "pricing", 0)).toThrow(/UNIQUE constraint/u);
      insert.run("d1", "b2", "pricing", 1);
      insert.run("p1", "b4", null, 0);
      insert.run("p1", "b5", null, 0);
      expect(() => insert.run("p1", "b6", null, 2)).toThrow(/CHECK constraint/u);
      expect(connection.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(connection.pragma("foreign_key_check")).toEqual([]);
    } finally {
      migrated.connection.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Node migration refuses to report success over a foreign-key violation", async () => {
  const root = await mkdtemp(join(tmpdir(), "lace-fk-violation-"));
  try {
    const path = await databaseAtMigration(root, 7, (connection) => {
      connection.pragma("foreign_keys = OFF");
      connection
        .prepare(
          "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('orphan', 'missing', 'admin', 1, 1)",
        )
        .run();
    });
    expect(() => migrateNodeDatabase(path)).toThrow(/foreign-key violation/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
