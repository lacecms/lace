import type { Actor } from "@lacecms/domain";

import { present } from "../test-support/fixtures.js";
import { expect, test } from "vitest";
import { DeterministicClock, DeterministicIdGenerator, InMemoryContentStore } from "../index.js";
import { actorId, blockKey, unixMilliseconds } from "@lacecms/domain";

import { ContentUseCases } from "@lacecms/application";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import { admin, editor } from "../test-support/fixtures.js";

test("lists entries with derived status, totals, search, sort, and list values", async () => {
  const config = await defineConfig({
    content: [
      definePage({ key: "home", path: "/", version: 1 }),
      defineCollection({
        fields: {
          author: field.text(),
          body: field.richText(),
          category: field.select({ options: ["design", "news"] }),
          rank: field.number(),
        },
        key: "posts",
        listFields: ["category", "rank", "author"],
        route: "/blog/:slug",
        version: 1,
      }),
    ],
  });
  const store = new InMemoryContentStore();
  store.setActorDisplayNames({ editor: "editor@example.test" });
  const clock = new DeterministicClock(unixMilliseconds(100));
  const useCases = new ContentUseCases({
    clock,
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("list"),
    media: { loadMedia: async () => null, loadMediaMany: async () => [] },
  });
  const create = (title: string, slug: string, fields = {}) =>
    useCases.create({ actor: editor, blocks: [], fields, modelKey: "posts", slug, title });
  const draftOnly = await create("Zebra draft", "zebra", { author: "Ann", category: "news" });
  clock.advanceBy(1);
  const published = await create("apple launch", "apple-launch", { rank: 2 });
  clock.advanceBy(1);
  const changed = await create("Banana Launch", "banana", { category: "design" });
  clock.advanceBy(1);
  for (const entry of [published, changed]) {
    await useCases.publish({ actor: admin, entryId: entry.id, expectedRevision: 1 });
    clock.advanceBy(1);
  }
  await useCases.save({
    actor: editor,
    blocks: [],
    entryId: changed.id,
    expectedRevision: 1,
    fields: { category: "design" },
    slug: "banana",
    title: "Banana Launch",
  });

  const viewer: Actor = { id: actorId("viewer"), role: "viewer" };
  const all = await useCases.list({ actor: viewer, limit: 10, modelKey: "posts" });
  expect(all.totals).toEqual({ all: 3, changed: 1, draft: 1, published: 1 });
  expect(all.items.map((item) => [item.title, item.status])).toEqual([
    ["Banana Launch", "changed"],
    ["apple launch", "published"],
    ["Zebra draft", "draft"],
  ]);
  const [changedSummary, publishedSummary, draftSummary] = all.items;
  expect(draftSummary).toMatchObject({
    listValues: { author: "Ann", category: "news" },
    slug: "zebra",
    updatedBy: { displayName: "editor@example.test", id: "editor" },
  });
  expect(draftSummary).not.toHaveProperty("publishedAt");
  expect(draftSummary).not.toHaveProperty("publishedSnapshotId");
  expect(present(publishedSummary).listValues).toEqual({ rank: 2 });
  expect(present(publishedSummary).publishedAt).toBeTypeOf("number");
  expect(present(changedSummary).publishedSnapshotId).toBeDefined();
  expect(present(draftSummary).id).toBe(draftOnly.id);

  const searched = await useCases.list({
    actor: viewer,
    limit: 10,
    modelKey: "posts",
    q: "  LAUNCH ",
    sort: "title",
  });
  expect(searched.items.map((item) => item.title)).toEqual(["apple launch", "Banana Launch"]);
  expect(searched.totals).toEqual({ all: 2, changed: 1, draft: 0, published: 1 });
  const filtered = await useCases.list({
    actor: viewer,
    limit: 10,
    modelKey: "posts",
    q: "launch",
    status: "changed",
  });
  expect(filtered.items.map((item) => item.id)).toEqual([changed.id]);
  expect(filtered.totals).toEqual(searched.totals);
  expect(
    (await useCases.list({ actor: viewer, limit: 10, modelKey: "posts", q: "zebr" })).items,
  ).toHaveLength(1);

  const byPublication = await useCases.list({
    actor: viewer,
    limit: 10,
    modelKey: "posts",
    sort: "-publishedAt",
  });
  expect(byPublication.items.map((item) => item.id)).toEqual([
    changed.id,
    published.id,
    draftOnly.id,
  ]);
  const first = await useCases.list({ actor: viewer, limit: 1, modelKey: "posts", sort: "title" });
  const second = await useCases.list({
    actor: viewer,
    after: present(first.nextCursor),
    limit: 2,
    modelKey: "posts",
    sort: "title",
  });
  expect([...first.items, ...second.items].map((item) => item.title)).toEqual([
    "apple launch",
    "Banana Launch",
    "Zebra draft",
  ]);
  await expect(
    useCases.list({ actor: viewer, after: present(first.nextCursor), limit: 1, modelKey: "posts" }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });

  const results = await Promise.all(
    [viewer, editor, admin].map((actor) =>
      useCases.list({ actor, limit: 10, modelKey: "posts", q: "launch" }),
    ),
  );
  expect(results[1]).toEqual(results[0]);
  expect(results[2]).toEqual(results[0]);
  expect((await useCases.list({ actor: viewer, limit: 10, modelKey: "home" })).items).toHaveLength(
    0,
  );
});

