// Inspect the stopped local database only. D1 is migrated by Wrangler through
// the packaged CLI; its SQLite backing file is opened read-only for comparison.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const digest = (value) => createHash("sha256").update(value).digest("hex");

async function databasePath(project, kind) {
  const root = join(project, ".lace/data");
  let file = join(root, "lace.sqlite");
  if (kind === "cloudflare") {
    const dir = join(root, "cloudflare/v3/d1/miniflare-D1DatabaseObject");
    const candidates = (await readdir(dir)).filter((name) => name.endsWith(".sqlite"));
    const matches = candidates.filter((name) => {
      const db = new DatabaseSync(join(dir, name), { readOnly: true });
      try {
        return db.prepare("select 1 from sqlite_master where name='d1_migrations'").get();
      } finally {
        db.close();
      }
    });
    assert.equal(matches.length, 1);
    file = join(dir, matches[0]);
  }
  return file;
}

// Seed a deferred publication while all dispatchers are stopped. Normal HTTP
// publication can already have consumed the outbox when a local Worker stops.
export async function seedPendingWork(project, kind) {
  const db = new DatabaseSync(await databasePath(project, kind));
  try {
    db.exec(`pragma foreign_keys=on;
      begin immediate;
      insert into site_builds (id,reason,status,target_version,published_snapshot_id,requested_by,requested_at)
      select 'upgrade-pending','publication','pending',s.version,e.published_snapshot_id,e.created_by,1
      from published_state s, content_entries e where e.published_snapshot_id is not null
      and not exists (select 1 from site_builds where status='pending') limit 1;
      insert into outbox_events (id,type,payload_json,available_at,created_at)
      select 'upgrade-event','site.build.requested','{}',4102444800000,1
      where not exists(select 1 from outbox_events where type='site.build.requested' and processed_at is null and locked_at is null);
      commit;`);
  } finally {
    db.close();
  }
}

export async function inspectCutover(project, kind) {
  const db = new DatabaseSync(await databasePath(project, kind), { readOnly: true });
  const rows = (sql) => db.prepare(sql).all();
  try {
    assert.deepEqual(rows("pragma foreign_key_check"), []);
    const node = kind === "node";
    const ledger = rows(
      node
        ? "select created_at,hash from __drizzle_migrations order by created_at"
        : "select id,name,applied_at from d1_migrations order by id",
    );
    const schema = rows(
      "select type,name,sql from sqlite_master where name not like 'sqlite_%' order by type,name",
    );
    const tables = [
      "user",
      "account",
      "content_actor_profiles",
      "api_tokens",
      "media",
      "content_entries",
      "content_snapshots",
      "content_blocks",
      "published_routes",
      "site_builds",
      "outbox_events",
      "published_state",
    ];
    const counts = {};
    const fingerprints = tables.map((table) => {
      const data = rows("select * from " + table + " order by rowid");
      counts[table] = data.length;
      return digest(JSON.stringify(data));
    });
    for (const name of tables) assert.ok(counts[name] > 0, "Empty cutover fixture: " + name);
    assert.ok(
      rows("select 1 from content_blocks where block_type='gallery' and schema_version=6").length,
    );
    assert.ok(
      rows("select 1 from content_entries where draft_snapshot_id <> published_snapshot_id").length,
    );
    assert.ok(
      rows("select 1 from account where provider_id='credential' and password is not null").length,
    );
    const links = rows(
      "select snapshot_id,source_key,area,field_path,target_entry_id,delivered,purpose from content_entry_link_references order by rowid",
    );
    assert.ok(links.length);
    assert.deepEqual(
      rows("select actor_id,display_name,role from content_actor_profiles order by actor_id"),
      rows("select id as actor_id,name as display_name,role from user order by id"),
    );
    assert.deepEqual([...new Set(links.map(({ purpose }) => purpose))].sort(), [
      "reference",
      "url",
    ]);
    return {
      ledger,
      state: digest(JSON.stringify([...fingerprints, links])),
      schema: digest(JSON.stringify(schema)),
    };
  } finally {
    db.close();
  }
}
