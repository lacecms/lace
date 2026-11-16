import { checkedInMigrations } from "@lacecms/db";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { migrateNodeDatabase, openNodeDatabase } from "./connection.js";

test("Node migration backfills profiles and keeps them atomic with accounts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-profile-migration-"));
  const databasePath = join(directory, "lace.sqlite");
  const migrationsFolder = join(directory, "previous");
  const source = new URL("../../../db/drizzle/", import.meta.url);
  const journal = JSON.parse(await readFile(new URL("meta/_journal.json", source), "utf8")) as {
    entries: { tag: string }[];
  };

  try {
    await mkdir(join(migrationsFolder, "meta"), { recursive: true });
    journal.entries = journal.entries.filter(({ tag }) => tag < "0002_");
    await writeFile(join(migrationsFolder, "meta", "_journal.json"), JSON.stringify(journal));
    for (const { tag } of journal.entries)
      await copyFile(new URL(`${tag}.sql`, source), join(migrationsFolder, `${tag}.sql`));

    const previous = openNodeDatabase(databasePath);
    let before: unknown;
    const contentRows = ({ connection }: ReturnType<typeof openNodeDatabase>) =>
      [
        "content_entries",
        "content_snapshots",
        "media",
        "published_state",
        "site_builds",
        "outbox_events",
      ].map((table) => connection.prepare(`select * from ${table}`).all());
    try {
      migrate(previous.drizzle, { migrationsFolder });
      previous.connection.exec(`
        insert into user (id, name, email, created_at, updated_at) values ('editor', '   ', 'editor@lace.test', 1, 1);
        insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('posts', 'collection', 'Posts', 1, 's', 'p', 1, 1);
        insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('entry', 'posts', 'editor', 1, 1);
        insert into content_snapshots (id, entry_id, revision, title, fields_json, schema_version, updated_by, created_at, updated_at) values ('draft', 'entry', 1, 'Draft', '{}', 1, 'editor', 1, 1);
        update content_entries set draft_snapshot_id = 'draft';
        insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values ('asset', 'key', 'image.png', 'image/png', 1, '{}', 'active', 'editor', 1, 1);
        insert into published_state (singleton_key, version, updated_at) values (1, 4, 1);
        insert into site_builds (id, reason, status, target_version, requested_by, requested_at) values ('build', 'manual', 'pending', 4, 'editor', 1);
        insert into outbox_events (id, type, payload_json, available_at, created_at) values ('event', 'site.build.requested', '{}', 1, 1);
      `);
      before = contentRows(previous);
    } finally {
      previous.connection.close();
    }

    const installed = migrateNodeDatabase(databasePath);
    expect(installed.map(({ createdAt }) => createdAt)).toEqual(
      checkedInMigrations.map(({ createdAt }) => createdAt),
    );
    expect(migrateNodeDatabase(databasePath)).toEqual(installed);
    const upgraded = openNodeDatabase(databasePath);
    const { connection } = upgraded;
    try {
      const profiles = () =>
        connection.prepare("select * from content_actor_profiles order by actor_id").all();
      expect(profiles()).toEqual([{ actor_id: "editor", display_name: "   ", role: "viewer" }]);
      expect(() =>
        connection.prepare("update content_actor_profiles set role = 'owner'").run(),
      ).toThrow(/check/iu);
      connection.exec(`
        insert into user (id, name, email, role, created_at, updated_at) values ('admin', 'Admin', 'admin@lace.test', 'admin', 1, 1);
        update user set name = 'New Name', role = 'editor' where id = 'editor';
        update user set disabled = 1 where id = 'editor';
      `);
      const current = [
        { actor_id: "admin", display_name: "Admin", role: "admin" },
        { actor_id: "editor", display_name: "New Name", role: "editor" },
      ];
      expect(profiles()).toEqual(current);
      expect(() =>
        connection.transaction(() => {
          connection.exec(
            "update user set name = 'Rolled Back' where id = 'admin'; delete from user where id = 'editor'",
          );
          throw new Error("rollback");
        })(),
      ).toThrow("rollback");
      expect(profiles()).toEqual(current);
      connection.exec("update user set id = 'renamed' where id = 'editor'");
      expect(profiles()).toEqual([current[0], { ...current[1], actor_id: "renamed" }]);
      connection.exec("delete from user where id = 'renamed'");
      expect(profiles()).toEqual([current[0]]);
      expect(contentRows(upgraded)).toEqual(before);
      expect(connection.pragma("foreign_keys", { simple: true })).toBe(1);
      expect(connection.pragma("foreign_key_check")).toEqual([]);
    } finally {
      connection.close();
    }
  } finally {
    await rm(directory, { force: true, recursive: true });
  }
});
