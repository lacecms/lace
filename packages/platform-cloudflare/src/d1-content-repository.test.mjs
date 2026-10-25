import { afterEach, expect, test } from "vitest";
import { readdir, readFile, writeFile } from "node:fs/promises";
import {
  actorId,
  blockKey,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";
import { D1_MAX_BOUND_PARAMETERS, D1_QUERY_BUDGET, D1ContentRepository } from "../dist/index.js";
import { countingD1, openLocalD1 } from "./d1-test-harness.mjs";

const editor = { id: actorId("editor"), role: "editor" };
const posts = { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" };
const resolveModel = (key) => (key === "posts" ? posts : undefined);
const disposals = [];

afterEach(async () => {
  for (const dispose of disposals.splice(0)) await dispose();
});

async function open(options = {}) {
  const { database, dispose } = await openLocalD1();
  disposals.push(dispose);
  await database
    .prepare(
      "insert into content_models (key, kind, label, config_version, structure_hash, projection_hash, created_at, updated_at) values ('posts', 'collection', 'Posts', 1, 'structure', 'projection', 1, 1)",
    )
    .run();
  const counting = countingD1(database);
  return {
    counting,
    database,
    repository: new D1ContentRepository(counting.binding, resolveModel, options),
    scalar: async (sql, ...params) =>
      Object.values(
        await (
          params.length === 0 ? database.prepare(sql) : database.prepare(sql).bind(...params)
        ).first(),
      )[0],
  };
}

async function seedMedia(database, count) {
  const statements = Array.from({ length: count }, (_, index) =>
    database
      .prepare(
        "insert into media (id, storage_key, filename, mime_type, size, metadata_json, status, created_by, created_at, updated_at) values (?, ?, 'image.png', 'image/png', 1, '{}', 'active', 'editor', 1, 1)",
      )
      .bind(`media-${index}`, `media/${index}`),
  );
  for (let index = 0; index < statements.length; index += 50) {
    await database.batch(statements.slice(index, index + 50));
  }
}

function draft(id, { blocks = [], slug = id, title = id, updatedAt = 1 } = {}) {
  const entryId = contentEntryId(id);
  return createContentEntry({
    draft: {
      blocks,
      createdAt: unixMilliseconds(updatedAt),
      entryId,
      fields: {},
      id: contentSnapshotId(`${id}-draft`),
      revision: 1,
      slug,
      state: "draft",
      title,
      updatedAt: unixMilliseconds(updatedAt),
      updatedBy: editor,
    },
    id: entryId,
    model: posts,
  });
}

function maximalDraft(label, count = 200) {
  const blocks = Array.from({ length: count }, (_, index) => ({
    data: {
      images: [{ image: `media-${index}` }],
      tags: index < 100 ? [label, label] : [label],
      text: "x".repeat(64),
      url: "entry:post",
    },
    key: blockKey(`${label}-${index}`),
    position: (index + 1) * 1000,
    schemaVersion: 1,
    type: "hero",
  }));
  const references = blocks.map((block, index) => ({
    fieldPath: "/images/0/image",
    mediaId: mediaId(`media-${index}`),
    sourceKey: block.key,
  }));
  return {
    blocks,
    references,
    internalLinks: blocks.map((block) => ({
      sourceKey: block.key,
      area: "data",
      pointer: "/url",
      targetId: "post",
      delivered: true,
    })),
  };
}

function saveInput(id, expectedRevision, at, blocks, mediaReferences, title = `Saved ${at}`) {
  return {
    entryId: contentEntryId(id),
    mutation: {
      blocks,
      expectedRevision,
      fields: {},
      mediaReferences,
      slug: id,
      title,
      updatedAt: unixMilliseconds(at),
      updatedBy: editor,
    },
  };
}

function publishInput(id, expectedRevision, at, snapshot) {
  return {
    entryId: contentEntryId(id),
    expectedRevision,
    publishedAt: unixMilliseconds(at),
    publishedBy: editor,
    publishedSnapshotId: contentSnapshotId(snapshot),
  };
}

test("saves a maximal draft in one batch within parameter and query budgets", async () => {
  const { counting, database, repository, scalar } = await open();
  await seedMedia(database, 200);
  const created = maximalDraft("created");
  counting.stats.queries = 0;
  counting.stats.batches = 0;
  await repository.create({
    entry: draft("post", { blocks: created.blocks }),
    mediaReferences: created.references,
    internalLinks: created.internalLinks,
  });
  expect(counting.stats.queries).toBeLessThanOrEqual(D1_QUERY_BUDGET);
  expect(counting.stats.batches).toBe(1);
  const saved = maximalDraft("saved");
  counting.stats.queries = 0;
  counting.stats.batches = 0;
  counting.stats.maxParameters = 0;
  const result = await repository.saveCompleteDraft({
    ...saveInput("post", 1, 2, saved.blocks, saved.references),
    internalLinks: saved.internalLinks,
  });
  expect(counting.stats.queries).toBeLessThanOrEqual(D1_QUERY_BUDGET);
  expect(counting.stats.batches).toBe(1);
  expect(counting.stats.maxParameters).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMETERS);
  expect(counting.stats.maxBatchStatements).toBeLessThanOrEqual(40);
  expect(await scalar("select count(*) from content_entry_link_references")).toBe(200);
  expect(result.entry.draft.revision).toBe(2);
  expect(result.entry.draft.blocks).toHaveLength(200);
  expect(result.entry.draft.blocks[0].data).toEqual(saved.blocks[0].data);
  expect(
    result.entry.draft.blocks.reduce(
      (sum, block) => sum + block.data.images.length + block.data.tags.length,
      0,
    ),
  ).toBe(500);
  expect(result.entry.draft.blocks.at(-1).key).toBe("saved-199");
  expect(await scalar("select count(*) from content_blocks")).toBe(200);
  expect(
    await scalar("select count(*) from content_media_references where source_key like 'saved-%'"),
  ).toBe(200);
  counting.stats.queries = 0;
  counting.stats.batches = 0;
  await repository.publish(publishInput("post", 2, 3, "post-published"));
  expect(counting.stats.queries).toBeLessThanOrEqual(D1_QUERY_BUDGET);
  expect(counting.stats.batches).toBe(1);
  expect(await scalar("select count(*) from content_blocks")).toBe(400);
  expect(await scalar("select count(*) from content_entry_link_references")).toBe(400);
});

test("rejects an oversized draft before sending any write", async () => {
  const { counting, repository } = await open();
  await repository.create({ entry: draft("post"), mediaReferences: [] });
  const oversized = maximalDraft("big", 201);
  counting.stats.queries = 0;
  counting.stats.batches = 0;
  await expect(
    repository.saveCompleteDraft(saveInput("post", 1, 2, oversized.blocks, [])),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  await expect(
    repository.saveCompleteDraft(saveInput("post", 1, 2, [], oversized.references)),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(counting.stats.queries).toBe(0);
});

test("rolls back a chunked save when media in the last chunk is unavailable", async () => {
  const { database, repository, scalar } = await open();
  await seedMedia(database, 200);
  const original = maximalDraft("original", 10);
  await repository.create({
    entry: draft("post", { blocks: original.blocks }),
    mediaReferences: original.references,
  });
  const replacement = maximalDraft("replacement");
  await database.prepare("update media set status = 'deleting' where id = 'media-199'").run();
  await expect(
    repository.saveCompleteDraft(
      saveInput("post", 1, 2, replacement.blocks, replacement.references),
    ),
  ).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
    message: "Media is unavailable for reference.",
  });
  const stored = (await repository.load({ entryId: contentEntryId("post") })).draft;
  expect(stored.revision).toBe(1);
  expect(stored.blocks.map((block) => block.key)).toEqual(
    original.blocks.map((block) => block.key),
  );
  expect(await scalar("select count(*) from content_media_references")).toBe(10);
  expect(await scalar("select count(*) from mutation_guards")).toBe(0);
});

test("admits one of many concurrent saves at the same revision", async () => {
  const { database, repository, scalar } = await open();
  await repository.create({ entry: draft("post"), mediaReferences: [] });
  const writers = Array.from({ length: 5 }, (_, index) =>
    new D1ContentRepository(database, resolveModel).saveCompleteDraft(
      saveInput("post", 1, 10 + index, [], [], `writer-${index}`),
    ),
  );
  const results = await Promise.allSettled(writers);
  expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
  for (const result of results.filter((value) => value.status === "rejected")) {
    expect(result.reason).toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  }
  expect(await scalar("select revision from content_snapshots where id = 'post-draft'")).toBe(2);
});

test("route conflict rolls back the in-batch removal of the entry's previous route", async () => {
  const { counting, database, repository, scalar } = await open();
  await repository.create({ entry: draft("owner", { slug: "taken" }), mediaReferences: [] });
  await repository.publish(publishInput("owner", 1, 2, "owner-published"));
  await repository.create({ entry: draft("mover", { slug: "old" }), mediaReferences: [] });
  await repository.publish(publishInput("mover", 1, 3, "mover-published"));
  await repository.saveCompleteDraft({
    entryId: contentEntryId("mover"),
    mutation: {
      blocks: [],
      expectedRevision: 1,
      fields: {},
      mediaReferences: [],
      slug: "taken",
      title: "mover",
      updatedAt: unixMilliseconds(4),
      updatedBy: editor,
    },
  });
  counting.stats.queries = 0;
  counting.stats.batches = 0;
  await expect(
    repository.publish(publishInput("mover", 2, 5, "mover-second")),
  ).rejects.toMatchObject({ code: "CONTENT_ROUTE_CONFLICT" });
  expect(counting.stats.queries).toBeGreaterThan(8);
  expect(
    (
      await database
        .prepare("select path, entry_id, snapshot_id from published_routes order by path")
        .all()
    ).results,
  ).toEqual([
    { entry_id: "mover", path: "/blog/old", snapshot_id: "mover-published" },
    { entry_id: "owner", path: "/blog/taken", snapshot_id: "owner-published" },
  ]);
  expect(await scalar("select published_snapshot_id from content_entries where id = 'mover'")).toBe(
    "mover-published",
  );
  expect(await scalar("select count(*) from content_snapshots where id = 'mover-second'")).toBe(0);
  expect(await repository.publishedContentVersion()).toBe(2);
});

test("an injected checkpoint fails inside the executed batch", async () => {
  const batches = [];
  const { counting, database, scalar } = await open();
  const binding = {
    batch: (statements) => {
      batches.push(statements.length);
      return counting.binding.batch(statements);
    },
    prepare: (sql) => counting.binding.prepare(sql),
  };
  const repository = new D1ContentRepository(binding, resolveModel, {
    beforeMutation: (name) => {
      if (name === "build-outbox") throw new Error("injected");
    },
  });
  await repository.create({ entry: draft("post"), mediaReferences: [] });
  await expect(repository.publish(publishInput("post", 1, 2, "published"))).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
    message: "D1 content write failed.",
  });
  expect(batches.at(-1)).toBeGreaterThan(7);
  for (const table of ["published_routes", "published_state", "outbox_events", "mutation_guards"]) {
    expect(await scalar(`select count(*) from ${table}`)).toBe(0);
  }
  expect(await scalar("select count(*) from content_snapshots")).toBe(1);
  expect(
    await database.prepare("select published_snapshot_id from content_entries").first(),
  ).toEqual({ published_snapshot_id: null });
});

