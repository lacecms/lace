import assert from "node:assert/strict";
import { test } from "vitest";
import { configurationSyncSnapshotRewriteStatements } from "@lacecms/db";
import { openLocalD1 } from "./d1-test-harness.mjs";
test("bulk nested rewrites fit one guarded D1 batch and roll back failures", async () => {
  const { database: db, dispose } = await openLocalD1();
  const count = 251;
  const writes = [];
  for (let index = 0; index < count; index++) {
    const items = Array.from({ length: 100 }, (_, i) => ({
      image: "media-probe",
      title: `Image ${i}`,
    }));
    const row = {
      id: `s-${index}`,
      fields: {
        images: items,
        more: items.slice(0, 98),
        label: "unchanged",
        enabled: true,
        rating: 1.5,
      },
      references: Array.from({ length: 198 }, (_, i) => ({
        fieldPath: `/${i < 100 ? "images" : "more"}/${i % 100}/image`,
        mediaId: "media-probe",
      })),
    };
    writes.push(row);
  }
  const guard = "exists (select 1 from mutation_guards where token = 'probe')";
  function statements(expectedVersion, fail = false) {
    const sql = [
      db
        .prepare(
          "insert into mutation_guards (token, created_at) select 'probe', 1 where (select version from published_state where singleton_key=1)=?",
        )
        .bind(expectedVersion),
    ];
    for (const [index, statement] of configurationSyncSnapshotRewriteStatements(
      writes,
      "probe",
    ).entries()) {
      sql.push(db.prepare(`${statement.sql} and ${guard}`).bind(...statement.params));
      if (fail && index === 1)
        sql.push(db.prepare("insert into mutation_guards(token,created_at) values(null,1)"));
    }
    sql.push(
      db.prepare(`update published_state set version=version+1 where singleton_key=1 and ${guard}`),
    );
    sql.push(db.prepare("delete from mutation_guards where token='probe'"));
    return sql;
  }
  try {
    await db
      .prepare(
        "insert into content_models(key,kind,label,config_version,structure_hash,projection_hash,created_at,updated_at) values('probe','collection','Probe',1,'a','a',1,1)",
      )
      .run();
    await db
      .prepare(
        "insert into media(id,storage_key,filename,mime_type,size,metadata_json,status,created_by,created_at,updated_at) values('media-probe','media-probe','probe','image/png',1,'{}','active','probe',1,1)",
      )
      .run();
    for (let start = 0; start < count; start += 8) {
      const seed = [];
      for (let i = start; i < Math.min(start + 8, count); i++) {
        seed.push(
          db
            .prepare(
              "insert into content_entries(id,model_key,created_by,created_at,updated_at) values(?,'probe','probe',1,1)",
            )
            .bind(`e-${i}`),
        );
        seed.push(
          db
            .prepare(
              "insert into content_snapshots(id,entry_id,revision,title,fields_json,seo_json,schema_version,created_at,updated_at,updated_by) values(?,?,7,'Probe','{}','{\"image\":\"media-probe\"}',1,1,1,'probe')",
            )
            .bind(`s-${i}`, `e-${i}`),
        );
        seed.push(
          db
            .prepare(
              "insert into content_blocks(snapshot_id,block_key,block_type,position,schema_version,data_json,created_at,updated_at) values(?,'block-kept','image',1,1,'{\"image\":\"media-probe\"}',1,1)",
            )
            .bind(`s-${i}`),
        );
        seed.push(
          db
            .prepare("update content_entries set draft_snapshot_id=? where id=?")
            .bind(`s-${i}`, `e-${i}`),
        );
        seed.push(
          db
            .prepare(
              "insert into content_media_references values(?,'$seo','image','media-probe',1)",
            )
            .bind(`s-${i}`),
        );
        seed.push(
          db
            .prepare(
              "insert into content_media_references values(?,'block-kept','image','media-probe',1)",
            )
            .bind(`s-${i}`),
        );
      }
      await db.batch(seed);
    }
    await db
      .prepare(
        "insert or ignore into published_state(singleton_key,version,updated_at) values(1,0,1)",
      )
      .run();
    const version = await db
      .prepare("select version from published_state where singleton_key=1")
      .first("version");
    const state = async () =>
      JSON.stringify(
        await db
          .prepare(
            "select (select count(*) from content_media_references) refs,(select sum(length(fields_json)) from content_snapshots) jsonBytes,(select version from published_state where singleton_key=1) version,(select count(*) from mutation_guards) guards",
          )
          .first(),
      );
    const initial = await state();
    const stale = await db.batch(statements(version + 1));
    assert.equal(stale[0].meta.changes, 0);
    assert.equal(await state(), initial);
    await assert.rejects(() => db.batch(statements(version, true)));
    assert.equal(await state(), initial);
    const sql = statements(version);
    assert.ok(sql.length <= 15);
    const result = await db.batch(sql);
    assert.equal(result[0].meta.changes, 1);
    const { results: snapshots } = await db
      .prepare(
        "select id,fields_json,revision,updated_by,updated_at from content_snapshots order by id",
      )
      .all();
    for (const s of snapshots) {
      assert.deepEqual(JSON.parse(s.fields_json), writes.find((w) => w.id === s.id).fields);
      assert.equal(s.revision, 7);
      assert.equal(s.updated_by, "probe");
      assert.equal(s.updated_at, 1);
    }
    const refs = await db
      .prepare(
        "select source_key,count(*) n from content_media_references group by source_key order by source_key",
      )
      .all();
    assert.deepEqual(refs.results, [
      { source_key: "$fields", n: count * 198 },
      { source_key: "$seo", n: count },
      { source_key: "block-kept", n: count },
    ]);
    assert.equal(
      await db
        .prepare("select version from published_state where singleton_key=1")
        .first("version"),
      version + 1,
    );
    const completed = await state();
    await db.batch(statements(version));
    assert.equal(await state(), completed);
    assert.ok(configurationSyncSnapshotRewriteStatements(writes, "probe").length > 3);
  } finally {
    await dispose();
  }
}, 30_000);

