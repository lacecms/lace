import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { expect, test } from "vitest";
import { migrationStatements } from "./d1-test-harness.mjs";

const OUTCOMES = "0003_site_build_outcomes.sql";
const ACCOUNT_TOKENS = "0004_account_tokens.sql";
const MODEL_STRUCTURE = "0005_content_model_structure.sql";

test("site-build outcome migration reclassifies unproven D1 hook outcomes as accepted", async () => {
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
    const apply = async (statements) =>
      database.batch(statements.map((statement) => database.prepare(statement)));
    await apply(await migrationStatements((file) => file < OUTCOMES));
    const insert = database.prepare(
      "insert into site_builds (id, reason, status, target_version, provider_build_id, requested_by, requested_at, started_at, completed_at, error) values (?, 'publication', ?, 1, ?, 'admin', 10, ?, ?, ?)",
    );
    await database.batch([
      insert.bind("hook-no-id", "succeeded", null, 11, 11, null),
      insert.bind("hook-with-id", "running", "dep-1", 11, null, null),
      insert.bind("tracked", "succeeded", "dep-2", 11, 15, null),
      insert.bind("failed", "failed", null, 11, 12, "provider_failed"),
      insert.bind("queued", "pending", null, null, null, "trigger_unavailable"),
    ]);
    await apply(await migrationStatements((file) => file === OUTCOMES));
    const { results } = await database
      .prepare(
        "select id, status, provider_build_id, started_at, completed_at, error from site_builds order by id",
      )
      .all();
    expect(results).toEqual([
      {
        id: "failed",
        status: "failed",
        provider_build_id: null,
        started_at: 11,
        completed_at: 12,
        error: "provider_failed",
      },
      {
        id: "hook-no-id",
        status: "accepted",
        provider_build_id: null,
        started_at: 11,
        completed_at: 11,
        error: null,
      },
      {
        id: "hook-with-id",
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
      {
        id: "tracked",
        status: "succeeded",
        provider_build_id: "dep-2",
        started_at: 11,
        completed_at: 15,
        error: null,
      },
    ]);
    await expect(
      database.prepare("update site_builds set status = 'deployed' where id = 'failed'").run(),
    ).rejects.toThrow(/CHECK constraint/u);
  } finally {
    await miniflare.dispose();
  }
});

test("account-token migration applies additively and allows one active invitation per email", async () => {
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
    const apply = async (statements) =>
      database.batch(statements.map((statement) => database.prepare(statement)));
    await apply(await migrationStatements((file) => file < ACCOUNT_TOKENS));
    await database
      .prepare(
        "insert into user (id, name, email, email_verified, role, disabled, created_at, updated_at) values ('u1', 'Admin', 'admin@example.com', 0, 'admin', 0, 1, 1)",
      )
      .run();
    await apply(await migrationStatements((file) => file === ACCOUNT_TOKENS));
    expect(await database.prepare("select email from user").all()).toMatchObject({
      results: [{ email: "admin@example.com" }],
    });
    const invite = database.prepare(
      "insert into invitations (id, email, role, token_hash, invited_by, created_at, expires_at, accepted_at, revoked_at) values (?, 'new@example.com', ?, ?, 'u1', 1, 2, ?, ?)",
    );
    await invite.bind("i1", "editor", "h1", null, null).run();
    await invite.bind("i0", "editor", "h0", 5, null).run();
    await invite.bind("i9", "viewer", "h9", null, 5).run();
    await expect(invite.bind("i2", "viewer", "h2", null, null).run()).rejects.toThrow(
      /UNIQUE constraint/u,
    );
    await expect(invite.bind("i3", "owner", "h3", null, 5).run()).rejects.toThrow(
      /CHECK constraint/u,
    );
    await database
      .prepare(
        "insert into password_reset_tokens (token_hash, user_id, created_at, expires_at) values ('r1', 'u1', 1, 2)",
      )
      .run();
    await database.prepare("delete from user where id = 'u1'").run();
    expect(
      (await database.prepare("select count(*) as n from password_reset_tokens").first()).n,
    ).toBe(0);
  } finally {
    await miniflare.dispose();
  }
});