test("the D1 adapter source imports no Node-only runtime module", async () => {
  const directory = new URL("./", import.meta.url);
  const sources = (await readdir(directory)).filter((file) => file.endsWith(".ts"));
  expect(sources.length).toBeGreaterThan(0);
  const forbidden =
    /from\s+"(node:[^"]+|fs|path|crypto|better-sqlite3|@aws-sdk\/[^"]+|sharp|@lacecms\/platform-node)"/u;
  for (const file of sources) {
    expect(await readFile(new URL(file, directory), "utf8"), file).not.toMatch(forbidden);
  }
  const shared = await readFile(new URL("../../db/src/sql-content.ts", import.meta.url), "utf8");
  expect(shared).not.toMatch(forbidden);
  expect(shared).not.toMatch(/\bBuffer\.from\b/u);
});

test("reads a full build-export page with two bounded batches", async () => {
  const { counting, database, repository } = await open();
  await seedMedia(database, 200);
  // Two maximal entries (200 blocks and 200 references each) among 101 routed entries.
  for (let index = 0; index < 101; index += 1) {
    const id = `post-${String(index).padStart(3, "0")}`;
    const maximal = index < 2 ? maximalDraft(id) : maximalDraft(id, 1);
    await repository.create({
      entry: draft(id, {
        blocks: maximal.blocks,
        fields: { links: Array(200).fill(`entry:${id}`) },
      }),
      mediaReferences: maximal.references,
      internalLinks: Array.from({ length: 200 }, (_, index) => ({
        sourceKey: "$fields",
        area: "fields",
        pointer: `/links/${index}`,
        targetId: id,
        delivered: true,
      })),
    });
    await repository.publish(publishInput(id, 1, 2, `${id}-published`));
  }
  counting.stats.queries = 0;
  counting.stats.batches = 0;
  counting.stats.maxParameters = 0;
  const first = await repository.exportBuildContentPage({ limit: 100 });
  expect(counting.stats.batches).toBe(2);
  expect(counting.stats.queries).toBeLessThanOrEqual(10);
  expect(counting.stats.maxParameters).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMETERS);
  expect(first.entries).toHaveLength(100);
  expect(first.entries[0].entry.published.blocks).toHaveLength(200);
  expect(first.entries[0].media).toHaveLength(200);
  expect(first.entries.every((item) => item.internalLinks.length === 200)).toBe(true);
  expect(first.entries[0].internalLinks.every((item) => item.targetId === "post-000")).toBe(true);
  expect(first.globals).toEqual([]);

  counting.stats.queries = 0;
  counting.stats.batches = 0;
  const last = await repository.exportBuildContentPage({ after: first.nextCursor, limit: 100 });
  expect(counting.stats.batches).toBe(2);
  expect(counting.stats.queries).toBeLessThanOrEqual(10);
  expect(last.entries.map((item) => item.path)).toEqual(["/blog/post-100"]);
  expect(last).not.toHaveProperty("nextCursor");
});

