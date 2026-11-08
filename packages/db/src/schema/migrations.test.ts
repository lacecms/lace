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

test("internal-link migration preserves legacy JSON and only cascades outgoing references", async () => {
  for (const upgraded of [false, true]) {
    const database = new DatabaseSync(":memory:");
    try {
      // Follow the explicit Node rebuild procedure for preexisting migrations.
      for (const migration of checkedInMigrations.filter((item) => item.name < "0010"))
        database.exec(
          await readFile(new URL(`../../drizzle/${migration.name}`, import.meta.url), "utf8"),
        );
      database.exec("pragma foreign_keys=on");
      const legacy = '{"url":"/manual#anchor","text":"entry:ignored"}';
      if (upgraded) {
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
              "insert into content_snapshots (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by) values (?,?,1,?, ?,1,1,1,'admin')",
            )
            .run(`${id}-draft`, id, id, legacy);
          database
            .prepare("update content_entries set draft_snapshot_id=? where id=?")
            .run(`${id}-draft`, id);
        }
      }
      database.exec(
        await readFile(
          new URL("../../drizzle/0010_internal_url_links.sql", import.meta.url),
          "utf8",
        ),
      );
      expect(database.prepare("select * from content_link_state").all()).toEqual([
        { singleton_key: 1, revision: 0 },
      ]);
      expect(database.prepare("select * from content_entry_link_references").all()).toEqual([]);
      if (upgraded) {
        expect(
          database.prepare("select fields_json from content_snapshots order by id").all(),
        ).toEqual([{ fields_json: legacy }, { fields_json: legacy }]);
        database.exec(
          "insert into content_entry_link_references values ('source-draft','$fields','fields','/url','target',1)",
        );
        database.exec("delete from content_entries where id='target'");
        expect(
          database.prepare("select target_entry_id from content_entry_link_references").all(),
        ).toEqual([{ target_entry_id: "target" }]);
        database.exec("delete from content_entries where id='source'");
        expect(database.prepare("select * from content_entry_link_references").all()).toEqual([]);
      }
      expect(database.prepare("pragma foreign_key_check").all()).toEqual([]);
      expect(
        database
          .prepare("pragma index_list('content_snapshots')")
          .all()
          .some((item) => item.name === "content_snapshots_title_prefix_idx"),
      ).toBe(true);
    } finally {
      database.close();
    }
  }
});

test("public identity migration preserves fresh and populated SQLite state", async () => {
  for (const populated of [false, true]) {
    const db = new DatabaseSync(":memory:");
    try {
      for (const migration of checkedInMigrations.filter((item) => item.name < "0011"))
        db.exec(
          await readFile(new URL(`../../drizzle/${migration.name}`, import.meta.url), "utf8"),
        );
      if (populated) {
        db.exec(
          "insert into content_models(key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at) values('posts','collection','Posts',1,'s','p',1,1)",
        );
        db.exec(
          "insert into content_entries(id,model_key,created_by,created_at,updated_at) values('entry','posts','admin',1,1)",
        );
        db.exec(
          "insert into content_snapshots(id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by) values('draft','entry',1,'Draft','{\"count\":0}',1,1,1,'admin')",
        );
        db.exec("update content_entries set draft_snapshot_id='draft'");
        db.exec("insert into published_state values(1,7,1)");
        db.exec(
          "insert into outbox_events(id,type,payload_json,available_at,created_at) values('event','site.build.requested','{}',1,1)",
        );
      }
      const tables = [
        "content_models",
        "content_entries",
        "content_snapshots",
        "published_routes",
        "published_state",
        "outbox_events",
      ];
      const before = tables.map((table) => db.prepare(`select * from ${table}`).all());
      db.exec(
        await readFile(
          new URL("../../drizzle/0011_public_projection_identity.sql", import.meta.url),
          "utf8",
        ),
      );
      for (const [index, table] of tables.entries()) {
        const rows = db
          .prepare(`select * from ${table}`)
          .all()
          .map((row) => {
            if (table === "content_models") {
              expect(row.public_projection_hash).toBeNull();
              expect(row.public_projection_source_hash).toBeNull();
              const {
                public_projection_hash: _publicHash,
                public_projection_source_hash: _publicSourceHash,
                ...old
              } = row;
              return old;
            }
            return row;
          });
        expect(rows).toEqual(before[index]);
      }
      expect(db.prepare("pragma foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  }
});
