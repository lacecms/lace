import assert from "node:assert/strict";
import {
  applyPreparedConfigurationSynchronization,
  contentModelRoute,
  configurationSyncAdvancesPublicState,
  siteBuildEvent,
  prepareConfigurationSynchronization,
} from "@lacecms/application";
import type {
  ApplyConfigurationSynchronizationInput,
  ConfigurationSyncEntryMigration,
  ConfigurationSyncSnapshotMigration,
  ConfigurationSyncSnapshotRewrite,
  PreparedConfigurationSynchronization,
} from "@lacecms/application";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { field } from "@lacecms/content";
import { unixMilliseconds } from "@lacecms/domain";
import { test } from "vitest";
import { configurationSyncSnapshotRewriteStatements } from "@lacecms/db";
import { D1ContentRepository } from "./index.js";
import {
  D1_MAX_BATCH_STATEMENTS,
  D1_MAX_BOUND_PARAMETERS,
  D1_QUERY_BUDGET,
} from "./d1/database.js";
import type { D1Database } from "./d1/database.js";
import { countingD1, openLocalD1 } from "./test-support/d1-test-harness.js";

test("sidebar icon sync preserves snapshots and uses guarded public identity on local D1", async () => {
  const { database, dispose } = await openLocalD1();
  try {
    const make = async (icon?: string, label = "Home") =>
      (
        await defineConfig({
          content: [
            definePage({
              key: "home",
              label,
              path: "/",
              version: 1,
              ...(icon === undefined ? {} : { icon }),
            }),
          ],
        })
      ).runtime.content;
    const initial = await make();
    const repository = new D1ContentRepository(database, () => contentModelRoute(initial[0]!));
    let next = 0;
    const sync = async (models: typeof initial) =>
      applyPreparedConfigurationSynchronization({
        clock: { now: () => unixMilliseconds(10) },
        ids: { next: () => `icon-sync-${++next}` },
        models,
        target: repository,
        prepared: await prepareConfigurationSynchronization({ models, state: repository }),
      });
    await sync(initial);
    const readSnapshots = () =>
      database.prepare("select * from content_snapshots order by id").all();
    const snapshots = (await readSnapshots()).results;
    assert.equal(snapshots.length, 1);
    const version = await repository.publishedContentVersion();
    const buildVersions = async () =>
      (
        await database
          .prepare(
            "select json_extract(payload_json, '$.targetVersion') version from outbox_events where type = 'site.build.requested' and processed_at is null",
          )
          .all<{ version: number }>()
      ).results.map((row) => row.version);
    assert.deepEqual(await buildVersions(), [version]);

    const named = await make("house");
    const result = await sync(named);
    assert.equal(result.status, "applied");
    assert.equal(result.operations[0]?.action, "label-update");
    const stored = (await repository.readConfigurationSyncState())[0];
    assert.equal(stored?.version, 1);
    assert.equal(stored?.projectionHash, named[0]!.projectionHash);
    assert.equal(stored?.publicProjectionHash, named[0]!.publicProjectionHash);
    assert.equal(stored?.publicProjectionSourceHash, named[0]!.projectionHash);
    assert.equal((await sync(named)).status, "noop");
    assert.equal(await repository.publishedContentVersion(), version);
    assert.deepEqual(await buildVersions(), [version]);

    await sync(await make("🧭", "Start"));
    assert.equal(await repository.publishedContentVersion(), version + 1);
    assert.deepEqual(await buildVersions(), [version + 1]);
    await database.prepare("update content_models set public_projection_source_hash = null").run();
    await sync(await make(undefined, "Start"));
    assert.equal(await repository.publishedContentVersion(), version + 2);
    assert.deepEqual(await buildVersions(), [version + 2]);
    assert.deepEqual((await readSnapshots()).results, snapshots);
  } finally {
    await dispose();
  }
});