test("validates list queries before reads and describes editors with fallbacks", async () => {
  const config = await defineConfig({
    content: [defineCollection({ key: "posts", route: "/blog/:slug", version: 1 })],
  });
  const store = new InMemoryContentStore();
  store.setActorDisplayNames({ editor: "  Editor Name  " });
  let listReads = 0;
  const list = store.list.bind(store);
  store.list = async (input) => {
    listReads += 1;
    return list(input);
  };
  const useCases = new ContentUseCases({
    clock: new DeterministicClock(unixMilliseconds(1)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("describe"),
    media: { loadMedia: async () => null, loadMediaMany: async () => [] },
  });
  for (const query of [
    { modelKey: "missing" },
    { modelKey: "posts", sort: "author" },
    { modelKey: "posts", status: "archived" },
    { modelKey: "posts", q: "x".repeat(201) },
  ]) {
    await expect(useCases.list({ actor: admin, limit: 10, ...query })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
  }
  expect(listReads).toBe(0);
  let received;
  store.list = async (input) => {
    received = input;
    return list(input);
  };
  await useCases.list({ actor: admin, limit: 5, modelKey: "posts", q: "   " });
  expect(received).toEqual({
    limit: 5,
    listFields: [],
    listQueryLimits: { maxSearchLength: 200, maxLikePatternBytes: null },
    modelKey: "posts",
    sort: "-updatedAt",
  });

  const describe = (id: string) => useCases.describeActor({ actor: admin, actorId: actorId(id) });
  await expect(describe("editor")).resolves.toEqual({ displayName: "Editor Name", id: "editor" });
  await expect(describe("system:content-sync")).resolves.toEqual({
    displayName: "System",
    id: "system:content-sync",
  });
  await expect(describe("gone")).resolves.toEqual({ displayName: "Unknown user", id: "gone" });
});

test("the in-memory store writes a supplied conditional-field projection", async () => {
  const config = await defineConfig({
    blocks: [
      defineBlock({
        type: "cta",
        version: 1,
        fields: { hasUrl: field.boolean(), url: field.url() },
        visibility: { url: { field: "hasUrl", values: [true] } },
      }),
    ],
    content: [
      defineCollection({
        key: "posts",
        version: 1,
        route: "/blog/:slug",
        blocks: ["cta"],
        fields: {
          kind: field.select({ options: ["a", "b"], required: true }),
          extra: field.text({ required: true }),
        },
        visibility: { extra: { field: "kind", values: ["b"] } },
      }),
    ],
  });
  const store = new InMemoryContentStore();
  const cases = new ContentUseCases({
    config: config.runtime,
    content: store,
    media: { loadMedia: async () => null, loadMediaMany: async () => [] },
    clock: new DeterministicClock(unixMilliseconds(1)),
    idGenerator: new DeterministicIdGenerator("conditional"),
  });
  const created = await cases.create({
    actor: admin,
    modelKey: "posts",
    title: "Post",
    slug: "post",
    fields: { kind: "a", extra: "kept" },
    blocks: [
      {
        key: blockKey("cta"),
        type: "cta",
        schemaVersion: 1,
        position: 1000,
        data: { hasUrl: false, url: "https://example.com" },
      },
    ],
  });
  await cases.publish({ actor: admin, entryId: created.id, expectedRevision: 1 });
  const loaded = present(await store.load({ entryId: created.id }));
  expect(present(loaded.published).fields).toEqual({ kind: "a" });
  expect(present(present(loaded.published).blocks[0]).data).toEqual({ hasUrl: false });
  expect(loaded.draft.fields).toEqual({ kind: "a", extra: "kept" });
  expect(present(loaded.draft.blocks[0]).data).toEqual({
    hasUrl: false,
    url: "https://example.com",
  });
  expect(present(present(await store.loadPublic("/blog/post")).entry.published).fields).toEqual({
    kind: "a",
  });
});