test("fails a build-export page when a publication lands between its batches", async () => {
  const { counting, database, repository } = await open();
  for (const id of ["a", "b", "c"]) {
    await repository.create({ entry: draft(id), mediaReferences: [] });
    if (id !== "c") await repository.publish(publishInput(id, 1, 2, `${id}-published`));
  }
  const other = new D1ContentRepository(database, resolveModel);
  const binding = counting.binding;
  let batches = 0;
  let inject = async () => {};
  const injecting = new D1ContentRepository(
    {
      ...binding,
      batch: async (statements) => {
        const result = await binding.batch(statements);
        batches += 1;
        if (batches === 1) await inject();
        return result;
      },
    },
    resolveModel,
  );
  const mutations = [
    () => other.publish(publishInput("c", 1, 3, "c-published")),
    () =>
      other.unpublish({
        entryId: contentEntryId("c"),
        expectedPublishedSnapshotId: contentSnapshotId("c-published"),
        unpublishedAt: unixMilliseconds(4),
        unpublishedBy: editor,
      }),
  ];
  for (const [index, mutate] of mutations.entries()) {
    // The first case reads a first page, the second a continuation page.
    const after =
      index === 0 ? undefined : (await repository.exportBuildContentPage({ limit: 1 })).nextCursor;
    const version = await repository.publishedContentVersion();
    batches = 0;
    inject = mutate;
    const failure = await injecting
      .exportBuildContentPage({ ...(after === undefined ? {} : { after }), limit: 1 })
      .catch((error) => error);
    expect(batches).toBe(2);
    expect(failure).toMatchObject({
      actualVersion: version + 1,
      code: "BUILD_EXPORT_VERSION_CHANGED",
      expectedVersion: version,
    });
  }
  inject = async () => {};
  expect((await injecting.exportBuildContentPage({ limit: 100 })).entries).toHaveLength(2);
});

