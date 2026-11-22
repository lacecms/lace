import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { expect, test } from "vitest";
import { migrationStatements, openLocalCloudflare } from "./test-support/d1-test-harness.js";

test("entry-reference migration preserves populated D1 URL rows and public work", async () => {
  const { database, dispose } = await openLocalCloudflare({ migrate: false });
  try {
    const batch = (statements: string[]) =>
      database.batch(statements.map((sql) => database.prepare(sql)));
    const rows = async (sql: string) => (await database.prepare(sql).all()).results;
    await batch(await migrationStatements((name) => name < "0006_"));
    await batch([
      "insert into content_models (key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at) values ('posts','collection','Posts',1,'s','p',1,1)",
      "insert into content_entries (id,model_key,created_by,created_at,updated_at) values ('post','posts','admin',1,1)",
      "insert into content_snapshots (id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by) values ('draft','post',1,'Post','{}',1,1,1,'admin')",
      "update content_entries set draft_snapshot_id='draft' where id='post'",
      "insert into content_entry_link_references values ('draft','$fields','fields','/url','old-id',0)",
      "insert into published_state (singleton_key,version,updated_at) values (1,7,1)",
      "insert into outbox_events (id,type,payload_json,available_at,created_at) values ('event','site.build.requested','{}',1,1)",
    ]);
    const usages = "select rowid, * from content_entry_link_references";
    const [before] = await rows(usages);
    const publicState = await rows("select * from published_state");
    const outbox = await rows("select * from outbox_events");
    await batch(await migrationStatements((name) => name.startsWith("0006_")));
    expect(await rows(usages)).toEqual([{ ...before, purpose: "url" }]);
    expect(await rows("select * from published_state")).toEqual(publicState);
    expect(await rows("select * from outbox_events")).toEqual(outbox);
    await expect(
      batch(["update content_entry_link_references set purpose='other'"]),
    ).rejects.toThrow(/check/iu);
    expect(
      JSON.stringify(
        await rows(
          "explain query plan select target_entry_id from content_entry_link_references where snapshot_id='draft' and purpose='reference'",
        ),
      ),
    ).toContain("content_entry_link_references_outgoing_idx");
    expect(
      JSON.stringify(
        await rows(
          "explain query plan select snapshot_id from content_entry_link_references where target_entry_id='old-id' and purpose='url'",
        ),
      ),
    ).toContain("content_entry_link_references_target_idx");
    expect(await rows("pragma foreign_key_check")).toEqual([]);
  } finally {
    await dispose();
  }
});