test("bulk nested rewrites fit one guarded D1 batch and roll back failures", async () => {
  const { database: db, dispose } = await openLocalD1();
  const count = 251;
  const writes: ConfigurationSyncSnapshotRewrite[] = [];
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
  function statements(expectedVersion: number, fail = false) {
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
    const readVersion = () =>
      db
        .prepare("select version from published_state where singleton_key=1")
        .first<{ version: number }>();
    const versionRow = await readVersion();
    assert.ok(versionRow);
    const { version } = versionRow;
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
    assert.equal(stale[0]?.meta.changes, 0);
    assert.equal(await state(), initial);
    await assert.rejects(() => db.batch(statements(version, true)));
    assert.equal(await state(), initial);
    const sql = statements(version);
    assert.ok(sql.length <= 15);
    const result = await db.batch(sql);
    assert.equal(result[0]?.meta.changes, 1);
    const { results: snapshots } = await db
      .prepare(
        "select id,fields_json,revision,updated_by,updated_at from content_snapshots order by id",
      )
      .all<{
        id: string;
        fields_json: string;
        revision: number;
        updated_by: string;
        updated_at: number;
      }>();
    for (const s of snapshots) {
      assert.deepEqual(JSON.parse(s.fields_json), writes.find((w) => w.id === s.id)?.fields);
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
    assert.deepEqual(await readVersion(), { version: version + 1 });
    const completed = await state();
    await db.batch(statements(version));
    assert.equal(await state(), completed);
    assert.ok(configurationSyncSnapshotRewriteStatements(writes, "probe").length > 3);
  } finally {
    await dispose();
  }
}, 30_000);

test("D1 nested final guard rejects reference changes after its last reread", async () => {
  const { database, dispose } = await openLocalD1();
  let mutate = false;
  const binding: D1Database = {
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
  const config = (version: number) =>
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
  let wakeups = 0;
  const repository = new D1ContentRepository(
    binding,
    () => contentModelRoute(old.runtime.content[0]!),
    {
      onOutboxWork: () => wakeups++,
    },
  );
  let id = 0;
  const apply = async (
    configuration: Awaited<ReturnType<typeof config>>,
    prepared?: PreparedConfigurationSynchronization,
  ) =>
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
      clock: { now: () => unixMilliseconds(5) },
    });
  try {
    await apply(old);
    assert.equal(wakeups, 1);
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
    await assert.rejects(() => apply(next, prepared), { code: "CONFIGURATION_SYNC_STALE" });
    assert.equal(wakeups, 1);
    assert.equal(
      (await database.prepare("select config_version from content_models").first())?.config_version,
      1,
    );
    const fields = () =>
      database
        .prepare("select fields_json from content_snapshots")
        .first<{ fields_json: string }>();
    assert.deepEqual(JSON.parse((await fields())?.fields_json ?? "null"), {
      profile: { name: "Keep" },
    });
    assert.deepEqual(await database.prepare("select version from published_state").first(), before);
    assert.deepEqual(
      await database.prepare("select count(*) n from outbox_events").first(),
      events,
    );
    assert.deepEqual(await database.prepare("select count(*) n from mutation_guards").first(), {
      n: 0,
    });
    await apply(next);
    assert.equal(wakeups, 2);
    assert.deepEqual(JSON.parse((await fields())?.fields_json ?? "null"), {
      profile: { title: "Keep" },
    });
  } finally {
    await dispose();
  }
});

async function reviewFinalSync(
  repository: D1ContentRepository,
  models: ApplyConfigurationSynchronizationInput["models"],
): Promise<ApplyConfigurationSynchronizationInput> {
  const { plan, storedModels, evidence } = await prepareConfigurationSynchronization({
    models,
    state: repository,
  });
  const appliedAt = unixMilliseconds(5);
  return {
    appliedAt,
    events: configurationSyncAdvancesPublicState(plan)
      ? [
          siteBuildEvent({
            reason: "configuration_sync",
            requestedAt: appliedAt,
            requestedBy: "system:content-sync",
            publishedSnapshotId: null,
          }),
        ]
      : [],
    evidence,
    expectedStoredModels: storedModels,
    models,
    plan,
    singletonEntries: [],
  };
}