test("link reads use bounded indexed statements without hydrating aggregates", async () => {
  const { counting, repository } = await open();
  await repository.create({ entry: draft("post"), mediaReferences: [] });
  counting.stats.queries = 0;
  const ids = ["post", ...Array.from({ length: 199 }, (_, index) => `missing-${index}`)];
  expect(Object.keys(await repository.resolveLinkTargets(ids))).toHaveLength(200);
  expect(counting.stats.queries).toBeLessThanOrEqual(2);
  counting.stats.queries = 0;
  expect((await repository.listLinkTargets({ search: "post", limit: 20 })).items).toHaveLength(1);
  expect(counting.stats.queries).toBeLessThanOrEqual(2);
  counting.stats.queries = 0;
  expect(
    await repository.readLinkImpact({
      targetId: "post",
      action: "delete",
      actorId: "admin",
      limit: 20,
    }),
  ).toMatchObject({ mode: "sources", sources: [], hasPublishedUsages: false });
  expect(counting.stats.queries).toBeLessThanOrEqual(5);
  counting.stats.queries = 0;
  await expect(
    repository.listLinkTargets({ after: "invalid-cursor", limit: 20 }),
  ).rejects.toThrow();
  await expect(
    repository.readLinkImpact({
      targetId: "post",
      action: "delete",
      actorId: "admin",
      limit: 20,
      after: "invalid-cursor",
    }),
  ).rejects.toThrow();
  expect(counting.stats.queries).toBe(0);
});