test("the baseline migration creates the seeded, constrained schema in one D1 batch", async () => {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-09-01",
      d1Databases: ["DB"],
      modules: true,
      script: "export default { fetch() { return new Response(null, { status: 404 }); } };",
    }),
  );
  try {
    const database = await miniflare.getD1Database("DB");
    const statements = await migrationStatements();
    await database.batch(statements.map((statement) => database.prepare(statement)));
    const run = (sql: string, ...values: unknown[]) =>
      database
        .prepare(sql)
        .bind(...values)
        .run();
    const rows = async (sql: string) => (await database.prepare(sql).all()).results;

    expect(await rows("select * from content_link_state")).toEqual([
      { singleton_key: 1, revision: 0 },
    ]);
    const indexes = (await rows("select name from sqlite_master where type = 'index'")).map(
      (row: { name: unknown }) => row.name,
    );
    for (const name of [
      "setup_tokens_expiry_idx",
      "api_tokens_active_lookup_idx",
      "rate_limit_buckets_expiry_idx",
      "content_snapshots_title_prefix_idx",
    ])
      expect(indexes).toContain(name);

    await run(
      "insert into content_models (key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at) values ('settings','global','Settings',1,'s','p',1,1)",
    );
    await expect(
      run(
        "insert into content_models (key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at) values ('bad','unknown','Bad',1,'s','p',1,1)",
      ),
    ).rejects.toThrow(/check/iu);
    await run(
      "insert into user (id,name,email,email_verified,role,disabled,created_at,updated_at) values ('admin','Admin','admin@lace.test',1,'admin',0,1,1)",
    );
    expect(await rows("select * from content_actor_profiles")).toEqual([
      { actor_id: "admin", display_name: "Admin", role: "admin" },
    ]);
    const invite =
      "insert into invitations (id,email,role,token_hash,invited_by,created_at,expires_at) values (?, 'new@lace.test','editor',?, 'admin',1,10)";
    await run(invite, "i1", "digest-1");
    await expect(run(invite, "i2", "digest-2")).rejects.toThrow(/unique/iu);
    await run(
      "insert into media (id,storage_key,filename,mime_type,size,metadata_json,status,created_by,created_at,updated_at) values ('m','k','a.png','image/png',1,'{}','active','admin',1,1)",
    );
    await expect(run("update media set focal_x = 0.5 where id = 'm'")).rejects.toThrow(/check/iu);
    await expect(run("update media set sha256 = 'ABC' where id = 'm'")).rejects.toThrow(/check/iu);
    await expect(
      run("insert into media_tags (media_id, tag) values ('m', 'Bad Tag')"),
    ).rejects.toThrow(/check/iu);
    await expect(
      run(
        "insert into site_builds (id,reason,status,target_version,requested_by,requested_at) values ('b','manual','deployed',1,'admin',1)",
      ),
    ).rejects.toThrow(/check/iu);
    expect(await rows("pragma foreign_key_check")).toEqual([]);
  } finally {
    await miniflare.dispose();
  }
});

test("D1 upgrade and account batches maintain content actor profiles atomically", async () => {
  const { database, dispose } = await openLocalCloudflare({ migrate: false });
  try {
    const batch = (statements: string[]) =>
      database.batch(statements.map((sql) => database.prepare(sql)));
    const rows = async (sql: string) => (await database.prepare(sql).all()).results;
    await batch(await migrationStatements((name) => name < "0002_"));
    await batch([
      "insert into user (id, name, email, created_at, updated_at) values ('editor', '   ', 'editor@lace.test', 1, 1)",
      "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('posts', 'collection', 'Posts', 1, 's', 'p', 1, 1)",
      "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('entry', 'posts', 'editor', 1, 1)",
      "insert into content_snapshots (id, entry_id, revision, title, fields_json, schema_version, updated_by, created_at, updated_at) values ('draft', 'entry', 1, 'Draft', '{}', 1, 'editor', 1, 1)",
      "update content_entries set draft_snapshot_id = 'draft'",
      "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values ('asset', 'key', 'image.png', 'image/png', 1, '{}', 'active', 'editor', 1, 1)",
      "insert into published_state (singleton_key, version, updated_at) values (1, 4, 1)",
      "insert into site_builds (id, reason, status, target_version, requested_by, requested_at) values ('build', 'manual', 'pending', 4, 'editor', 1)",
      "insert into outbox_events (id, type, payload_json, available_at, created_at) values ('event', 'site.build.requested', '{}', 1, 1)",
    ]);
    const contentRows = () =>
      Promise.all(
        [
          "content_entries",
          "content_snapshots",
          "media",
          "published_state",
          "site_builds",
          "outbox_events",
        ].map((table) => rows(`select * from ${table}`)),
      );
    const before = await contentRows();
    await batch(await migrationStatements((name) => name === "0002_content_actor_profiles.sql"));
    const profiles = () => rows("select * from content_actor_profiles order by actor_id");
    expect(await profiles()).toEqual([{ actor_id: "editor", display_name: "   ", role: "viewer" }]);
    await batch([
      "insert into user (id, name, email, role, created_at, updated_at) values ('admin', 'Admin', 'admin@lace.test', 'admin', 1, 1)",
      "update user set name = 'New Name', role = 'editor' where id = 'editor'",
      "update user set disabled = 1 where id = 'editor'",
    ]);
    const current = [
      { actor_id: "admin", display_name: "Admin", role: "admin" },
      { actor_id: "editor", display_name: "New Name", role: "editor" },
    ];
    expect(await profiles()).toEqual(current);
    await expect(
      batch([
        "update user set name = 'Rolled Back' where id = 'admin'",
        "delete from user where id = 'editor'",
        "update content_actor_profiles set role = 'owner'",
      ]),
    ).rejects.toThrow(/check/iu);
    expect(await profiles()).toEqual(current);
    await batch(["update user set id = 'renamed' where id = 'editor'"]);
    expect(await profiles()).toEqual([current[0], { ...current[1], actor_id: "renamed" }]);
    await batch(["delete from user where id = 'renamed'"]);
    expect(await profiles()).toEqual([current[0]]);
    expect(await contentRows()).toEqual(before);
    expect(await rows("pragma foreign_key_check")).toEqual([]);
  } finally {
    await dispose();
  }
});