test("model-structure migration adds empty baselines and keeps content", async () => {
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
    const apply = async (statements) =>
      database.batch(statements.map((statement) => database.prepare(statement)));
    await apply(await migrationStatements((file) => file < MODEL_STRUCTURE));
    await database.batch([
      database.prepare(
        "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('posts', 'collection', 'Posts', 1, 's1', 'p1', 1, 1)",
      ),
      database.prepare(
        "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('e1', 'posts', 'admin', 1, 1)",
      ),
    ]);
    await apply(await migrationStatements((file) => file === MODEL_STRUCTURE));
    expect(
      await database
        .prepare(
          "select m.key, m.structure_hash, m.structure_json, m.structure_json_hash, count(e.id) as entries from content_models m join content_entries e on e.model_key = m.key group by m.key",
        )
        .first(),
    ).toEqual({
      entries: 1,
      key: "posts",
      structure_hash: "s1",
      structure_json: null,
      structure_json_hash: null,
    });
  } finally {
    await miniflare.dispose();
  }
});

test("media metadata migration adds empty constrained columns and keeps references", async () => {
  const MEDIA_METADATA = "0006_media_descriptive_metadata.sql";
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
    const apply = async (statements) =>
      database.batch(statements.map((statement) => database.prepare(statement)));
    await apply(await migrationStatements((file) => file < MEDIA_METADATA));
    await apply([
      "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('posts', 'collection', 'Posts', 1, 's1', 'p1', 1, 1)",
      "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('e1', 'posts', 'admin', 1, 1)",
      "insert into content_snapshots (id, entry_id, revision, title, fields_json, schema_version, created_at, updated_at, updated_by) values ('s1', 'e1', 1, 'Post', '{}', 1, 1, 1, 'admin')",
      "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values ('m1', 'media/m1', 'a.png', 'image/png', 1, '{}', 'active', 'admin', 1, 1)",
      "insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at) values ('s1', '$fields', 'cover', 'm1', 1)",
    ]);
    const statements = await migrationStatements((file) => file === MEDIA_METADATA);
    expect(statements.some((statement) => /create table|drop table/iu.test(statement))).toBe(false);
    await apply(statements);
    expect(
      await database
        .prepare(
          "select m.alt, m.caption, m.focal_x, m.focal_y, m.metadata_json, r.snapshot_id from media m join content_media_references r on r.media_id = m.id",
        )
        .first(),
    ).toEqual({
      alt: null,
      caption: null,
      focal_x: null,
      focal_y: null,
      metadata_json: "{}",
      snapshot_id: "s1",
    });
    await expect(
      database.prepare("update media set focal_y = 0.5 where id = 'm1'").run(),
    ).rejects.toThrow(/CHECK constraint/u);
    await expect(
      database.prepare("update media set alt = ? where id = 'm1'").bind("x".repeat(1001)).run(),
    ).rejects.toThrow(/CHECK constraint/u);
    await database
      .prepare("update media set caption = 'Hi', focal_x = 1, focal_y = 0 where id = 'm1'")
      .run();
  } finally {
    await miniflare.dispose();
  }
});