test("final removal guard rejects a source published after impact preflight", async () => {
  const { database, repository, counting } = await open();
  await repository.create({ entry: draft("post"), mediaReferences: [] });
  await repository.publish(publishInput("post", 1, 2, "target-published"));
  await repository.create({
    entry: draft("source"),
    mediaReferences: [],
    internalLinks: [
      { sourceKey: "$fields", area: "fields", pointer: "/url", targetId: "post", delivered: true },
    ],
  });
  let interleave = true;
  const raced = new D1ContentRepository(
    {
      ...counting.binding,
      batch: async (statements) => {
        if (interleave) {
          interleave = false;
          await repository.publish(publishInput("source", 1, 3, "source-published"));
        }
        return counting.binding.batch(statements);
      },
    },
    resolveModel,
  );
  await expect(
    raced.unpublish({
      entryId: contentEntryId("post"),
      expectedPublishedSnapshotId: contentSnapshotId("target-published"),
      unpublishedAt: unixMilliseconds(4),
      unpublishedBy: editor,
    }),
  ).rejects.toMatchObject({ code: "CONTENT_LINKS_IN_USE" });
  expect(await repository.loadPublic("/blog/post")).not.toBeNull();
  const impact = await repository.readLinkImpact({
    targetId: "post",
    action: "unpublish",
    actorId: editor.id,
    limit: 20,
  });
  await repository.create({
    entry: draft("another-source"),
    mediaReferences: [],
    internalLinks: [
      { sourceKey: "$fields", area: "fields", pointer: "/url", targetId: "post", delivered: true },
    ],
  });
  // Refresh after the new draft; publication below must still invalidate the receipt at commit.
  const fresh = await repository.readLinkImpact({
    targetId: "post",
    action: "unpublish",
    actorId: editor.id,
    limit: 20,
  });
  const confirmed = new D1ContentRepository(
    {
      ...counting.binding,
      batch: async (statements) => {
        await repository.publish(publishInput("another-source", 1, 5, "another-source-published"));
        return counting.binding.batch(statements);
      },
    },
    resolveModel,
  );
  await expect(
    confirmed.unpublish({
      entryId: contentEntryId("post"),
      expectedPublishedSnapshotId: contentSnapshotId("target-published"),
      unpublishedAt: unixMilliseconds(6),
      unpublishedBy: editor,
      linkImpact: { receipt: fresh.receipt, acknowledgePublishedLinks: true },
    }),
  ).rejects.toMatchObject({ code: "CONTENT_LINK_IMPACT_CHANGED" });
  expect(await repository.loadPublic("/blog/post")).not.toBeNull();
  expect(impact.hasPublishedUsages).toBe(true);
  expect(
    (await database.prepare("select count(*) as count from mutation_guards").first()).count,
  ).toBe(0);
});