test("preview migration upgrades existing D1 rows and isolates credential and generation references", async () => {
  const { database, dispose } = await openLocalCloudflare({ migrate: false });
  try {
    const batch = (statements: string[]) =>
      database.batch(statements.map((sql) => database.prepare(sql)));
    const rows = async (sql: string) => (await database.prepare(sql).all()).results;
    await batch(await migrationStatements((name) => name < "0004_"));
    await batch([
      "insert into user (id,name,email,created_at,updated_at) values ('editor','Editor','editor@lace.test',1,1)",
      "insert into session (id,token,expires_at,created_at,updated_at,user_id) values ('s','old-auth-token',100,1,1,'editor')",
      "insert into media (id,storage_key,filename,mime_type,size,metadata_json,status,created_by,created_at,updated_at) values ('asset','key','image.png','image/png',1,'{}','active','editor',1,1)",
    ]);
    await batch(await migrationStatements((name) => name.startsWith("0004_")));
    expect(await rows("select token from session")).toEqual([{ token: "old-auth-token" }]);
    expect(await rows("select * from preview_generations")).toEqual([]);
    await batch([
      "insert into preview_generations (id,entry_id,model_key,revision,path,public_version,configuration,source_commit,executor,created_by,idempotency_key,state,created_at,overall_deadline) values ('g','entry','posts',1,'/post',1,'cfg','commit','runner','editor','key','preparing',1,100)",
      "insert into preview_current values ('entry','g')",
      "insert into preview_execution_slot values (1,'g')",
      "insert into preview_media_dependencies values ('g','asset',1)",
      "insert into preview_sessions values ('hash','s','https://preview.test',100)",
      "insert into preview_handoffs values ('h','nonce','code','https://admin.test','https://preview.test','/view/g','g','s',50,null)",
    ]);
    await batch(await migrationStatements((name) => name.startsWith("0005_")));
    expect(await rows("select singleton_key,epoch from preview_capture_state")).toEqual([
      { singleton_key: 1, epoch: 0 },
    ]);
    expect(await rows("select capture_epoch from preview_generations where id='g'")).toEqual([
      { capture_epoch: 0 },
    ]);
    await expect(batch(["insert into preview_current values ('other','g')"])).rejects.toThrow(
      /foreign key/iu,
    );
    await expect(batch(["insert into preview_execution_slot values (2,'g')"])).rejects.toThrow(
      /check/iu,
    );
    expect(
      await rows(
        "explain query plan select generation_id from preview_media_dependencies where media_id='asset'",
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          detail: expect.stringMatching(/SEARCH .*preview_media_dependency_lookup_idx/u),
        }),
      ]),
    );
    await batch(["delete from media where id='asset'", "delete from session where id='s'"]);
    expect(await rows("select * from preview_handoffs")).toEqual([]);
    expect(await rows("select * from preview_sessions")).toEqual([]);
    expect(await rows("select media_id from preview_media_dependencies")).toEqual([
      { media_id: "asset" },
    ]);
    expect(await rows("pragma foreign_key_check")).toEqual([]);
  } finally {
    await dispose();
  }
});