test("final sync keeps the 40-statement batch boundary including executor overhead", async () => {
  const { database, dispose } = await openLocalD1();
  const { binding, stats } = countingD1(database);
  const { runtime } = await defineConfig({
    content: Array.from({ length: 35 }, (_, index) =>
      defineCollection({ key: `posts-${index}`, version: 1, blocks: [], fields: {} }),
    ),
  });
  const repository = new D1ContentRepository(binding, () => undefined);
  try {
    const tooMany = await reviewFinalSync(repository, runtime.content);
    await assert.rejects(() => repository.applyConfigurationSynchronization(tooMany), {
      code: "CONTENT_INVALID_STATE",
      message: "D1 mutation exceeds its statement budget.",
    });
    assert.equal(stats.batches, 0);
    assert.deepEqual(await database.prepare("select count(*) n from content_models").first(), {
      n: 0,
    });
    const atLimit = await reviewFinalSync(repository, runtime.content.slice(1));
    const before = stats.queries;
    assert.deepEqual(await repository.applyConfigurationSynchronization(atLimit), {
      operations: atLimit.plan.operations,
      status: "applied",
      targetVersion: 1,
    });
    assert.equal(stats.batches, 1);
    assert.equal(stats.maxBatchStatements, D1_MAX_BATCH_STATEMENTS);
    assert.equal(stats.maxParameters, 13);
    assert.ok(stats.maxParameters <= D1_MAX_BOUND_PARAMETERS);
    assert.equal(stats.queries - before, 42);
    assert.ok(stats.queries - before <= D1_QUERY_BUDGET);
    assert.deepEqual(await database.prepare("select count(*) n from mutation_guards").first(), {
      n: 0,
    });
  } finally {
    await dispose();
  }
});

test("a link lost after D1 preflight rejects the final batch and late failures leave no outbox work", async () => {
  const { database, dispose } = await openLocalD1();
  const original = await defineConfig({
    content: [defineCollection({ key: "posts", route: "/blog/:slug", version: 1 })],
  });
  const changed = await defineConfig({
    content: [
      defineCollection({ key: "posts", label: "Articles", route: "/blog/:slug", version: 1 }),
    ],
  });
  let dropRoute = false;
  let failLate = false;
  let wakeups = 0;
  const binding: D1Database = {
    prepare: (sql) => database.prepare(sql),
    async batch(statements) {
      if (dropRoute) {
        dropRoute = false;
        await database.prepare("delete from published_routes where entry_id='entry'").run();
      }
      return database.batch(statements);
    },
  };
  const repository = new D1ContentRepository(
    binding,
    () => contentModelRoute(original.runtime.content[0]!),
    {
      beforeMutation(checkpoint) {
        if (failLate && checkpoint === "build-outbox") throw new Error("late failure");
      },
      onOutboxWork: () => wakeups++,
    },
  );
  try {
    await repository.applyConfigurationSynchronization(
      await reviewFinalSync(repository, original.runtime.content),
    );
    assert.equal(wakeups, 1);
    const route =
      "insert into published_routes(path,entry_id,snapshot_id,updated_at) values('/blog/post','entry','live',1)";
    await database.batch([
      database.prepare(
        "insert into content_entries(id,model_key,created_by,created_at,updated_at) values('entry','posts','editor',1,1)",
      ),
      database.prepare(
        "insert into content_snapshots(id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by) values('live','entry',1,'Post','{}',1,1,1,'editor')",
      ),
      database.prepare("update content_entries set published_snapshot_id='live' where id='entry'"),
      database.prepare(route),
    ]);
    const input: ApplyConfigurationSynchronizationInput = {
      ...(await reviewFinalSync(repository, changed.runtime.content)),
      linkRewrites: [
        {
          snapshotId: "live",
          references: [
            {
              area: "fields",
              delivered: true,
              pointer: "/link",
              sourceKey: "$fields",
              targetId: "entry",
            },
          ],
        },
      ],
    };
    const state = () =>
      database
        .prepare(`select (select label from content_models) label,
      (select version from published_state) version,
      (select revision from content_link_state) graph,
      (select count(*) from content_entry_link_references) links,
      (select count(*) from mutation_guards) guards,
      (select payload_json from outbox_events) outbox`)
        .first();
    const before = await state();
    dropRoute = true;
    await assert.rejects(() => repository.applyConfigurationSynchronization(input), {
      code: "CONTENT_INVALID_STATE",
      message: "Schema synchronization would introduce an unavailable internal link.",
    });
    assert.deepEqual(await state(), before);
    assert.equal(wakeups, 1);
    await database.prepare(route).run();
    failLate = true;
    await assert.rejects(() => repository.applyConfigurationSynchronization(input), {
      code: "CONTENT_INVALID_STATE",
    });
    assert.deepEqual(await state(), before);
    assert.equal(wakeups, 1);
    failLate = false;
    assert.deepEqual(await repository.applyConfigurationSynchronization(input), {
      operations: input.plan.operations,
      status: "applied",
      targetVersion: 2,
    });
    assert.equal(wakeups, 2);
    assert.deepEqual(
      await database
        .prepare("select field_path,delivered from content_entry_link_references")
        .first(),
      {
        field_path: "/link",
        delivered: 1,
      },
    );
    assert.deepEqual(await database.prepare("select count(*) n from mutation_guards").first(), {
      n: 0,
    });
  } finally {
    await dispose();
  }
});