test("CE10 high fan-out evidence keeps impact and picker indexed with bounded row work", async () => {
  const { counting, database, repository } = await open();
  await repository.create({ entry: draft("target"), mediaReferences: [] });
  await repository.publish(publishInput("target", 1, 2, "target-published"));
  const ids = JSON.stringify(
    Array.from({ length: 1000 }, (_, i) => `source-${String(i).padStart(4, "0")}`),
  );
  await database.batch([
    database
      .prepare(
        "insert into content_entries(id,model_key,created_by,created_at,updated_at) select value,'posts','editor',1,1 from json_each(?)",
      )
      .bind(ids),
    database
      .prepare(
        "insert into content_snapshots(id,entry_id,revision,title,fields_json,schema_version,created_at,updated_at,updated_by) select value||'-published',value,1,value,'{}',1,1,1,'editor' from json_each(?)",
      )
      .bind(ids),
    database.prepare(
      "update content_entries set draft_snapshot_id=id||'-published',published_snapshot_id=id||'-published' where id like 'source-%'",
    ),
    database
      .prepare(
        "insert into published_routes(path,entry_id,snapshot_id,updated_at) select '/sources/'||value,value,value||'-published',1 from json_each(?)",
      )
      .bind(ids),
    database
      .prepare(
        "insert into content_entry_link_references select value||'-published','$fields','fields','/url','target',1 from json_each(?)",
      )
      .bind(ids),
    database
      .prepare(
        "insert into content_entry_link_references select 'source-0000-published','dense','data','/url/'||value,'target',1 from json_each(?)",
      )
      .bind(JSON.stringify(Array.from({ length: 199 }, (_, i) => i))),
  ]);
  const sql = new Map();
  const binding = {
    ...counting.binding,
    prepare: (query) => {
      const prepared = counting.binding.prepare(query);
      sql.set(query, []);
      return {
        ...prepared,
        bind: (...params) => {
          sql.set(query, params);
          return prepared.bind(...params);
        },
      };
    },
  };
  const traced = new D1ContentRepository(binding, resolveModel);
  const evidence = [];
  const record = async (name, operation) => {
    counting.stats.queries = counting.stats.rowsRead = counting.stats.rowsWritten = 0;
    const result = await operation();
    evidence.push({
      name,
      queries: counting.stats.queries,
      rowsRead: counting.stats.rowsRead,
      rowsWritten: counting.stats.rowsWritten,
    });
    expect(counting.stats.rowsWritten).toBe(0);
    return result;
  };
  const first = await record("impact-50-sources", () =>
    traced.readLinkImpact({ targetId: "target", action: "delete", actorId: "admin", limit: 50 }),
  );
  expect(first.sources).toHaveLength(50);
  const dense = first.sources[0];
  expect(dense.locations).toHaveLength(10);
  await record("impact-50-locations", () =>
    traced.readLinkImpact({
      targetId: "target",
      action: "delete",
      actorId: "admin",
      limit: 50,
      sourceEntryId: dense.entryId,
      snapshotId: dense.snapshotId,
      locationsAfter: dense.nextLocationsCursor,
    }),
  );
  await record("picker-50-prefix", () =>
    traced.listLinkTargets({ search: "source-09", limit: 50 }),
  );
  await record("resolve-200", () =>
    traced.resolveLinkTargets([
      "target",
      ...Array.from({ length: 199 }, (_, i) => `source-${String(i).padStart(4, "0")}`),
    ]),
  );
  const plans = [];
  for (const [query, binds] of sql) {
    const statement = database.prepare(`explain query plan ${query}`);
    const result = await (binds.length ? statement.bind(...binds) : statement).all();
    plans.push(...result.results.map((row) => row.detail));
  }
  expect(plans.join("\n")).toContain("content_entry_link_references_target_idx");
  expect(plans.join("\n")).toContain("content_snapshots_title_prefix_idx");
  if (process.env.LACE_CE10_EVIDENCE)
    await writeFile(
      `${process.env.LACE_CE10_EVIDENCE}-fanout.json`,
      JSON.stringify({ evidence, plans }, null, 2),
    );
  console.info(
    "CE10 high fan-out D1 evidence",
    JSON.stringify({
      evidence,
      indexedPlans: [
        ...new Set(
          plans.filter((line) =>
            /content_entry_link_references|content_snapshots_title/u.test(line),
          ),
        ),
      ],
    }),
  );
});

test("direct D1 list reads enforce trusted LIKE policy before preparing SQL", async () => {
  let statements = 0;
  const repository = new D1ContentRepository(
    {
      prepare() {
        statements++;
        throw new Error("unexpected SQL");
      },
    },
    resolveModel,
  );
  const input = {
    modelKey: "posts",
    listFields: [],
    limit: 5,
    sort: "title",
    listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
  };
  for (const value of ["a".repeat(49), "я".repeat(24) + "a", "%".repeat(24) + "a"]) {
    await expect(repository.list({ ...input, q: value })).rejects.toMatchObject({ pointer: "/q" });
    await expect(
      repository.list({
        ...input,
        query: {
          filters: [{ field: "text", op: "contains", value }],
          filterableFields: [{ key: "text", type: "text" }],
          sortableFields: [],
          searchableFields: [],
        },
      }),
    ).rejects.toMatchObject({ pointer: "/filters/0/value" });
  }
  expect(statements).toBe(0);
});
