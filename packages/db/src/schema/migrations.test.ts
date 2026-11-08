// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { checkedInMigrations } from "./migrations.js";

test("checked-in migration inventory matches the Drizzle journal", async () => {
  const journal = JSON.parse(
    await readFile(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  expect(checkedInMigrations).toEqual(
    journal.entries.map((entry) => ({
      createdAt: entry.when,
      name: `${entry.tag}.sql`,
    })),
  );
});

test("baseline creates the seeded schema with carried indexes and link cascades", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    for (const migration of checkedInMigrations)
      database.exec(
        await readFile(new URL(`../../drizzle/${migration.name}`, import.meta.url), "utf8"),
      );
    database.exec("pragma foreign_keys=on");
    expect(database.prepare("select * from content_link_state").all()).toEqual([
      { singleton_key: 1, revision: 0 },
    ]);
    const indexes = database
      .prepare("select name from sqlite_master where type = 'index'")
      .all()
      .map((row) => row.name);
    for (const name of [
      "content_snapshots_title_prefix_idx",
      "setup_tokens_expiry_idx",
      "api_tokens_active_lookup_idx",
      "rate_limit_buckets_expiry_idx",
    ])
      expect(indexes).toContain(name);
    database.exec(
      "insert into content_models (key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at) values ('posts','collection','Posts',1,'s','p',1,1)",
    );
    for (const id of ["source", "target"]) {
      database
        .prepare(
          "insert into content_entries (id,model_key,created_by,created_at,updated_at) values (?,'posts','admin',1,1)",
        )
        .run(id);
      database
        .prepare(
          "insert into content_snapshots (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by) values (?,?,1,?,'{}',1,1,1,'admin')",
        )
        .run(`${id}-draft`, id, id);
    }
    database.exec(
      "insert into content_entry_link_references values ('source-draft','$fields','fields','/url','target',1)",
    );
    database.exec("delete from content_entries where id='target'");
    expect(
      database.prepare("select target_entry_id from content_entry_link_references").all(),
    ).toEqual([{ target_entry_id: "target" }]);
    database.exec("delete from content_entries where id='source'");
    expect(database.prepare("select * from content_entry_link_references").all()).toEqual([]);
    expect(database.prepare("pragma foreign_key_check").all()).toEqual([]);
  } finally {
    database.close();
  }
});
