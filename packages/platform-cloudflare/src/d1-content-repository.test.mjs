import { afterEach, expect, test } from "vitest";
import { readdir, readFile } from "node:fs/promises";
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
    data: { image: `media-${index}`, label, text: "x".repeat(64) },
    key: blockKey(`${label}-${index}`),
    position: (index + 1) * 1000,
    schemaVersion: 1,
    type: "hero",
  }));
  const references = blocks.map((block, index) => ({
    fieldPath: "image",
    mediaId: mediaId(`media-${index}`),
    sourceKey: block.key,
  }));
  return { blocks, references };
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
  await repository.create({
    entry: draft("post", { blocks: created.blocks }),
    mediaReferences: created.references,
  });
  expect(counting.stats.queries).toBeLessThanOrEqual(D1_QUERY_BUDGET);
  const saved = maximalDraft("saved");
  counting.stats.queries = 0;
  counting.stats.maxParameters = 0;
  const result = await repository.saveCompleteDraft(
    saveInput("post", 1, 2, saved.blocks, saved.references),
  );
  expect(counting.stats.queries).toBeLessThanOrEqual(D1_QUERY_BUDGET);
  expect(counting.stats.maxParameters).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMETERS);
  expect(result.entry.draft.revision).toBe(2);
  expect(result.entry.draft.blocks).toHaveLength(200);
  expect(result.entry.draft.blocks.at(-1).key).toBe("saved-199");
  expect(await scalar("select count(*) from content_blocks")).toBe(200);
  expect(
    await scalar("select count(*) from content_media_references where source_key like 'saved-%'"),
  ).toBe(200);
  counting.stats.queries = 0;
  await repository.publish(publishInput("post", 2, 3, "post-published"));
  expect(counting.stats.queries).toBeLessThanOrEqual(D1_QUERY_BUDGET);
  expect(await scalar("select count(*) from content_blocks")).toBe(400);
});

test("rejects an oversized draft before sending any write", async () => {
  const { counting, repository } = await open();
  await repository.create({ entry: draft("post"), mediaReferences: [] });
  const oversized = maximalDraft("big", 201);
  counting.stats.queries = 0;
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
