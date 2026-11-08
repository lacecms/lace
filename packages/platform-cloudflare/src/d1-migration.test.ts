// @ts-nocheck
// TODO(rf2): Type legacy D1/Worker harnesses, binding fakes and recorded adapter calls.
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { expect, test } from "vitest";
import { migrationStatements } from "./test-support/d1-test-harness.js";

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
    const run = (sql, ...values) =>
      database
        .prepare(sql)
        .bind(...values)
        .run();
    const rows = async (sql) => (await database.prepare(sql).all()).results;

    expect(await rows("select * from content_link_state")).toEqual([
      { singleton_key: 1, revision: 0 },
    ]);
    const indexes = (await rows("select name from sqlite_master where type = 'index'")).map(
      (row) => row.name,
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