test("D1 nested final guard rejects reference changes after its last reread", async () => {
  const { defineConfig, defineCollection } = await import("@lacecms/config");
  const { field } = await import("@lacecms/content");
  const {
    prepareConfigurationSynchronization,
    applyPreparedConfigurationSynchronization,
    contentModelRoute,
  } = await import("@lacecms/application");
  const { D1ContentRepository } = await import("../dist/index.js");
  const { database, dispose } = await openLocalD1();
  let mutate = false;
  const binding = {
    prepare: (sql) => database.prepare(sql),
    async batch(statements) {
      if (mutate) {
        mutate = false;
        await database
          .prepare("insert into content_media_references values('s','$fields','foreign','m',2)")
          .run();
      }
      return database.batch(statements);
    },
  };
  const config = (version) =>
    defineConfig({
      blocks: [],
      content: [
        defineCollection({
          key: "posts",
          route: "/blog/:slug",
          version,
          blocks: [],
          fields: {
            profile: field.group({
              fields:
                version === 1
                  ? { name: field.text() }
                  : { title: field.text({ renamedFrom: "name" }) },
            }),
          },
        }),
      ],
    });
  const old = await config(1);
  const next = await config(2);
  const repository = new D1ContentRepository(binding, () =>
    contentModelRoute(old.runtime.content[0]),
  );
  let id = 0;
  const apply = async (configuration, prepared) =>
    applyPreparedConfigurationSynchronization({
      models: configuration.runtime.content,
      target: repository,
      prepared:
        prepared ??
        (await prepareConfigurationSynchronization({
          models: configuration.runtime.content,
          state: repository,
        })),
      ids: { next: () => `guard-${++id}` },
      clock: { now: () => 5 },
    });
  try {
    await apply(old);
    await database
      .prepare(
        "insert into media(id,storage_key,filename,mime_type,size,metadata_json,status,created_by,created_at,updated_at) values('m','m','m','image/png',1,'{}','active','editor',1,1)",
      )
      .run();
    await database
      .prepare(
        "insert into content_entries(id,model_key,created_by,created_at,updated_at) values('e','posts','editor',1,1)",
      )
      .run();
    await database
      .prepare(
        "insert into content_snapshots(id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by) values('s','e',1,'Nested',?,1,1,1,'editor')",
      )
      .bind(JSON.stringify({ profile: { name: "Keep" } }))
      .run();
    await database.prepare("update content_entries set draft_snapshot_id='s' where id='e'").run();
    const prepared = await prepareConfigurationSynchronization({
      models: next.runtime.content,
      state: repository,
    });
    const before = await database.prepare("select version from published_state").first();
    const events = await database.prepare("select count(*) n from outbox_events").first();
    mutate = true;
    await assert.rejects(() => apply(next, prepared), /stale/);
    assert.equal(
      (await database.prepare("select config_version from content_models").first()).config_version,
      1,
    );
    assert.deepEqual(
      JSON.parse(
        (await database.prepare("select fields_json from content_snapshots").first()).fields_json,
      ),
      { profile: { name: "Keep" } },
    );
    assert.deepEqual(await database.prepare("select version from published_state").first(), before);
    assert.deepEqual(
      await database.prepare("select count(*) n from outbox_events").first(),
      events,
    );
    assert.equal((await database.prepare("select count(*) n from mutation_guards").first()).n, 0);
    await apply(next);
    assert.deepEqual(
      JSON.parse(
        (await database.prepare("select fields_json from content_snapshots").first()).fields_json,
      ),
      { profile: { title: "Keep" } },
    );
  } finally {
    await dispose();
  }
});