function migrationUnit(entryId: string, size: number): ConfigurationSyncEntryMigration {
  const snapshots = (["published", "draft"] as const).map(
    (state): ConfigurationSyncSnapshotMigration => {
      const snapshotId = `${entryId}-${state}`;
      const blocks = Array.from({ length: size }, (_, index) => ({
        key: `n${index}`,
        expectedSchemaVersion: 1,
        schemaVersion: 3,
        data: {},
        settings: {},
      }));
      return {
        state,
        snapshotId,
        blocks,
        expectedRevision: 1,
        revision: 2,
        references: blocks.map(({ key }) => ({
          sourceKey: key,
          fieldPath: "cover",
          mediaId: "media",
        })),
      };
    },
  );
  return { entryId, snapshots };
}

async function seedMigrationUnit(database: D1Database, unit: ConfigurationSyncEntryMigration) {
  const ids = JSON.stringify(unit.snapshots.map(({ snapshotId }) => snapshotId));
  await database.batch([
    database
      .prepare(
        "insert into content_entries(id,model_key,created_by,created_at,updated_at) values(?,'posts','editor',1,1)",
      )
      .bind(unit.entryId),
    database
      .prepare(`insert into content_snapshots(id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by)
      select value,?,1,'Post','{}',1,1,1,'editor' from json_each(?)`)
      .bind(unit.entryId, ids),
    database
      .prepare(`update content_entries set published_snapshot_id=?, draft_snapshot_id=? where id=?`)
      .bind(unit.snapshots[0]?.snapshotId, unit.snapshots[1]?.snapshotId, unit.entryId),
    database
      .prepare(`insert into content_blocks(snapshot_id,block_key,block_type,position,schema_version,data_json,created_at,updated_at)
      select s.value,b.value,'note',b.key+1,1,'{}',1,1 from json_each(?) s,json_each(?) b`)
      .bind(ids, JSON.stringify(unit.snapshots[0]?.blocks.map(({ key }) => key))),
  ]);
}