test("global-kind migration rebuilds content models of a populated database in one batch", async () => {
  const GLOBAL_KIND = "0007_content_model_global_kind.sql";
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
    const apply = async (statements) =>
      database.batch(statements.map((statement) => database.prepare(statement)));
    await apply(await migrationStatements((file) => file < GLOBAL_KIND));
    await apply([
      "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, structure_json, structure_json_hash, created_at, updated_at) values ('home', 'page', 'Home', 1, 's-home', 'p-home', '{}', 's-home', 1, 2)",
      "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('posts', 'collection', 'Posts', 2, 's-posts', 'p-posts', 1, 2)",
      "insert into content_entries (id, model_key, singleton_key, created_by, created_at, updated_at) values ('home', 'home', 1, 'admin', 1, 1)",
      "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('e1', 'posts', 'admin', 1, 1)",
      "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) values ('p1', 'e1', 1, 'post', 'Post', '{}', 2, 1, 1, 'admin')",
      "update content_entries set draft_snapshot_id = 'p1', published_snapshot_id = 'p1' where id = 'e1'",
      "insert into content_blocks (snapshot_id, block_key, block_type, position, schema_version, data_json, created_at, updated_at) values ('p1', 'b1', 'image', 1000, 2, '{}', 1, 1)",
      "insert into published_routes (path, entry_id, snapshot_id, updated_at) values ('/blog/post', 'e1', 'p1', 1)",
      "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values ('m1', 'media/m1', 'a.png', 'image/png', 1, '{}', 'active', 'admin', 1, 1)",
      "insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at) values ('p1', 'b1', 'image', 'm1', 1)",
    ]);
    const tables = [
      "content_models",
      "content_entries",
      "content_snapshots",
      "content_blocks",
      "published_routes",
      "content_media_references",
    ];
    const state = async () =>
      Object.fromEntries(
        await Promise.all(
          tables.map(async (table) => [
            table,
            (await database.prepare(`select * from ${table} order by 1, 2`).all()).results,
          ]),
        ),
      );
    const before = await state();
    const statements = await migrationStatements((file) => file === GLOBAL_KIND);
    expect(statements.some((statement) => /drop table `content_models`/iu.test(statement))).toBe(
      true,
    );
    await apply(statements);
    expect(await state()).toEqual(before);
    await database
      .prepare(
        "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('settings', 'global', 'Settings', 1, 's', 'p', 3, 3)",
      )
      .run();
    await expect(
      database
        .prepare(
          "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('bad', 'singleton', 'Bad', 1, 's', 'p', 3, 3)",
        )
        .run(),
    ).rejects.toThrow(/CHECK constraint/u);
    await expect(
      database.prepare("delete from content_models where key = 'posts'").run(),
    ).rejects.toThrow(/FOREIGN KEY/u);
    await expect(
      database
        .prepare(
          "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('e2', 'missing', 'admin', 1, 1)",
        )
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/u);
    await database.prepare("update content_models set key = 'articles' where key = 'posts'").run();
    expect(
      await database.prepare("select model_key from content_entries where id = 'e1'").first(),
    ).toEqual({ model_key: "articles" });
  } finally {
    await miniflare.dispose();
  }
});

test("SEO migration adds an empty nullable snapshot column and keeps content", async () => {
  const SNAPSHOT_SEO = "0008_content_snapshot_seo.sql";
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
    const apply = async (statements) =>
      database.batch(statements.map((statement) => database.prepare(statement)));
    await apply(await migrationStatements((file) => file < SNAPSHOT_SEO));
    await apply([
      "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('posts', 'collection', 'Posts', 1, 's', 'p', 1, 1)",
      "insert into content_entries (id, model_key, created_by, created_at, updated_at) values ('e1', 'posts', 'admin', 1, 1)",
      "insert into content_snapshots (id, entry_id, revision, slug, title, fields_json, schema_version, created_at, updated_at, updated_by) values ('p1', 'e1', 1, 'post', 'Post', '{}', 1, 1, 1, 'admin')",
      "update content_entries set draft_snapshot_id = 'p1', published_snapshot_id = 'p1' where id = 'e1'",
      "insert into published_routes (path, entry_id, snapshot_id, updated_at) values ('/blog/post', 'e1', 'p1', 1)",
      "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values ('m1', 'media/m1', 'a.png', 'image/png', 1, '{}', 'active', 'admin', 1, 1)",
      "insert into content_media_references (snapshot_id, source_key, field_path, media_id, created_at) values ('p1', '$fields', 'cover', 'm1', 1)",
    ]);
    const rows = async (sql) => (await database.prepare(sql).all()).results;
    const before = {
      references: await rows("select * from content_media_references"),
      routes: await rows("select * from published_routes"),
      snapshots: await rows("select * from content_snapshots"),
    };
    const statements = await migrationStatements((file) => file === SNAPSHOT_SEO);
    expect(statements.some((statement) => /create table|drop table/iu.test(statement))).toBe(false);
    await apply(statements);
    expect({
      references: await rows("select * from content_media_references"),
      routes: await rows("select * from published_routes"),
      snapshots: await rows("select * from content_snapshots"),
    }).toEqual({
      ...before,
      snapshots: before.snapshots.map((row) => ({ ...row, seo_json: null })),
    });
    await database
      .prepare("update content_snapshots set seo_json = ? where id = 'p1'")
      .bind('{"title":"Hello"}')
      .run();
    expect(await database.prepare("select seo_json from content_snapshots").first()).toEqual({
      seo_json: '{"title":"Hello"}',
    });
    await expect(
      database
        .prepare(
          "insert into content_snapshots (id, entry_id, revision, title, fields_json, seo_json, schema_version, created_at, updated_at, updated_by) values ('x1', 'missing', 1, 'X', '{}', null, 1, 1, 1, 'admin')",
        )
        .run(),
    ).rejects.toThrow(/FOREIGN KEY/u);
  } finally {
    await miniflare.dispose();
  }
});
