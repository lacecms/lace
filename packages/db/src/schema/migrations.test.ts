import { strict as assert } from "node:assert";
import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import { checkedInMigrations } from "./migrations.js";
import { readInvitationPage, readManagedUserPage } from "../security/account-pages.js";

test("checked-in migration inventory matches the Drizzle journal", async () => {
  const journal: { entries: { when: number; tag: string }[] } = JSON.parse(
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

const persistenceIndexes = [
  "content_entries_draft_snapshot_idx",
  "content_entries_published_snapshot_idx",
  "published_routes_snapshot_idx",
  "site_builds_published_snapshot_idx",
  "idempotency_records_expiry_idx",
  "setup_tokens_expiry_idx",
  "api_tokens_active_lookup_idx",
  "rate_limit_buckets_expiry_idx",
];

const migrationSql = (name: string) =>
  readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8");

test("the invitation index migrates existing rows and both account keysets use indexes", async () => {
  const database = new DatabaseSync(":memory:");
  try {
    const forwards = checkedInMigrations.findIndex(
      ({ name }) => name === "0003_invitation_pagination.sql",
    );
    for (const { name } of checkedInMigrations.slice(0, forwards))
      database.exec(await migrationSql(name));
    database.exec(`
      insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at)
      values ('a','a','a@lace.test',0,'viewer',0,1,1), ('b','b','b@lace.test',0,'viewer',1,1,1);
      insert into invitations (id,email,role,token_hash,invited_by,created_at,expires_at)
      values ('i-1','1@invite.test','viewer','hash1','a',1,2), ('i-2','2@invite.test','viewer','hash2','a',1,2);
    `);
    database.exec(await migrationSql(checkedInMigrations[forwards]!.name));
    const plans: string[] = [];
    const sql = (query: string, ...bindings: (string | number)[]) => {
      const plan = database.prepare(`explain query plan ${query}`).all(...bindings);
      plans.push(plan.map((row) => String(row.detail)).join("\n"));
      const result = database.prepare(query).all(...bindings);
      expect(result.length).toBeLessThanOrEqual(2);
      return result;
    };
    const users = await readManagedUserPage(sql, { limit: 1 });
    expect(users).toMatchObject({ total: 2, disabledCount: 1 });
    const userTail = await readManagedUserPage(sql, { after: users.nextCursor!, limit: 1 });
    expect(userTail.items.map((item) => item.id)).toEqual(["b"]);
    expect(plans.at(-1)).toMatch(/SEARCH user USING INDEX .+ \(email>\?\)/u);
    const invitations = await readInvitationPage(sql, { limit: 1 });
    const invitationTail = await readInvitationPage(sql, {
      after: invitations.nextCursor!,
      limit: 1,
    });
    expect(invitationTail.items.map((item) => item.id)).toEqual(["i-1"]);
    expect(plans.at(-1)).toMatch(/SEARCH i USING INDEX invitations_pending_order_idx/u);
  } finally {
    database.close();
  }
});

test("a seeded baseline database migrates to 0001 with each index once and rows unchanged", async () => {
  const [baseline, ...forward] = checkedInMigrations;
  assert(baseline);
  expect(forward.map((migration) => migration.name)).toContain("0001_persistence_hygiene.sql");
  const database = new DatabaseSync(":memory:");
  try {
    database.exec("pragma foreign_keys=on");
    database.exec(await migrationSql(baseline.name));
    database.exec(`
      insert into content_models (key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at) values ('posts','collection','Posts',1,'s','p',1,1);
      insert into content_entries (id,model_key,created_by,created_at,updated_at) values ('entry','posts','admin',1,1);
      insert into content_snapshots (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by) values ('draft','entry',2,'Draft','{}',1,1,1,'admin'), ('published','entry',1,'Published','{}',1,1,1,'admin');
      update content_entries set draft_snapshot_id='draft', published_snapshot_id='published' where id='entry';
      insert into published_routes (path,entry_id,snapshot_id,updated_at) values ('/posts/entry','entry','published',1);
      insert into site_builds (id,reason,status,target_version,published_snapshot_id,requested_by,requested_at) values ('build','publication','pending',1,'published','admin',1);
      insert into idempotency_records (scope,key,request_hash,response_json,created_at,expires_at) values ('publication:entry:admin','key','hash','{}',1,2);
      insert into api_tokens (id,name,token_prefix,token_hash,capabilities_json,created_at) values ('token','Token','lace_','digest','[]',1);
      insert into setup_tokens (token_hash,expires_at,created_at) values ('setup',2,1);
      insert into rate_limit_buckets (bucket_key,window_started_at,request_count,expires_at) values ('bucket',1,1,2);
    `);
    const tables = [
      "content_entries",
      "content_snapshots",
      "published_routes",
      "site_builds",
      "idempotency_records",
      "api_tokens",
      "setup_tokens",
      "rate_limit_buckets",
    ];
    const dump = () =>
      Object.fromEntries(
        tables.map((table) => [
          table,
          database.prepare(`select * from ${table} order by rowid`).all(),
        ]),
      );
    const before = dump();
    for (const migration of forward) database.exec(await migrationSql(migration.name));
    expect(dump()).toEqual(before);
    const names = database
      .prepare("select name from sqlite_master where type = 'index'")
      .all()
      .map((row) => row.name);
    for (const name of persistenceIndexes)
      expect(
        names.filter((candidate) => candidate === name),
        name,
      ).toHaveLength(1);
    const sql = database
      .prepare("select sql from sqlite_master where name = 'api_tokens_active_lookup_idx'")
      .get()?.sql;
    assert(typeof sql === "string");
    expect(sql.toLowerCase()).toContain("revoked_at` is null");
    expect(database.prepare("pragma foreign_key_check").all()).toEqual([]);
  } finally {
    database.close();
  }
});

test("migration 0001 only creates indexes", async () => {
  const statements = (await migrationSql("0001_persistence_hygiene.sql"))
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
  expect(statements).toHaveLength(persistenceIndexes.length);
  for (const statement of statements) expect(statement).toMatch(/^CREATE INDEX /u);
});