test("D1 packs small migration units and resumes a split large unit before one final request", async () => {
  const { database, dispose } = await openLocalD1();
  const { binding: counted, stats } = countingD1(database);
  const model = (version: number) =>
    defineConfig({ content: [defineCollection({ key: "posts", version })] });
  const original = await model(1);
  const changed = await model(2);
  const pending: string[] = [];
  const batches: { size: number; states: string[] }[] = [];
  let failDraft = false;
  let draftWrites = 0;
  let wakeups = 0;
  const binding: D1Database = {
    prepare: counted.prepare,
    batch(statements) {
      batches.push({ size: statements.length, states: pending.splice(0) });
      return counted.batch(statements);
    },
  };
  const repository = new D1ContentRepository(
    binding,
    () => contentModelRoute(original.runtime.content[0]!),
    {
      beforeMutation(checkpoint) {
        if (!checkpoint.startsWith("sync.migration.")) return;
        pending.push(checkpoint.replace("sync.migration.", ""));
        if (failDraft && checkpoint === "sync.migration.draft" && ++draftWrites === 3)
          throw new Error("interrupt the oversized unit before its draft commits");
      },
      onOutboxWork: () => wakeups++,
    },
  );
  try {
    await repository.applyConfigurationSynchronization(
      await reviewFinalSync(repository, original.runtime.content),
    );
    const units = [
      migrationUnit("small-a", 1),
      migrationUnit("small-b", 1),
      migrationUnit("big", 200),
    ];
    const bigDraft = units[2]!.snapshots[1]!;
    await database
      .prepare(`insert into media(id,storage_key,filename,mime_type,size,metadata_json,status,created_by,created_at,updated_at)
      values('media','media','media','image/png',1,'{}','active','editor',1,1)`)
      .run();
    for (const unit of units) await seedMigrationUnit(database, unit);
    batches.length = 0;
    failDraft = true;
    const migrate = (pendingUnits: readonly ConfigurationSyncEntryMigration[]) =>
      repository.applyConfigurationSyncBlockMigrations({
        modelKey: contentModelRoute(original.runtime.content[0]!).key,
        migratedAt: unixMilliseconds(10),
        units: pendingUnits,
      });
    await assert.rejects(() => migrate(units), { code: "CONTENT_INVALID_STATE" });
    assert.deepEqual(
      batches.map(({ states }) => states),
      [["published", "draft", "published", "draft"], ["published"], ["draft"]],
    );
    assert.ok(batches.every(({ size }) => size <= D1_MAX_BATCH_STATEMENTS));
    assert.equal(stats.maxParameters, 99);
    assert.ok(stats.maxParameters <= D1_MAX_BOUND_PARAMETERS);
    const unmigrated = () =>
      database
        .prepare(
          "select snapshot_id,count(*) n from content_blocks where schema_version=1 group by snapshot_id",
        )
        .all();
    assert.deepEqual((await unmigrated()).results, [{ snapshot_id: bigDraft.snapshotId, n: 200 }]);
    assert.equal(wakeups, 1);
    assert.deepEqual(await database.prepare("select version from published_state").first(), {
      version: 1,
    });
    failDraft = false;
    const before = stats.queries;
    assert.deepEqual(await migrate([{ entryId: "big", snapshots: [bigDraft] }]), {
      blocks: 200,
      drafts: 1,
      published: 0,
    });
    assert.equal((await unmigrated()).results.length, 0);
    assert.ok(stats.queries - before <= D1_QUERY_BUDGET);
    const final = await reviewFinalSync(repository, changed.runtime.content);
    assert.deepEqual(await repository.applyConfigurationSynchronization(final), {
      operations: final.plan.operations,
      status: "applied",
      targetVersion: 2,
    });
    assert.equal(wakeups, 2);
    assert.deepEqual(await database.prepare("select count(*) n from outbox_events").first(), {
      n: 1,
    });
    assert.deepEqual(await database.prepare("select count(*) n from mutation_guards").first(), {
      n: 0,
    });
  } finally {
    await dispose();
  }
});
