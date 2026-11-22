import { siteBuildEvent } from "@lacecms/application";
import {
  applicationSqlite,
  repositorySqlite,
  persistedMediaReferences,
  requestedMediaDeletions,
} from "../test-support/application-sqlite.js";
import { seedSqliteMedia } from "../test-support/sqlite.js";
import { NODE_LIST_QUERY_LIMITS as TEST_LIST_QUERY_LIMITS } from "@lacecms/content";
import type { Actor } from "@lacecms/domain";

import { present } from "../test-support/fixtures.js";
import { expect, test } from "vitest";
import { DeterministicClock, DeterministicIdGenerator, InMemoryObjectStorage } from "../index.js";
import {
  contentEntryId,
  actorId,
  blockKey,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";

import { ContentUseCases, MediaUseCases } from "@lacecms/application";
import { defineCollection, defineConfig } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import {
  admin,
  editor,
  mediaUsageEntry,
  imageBlock,
  seedMediaCatalog,
  postsRoute,
  detachFixture,
} from "../test-support/fixtures.js";

test("derives SQLite media usage and in-use refusals from current snapshots", async () => {
  const { connection, store } = repositorySqlite(postsRoute);
  seedMediaCatalog(connection);
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(60)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: { inspect: async () => ({ height: 1, width: 1 }) },
    logger: { error() {} },
    media: store,
    storage: new InMemoryObjectStorage(),
  });
  const entry = mediaUsageEntry("e-one", {
    blocks: [
      imageBlock("hero-1", "hero", 1000, "m-a"),
      imageBlock("gallery-1", "gallery", 2000, "m-a"),
    ],
    fields: { cover: "m-a" },
    updatedAt: 20,
  });
  await store.create({
    entry,
    mediaReferences: [
      { fieldPath: "cover", mediaId: mediaId("m-a"), sourceKey: "$fields" },
      { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("hero-1") },
      { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("gallery-1") },
    ],
  });
  await store.publish({
    events: [
      siteBuildEvent({
        reason: "publication",
        requestedAt: unixMilliseconds(30),
        requestedBy: editor.id,
        publishedSnapshotId: contentSnapshotId("e-one-published"),
      }),
    ],
    entryId: entry.id,
    expectedRevision: 1,
    publishedAt: unixMilliseconds(30),
    publishedBy: editor,
    publishedSnapshotId: contentSnapshotId("e-one-published"),
  });
  await store.saveCompleteDraft({
    entryId: entry.id,
    mutation: {
      blocks: [imageBlock("gallery-1", "carousel", 1000, "m-a")],
      expectedRevision: 1,
      fields: { cover: "m-d" },
      mediaReferences: [
        { fieldPath: "cover", mediaId: mediaId("m-d"), sourceKey: "$fields" },
        { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("gallery-1") },
      ],
      slug: "e-one",
      title: "Title e-one",
      updatedAt: unixMilliseconds(40),
      updatedBy: editor,
    },
  });
  await store.create({
    entry: mediaUsageEntry("e-two", { fields: { cover: "m-a" }, updatedAt: 50 }),
    mediaReferences: [{ fieldPath: "cover", mediaId: mediaId("m-a"), sourceKey: "$fields" }],
  });

  const viewer: Actor = { id: actorId("viewer"), role: "viewer" };
  const detail = present(await media.get({ actor: viewer, mediaId: mediaId("m-a") }));
  expect(detail).toMatchObject({ createdBy: { displayName: "Ada" }, usageCount: 2 });
  expect(detail.usage).toEqual([
    {
      entryId: "e-two",
      locations: [{ field: "cover", source: "field", states: ["draft"] }],
      modelKey: "posts",
      slug: "e-two",
      status: "draft",
      title: "Title e-two",
    },
    {
      entryId: "e-one",
      locations: [
        { field: "cover", source: "field", states: ["published"] },
        {
          blockKey: "gallery-1",
          blockType: "carousel",
          field: "image",
          source: "block",
          states: ["draft", "published"],
        },
        {
          blockKey: "hero-1",
          blockType: "hero",
          field: "image",
          source: "block",
          states: ["published"],
        },
      ],
      modelKey: "posts",
      slug: "e-one",
      status: "changed",
      title: "Title e-one",
    },
  ]);
  expect(
    (await store.loadMediaUsage({ limit: 1, mediaId: mediaId("m-a") })).map((e) => e.entryId),
  ).toEqual(["e-two"]);
  await expect(store.loadMediaUsage({ limit: 51, mediaId: mediaId("m-a") })).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });

  await expect(
    media.requestDeletion({ actor: editor, mediaId: mediaId("m-d") }),
  ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
  expect(requestedMediaDeletions(connection)).toEqual([]);
  // Removing the draft reference and republishing clears usage; deletion is then accepted.
  await store.saveCompleteDraft({
    entryId: entry.id,
    mutation: {
      blocks: [imageBlock("gallery-1", "carousel", 1000, "m-a")],
      expectedRevision: 2,
      fields: {},
      mediaReferences: [
        { fieldPath: "image", mediaId: mediaId("m-a"), sourceKey: blockKey("gallery-1") },
      ],
      slug: "e-one",
      title: "Title e-one",
      updatedAt: unixMilliseconds(55),
      updatedBy: editor,
    },
  });
  expect(present(await media.get({ actor: viewer, mediaId: mediaId("m-d") })).usageCount).toBe(0);
  await expect(
    media.requestDeletion({ actor: editor, mediaId: mediaId("m-d") }),
  ).resolves.toMatchObject({ status: "deleting", usageCount: 0 });
  await store.publish({
    events: [
      siteBuildEvent({
        reason: "publication",
        requestedAt: unixMilliseconds(56),
        requestedBy: editor.id,
        publishedSnapshotId: contentSnapshotId("e-one-published-2"),
      }),
    ],
    entryId: entry.id,
    expectedRevision: 3,
    publishedAt: unixMilliseconds(56),
    publishedBy: editor,
    publishedSnapshotId: contentSnapshotId("e-one-published-2"),
  });
  const afterRepublish = present(await media.get({ actor: viewer, mediaId: mediaId("m-a") }));
  expect(
    present(afterRepublish.usage.find((usage) => usage.entryId === "e-one")).locations,
  ).toEqual([
    {
      blockKey: "gallery-1",
      blockType: "carousel",
      field: "image",
      source: "block",
      states: ["draft", "published"],
    },
  ]);
});

test("content rejects 201 reference locations before bulk metadata reads or writes", async () => {
  const config = await defineConfig({
    blocks: [
      defineBlock({
        type: "asset",
        version: 1,
        fields: { first: field.media(), second: field.media() },
      }),
    ],
    content: [
      defineCollection({ key: "posts", version: 1, route: "/blog/:slug", blocks: ["asset"] }),
    ],
  });
  const { store } = applicationSqlite(config.runtime.content);
  let reads = 0;
  let writes = 0;
  const create = store.create.bind(store);
  store.create = async (input) => {
    writes++;
    return create(input);
  };
  const useCases = new ContentUseCases({
    listQueryLimits: TEST_LIST_QUERY_LIMITS,
    clock: new DeterministicClock(unixMilliseconds(1)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("refs"),
    media: {
      loadMedia: async () => null,
      loadMediaMany: async () => {
        reads++;
        return [];
      },
    },
  });
  const blocks = Array.from({ length: 101 }, (_, index) => ({
    key: blockKey(`block-${index}`),
    type: "asset",
    schemaVersion: 1,
    position: (index + 1) * 1000,
    data: index === 100 ? { first: "same-id" } : { first: "same-id", second: "same-id" },
  }));
  await expect(
    useCases.create({
      actor: editor,
      modelKey: "posts",
      slug: "oversize-refs",
      title: "Too many references",
      fields: {},
      blocks,
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(reads).toBe(0);
  expect(writes).toBe(0);
  expect(await store.loadPublic("/blog/oversize-refs")).toBeNull();
});

test("the SEO image counts toward the media-reference limit", async () => {
  const config = await defineConfig({
    blocks: [defineBlock({ fields: { image: field.media() }, type: "asset", version: 1 })],
    content: [
      defineCollection({
        blocks: ["asset"],
        key: "posts",
        route: "/blog/:slug",
        seo: true,
        version: 1,
      }),
    ],
  });
  let reads = 0;
  const useCases = new ContentUseCases({
    listQueryLimits: TEST_LIST_QUERY_LIMITS,
    clock: new DeterministicClock(unixMilliseconds(1)),
    config: config.runtime,
    content: applicationSqlite(config.runtime.content).store,
    idGenerator: new DeterministicIdGenerator("seo-refs"),
    media: {
      loadMedia: async () => null,
      loadMediaMany: async () => {
        reads++;
        return [];
      },
    },
  });
  const blocks = Array.from({ length: 200 }, (_, index) => ({
    data: { image: "same-id" },
    key: blockKey(`block-${index}`),
    position: (index + 1) * 1000,
    schemaVersion: 1,
    type: "asset",
  }));
  await expect(
    useCases.create({
      actor: editor,
      blocks,
      fields: {},
      modelKey: "posts",
      seo: { image: "same-id" },
      title: "Too many references",
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(reads).toBe(0);
});

test("hidden-block media counts toward the media-reference limit", async () => {
  const config = await defineConfig({
    blocks: [
      defineBlock({
        fields: { cover: field.media(), image: field.media() },
        type: "pair",
        version: 1,
      }),
    ],
    content: [
      defineCollection({ blocks: ["pair"], key: "posts", route: "/blog/:slug", version: 1 }),
    ],
  });
  let reads = 0;
  const useCases = new ContentUseCases({
    listQueryLimits: TEST_LIST_QUERY_LIMITS,
    clock: new DeterministicClock(unixMilliseconds(1)),
    config: config.runtime,
    content: applicationSqlite(config.runtime.content).store,
    idGenerator: new DeterministicIdGenerator("envelope-refs"),
    media: {
      loadMedia: async () => null,
      loadMediaMany: async () => {
        reads++;
        return [];
      },
    },
  });
  // 101 blocks, every one hidden, hold 202 references.
  const blocks = Array.from({ length: 101 }, (_, index) => ({
    data: { cover: "same-id", image: "same-id" },
    hidden: true,
    key: blockKey(`block-${index}`),
    position: (index + 1) * 1000,
    schemaVersion: 1,
    type: "pair",
  }));
  await expect(
    useCases.create({ actor: editor, blocks, fields: {}, modelKey: "posts", title: "Many" }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(reads).toBe(0);
});

test("nested media traversal enforces location limits, batches IDs and preserves SQLite lifecycle", async () => {
  const config = await defineConfig({
    blocks: [],
    content: [
      defineCollection({
        key: "posts",
        version: 1,
        route: "/blog/:slug",
        blocks: [],
        fields: {
          first: field.list({ item: field.media() }),
          second: field.list({ item: field.media() }),
          third: field.list({ item: field.media() }),
        },
      }),
    ],
  });
  const { connection, store } = applicationSqlite(config.runtime.content);
  seedSqliteMedia(connection, {
    tags: [],
    id: mediaId("m"),
    createdBy: editor.id,
    createdAt: unixMilliseconds(1),
    updatedAt: unixMilliseconds(1),
    filename: "m.png",
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: "media/m",
  });
  const reads: (readonly string[])[] = [];
  const useCases = new ContentUseCases({
    listQueryLimits: TEST_LIST_QUERY_LIMITS,
    config: config.runtime,
    content: store,
    media: {
      loadMedia: store.loadMedia.bind(store),
      loadMediaMany: async (ids) => {
        reads.push(ids);
        return store.loadMediaMany(ids);
      },
    },
    clock: new DeterministicClock(unixMilliseconds(2)),
    idGenerator: new DeterministicIdGenerator("nested"),
  });
  const input = {
    modelKey: "posts",
    title: "Nested",
    slug: "nested",
    blocks: [],
    fields: { first: Array(100).fill("m"), second: Array(100).fill("m") },
  };
  const created = await useCases.create({ actor: editor, ...input });
  expect(reads).toEqual([["m"]]);
  expect(persistedMediaReferences(connection, created.draft.id)).toHaveLength(200);
  expect(persistedMediaReferences(connection, created.draft.id)[99]).toMatchObject({
    fieldPath: "/first/99",
  });
  await expect(
    useCases.create({ actor: editor, ...input, fields: { ...input.fields, third: ["m"] } }),
  ).rejects.toThrow();
  const readCount = reads.length;
  await expect(
    useCases.create({ actor: { id: actorId("viewer"), role: "viewer" }, ...input }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  expect(reads).toHaveLength(readCount);
  await expect(
    useCases.create({ actor: editor, ...input, fields: { first: ["missing"] } }),
  ).rejects.toThrow();
  await useCases.publish({ actor: admin, entryId: created.id, expectedRevision: 1 });
  expect(present(present(await store.loadPublic("/blog/nested")).entry.published).fields).toEqual(
    input.fields,
  );
  const saved = await useCases.save({
    actor: editor,
    entryId: created.id,
    expectedRevision: 1,
    ...input,
    fields: { first: [], second: [] },
  });
  expect(persistedMediaReferences(connection, saved.draft.id)).toEqual([]);
  expect(
    (await useCases.revertDraft({ actor: editor, entryId: created.id, expectedRevision: 2 })).draft
      .fields,
  ).toEqual(input.fields);
});

test("detaches one media item from a draft's fields, blocks and SEO image", async () => {
  const { asset, content, create, store } = await detachFixture();
  const gallery = {
    data: { images: [{ caption: "One", image: "media-1" }, { image: "media-2" }] },
    key: blockKey("gallery"),
    position: 3000,
    schemaVersion: 1,
    type: "gallery",
  };
  const created = await create("post", {
    blocks: [asset("visible", "media-1"), asset("hidden", "media-1", 2000, true), gallery],
    fields: { cover: "media-1", photos: ["media-1", "media-2"] },
    seo: { image: "media-1", title: "Kept" },
  });
  await expect(
    content.detachMedia({
      expectedRevision: 1,
      actor: { id: actorId("viewer"), role: "viewer" },
      entryId: created.id,
      mediaId: mediaId("media-1"),
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await expect(
    content.detachMedia({
      expectedRevision: 1,
      actor: admin,
      entryId: created.id,
      mediaId: mediaId("media-1"),
    }),
  ).resolves.toBe(true);
  const draft = present(await store.load({ entryId: created.id })).draft;
  expect(draft).toMatchObject({
    fields: { photos: ["media-2"] },
    revision: 2,
    seo: { title: "Kept" },
    slug: "post",
    title: "post",
    updatedBy: { id: "admin" },
  });
  expect(draft.fields).not.toHaveProperty("cover");
  expect(draft.seo).not.toHaveProperty("image");
  expect(draft.blocks.map((block) => [block.key, block.hidden, block.data])).toEqual([
    ["visible", false, {}],
    ["hidden", true, {}],
    ["gallery", false, { images: [{ caption: "One" }, { image: "media-2" }] }],
  ]);
  expect(present(await store.loadMediaCatalogItem("media-1")).usageCount).toBe(0);
  expect(present(await store.loadMediaCatalogItem("media-2")).usageCount).toBe(1);
  await expect(
    content.detachMedia({
      expectedRevision: 1,
      actor: admin,
      entryId: created.id,
      mediaId: mediaId("media-1"),
    }),
  ).resolves.toBe(false);
  expect(present(await store.load({ entryId: created.id })).draft.revision).toBe(2);
});

test("deletion with draft detaching clears draft-only usage and queues the item", async () => {
  const { asset, deletionRequests, content, create, media } = await detachFixture();
  const first = await create("first", { fields: { cover: "media-1" } });
  const second = await create("second", { blocks: [asset("hero", "media-1")] });
  await expect(
    media.requestDeletion({ actor: editor, mediaId: mediaId("media-1") }),
  ).rejects.toMatchObject({
    code: "MEDIA_IN_USE",
  });
  const input = { actor: editor, mediaId: mediaId("media-1") };
  expect(await media.detachDeletion(input)).toEqual({
    state: "drafts",
    drafts: [first, second].map(({ id }) => ({ entryId: id, expectedRevision: 1 })),
  });
  for (const { id } of [first, second]) {
    expect(
      await media.detachDeletion({ ...input, step: "entry", entryId: id, expectedRevision: 1 }),
    ).toEqual({ state: "entry-complete", entryId: id });
    expect((await content.load({ actor: editor, entryId: id }))?.draft).toMatchObject({
      revision: 2,
      updatedBy: { id: "editor" },
    });
  }
  expect(deletionRequests()).toEqual([]);
  const finishes = await Promise.allSettled([
    media.detachDeletion({ ...input, step: "finish" }),
    media.detachDeletion({ ...input, step: "finish" }),
  ]);
  expect(finishes.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(finishes.find((r) => r.status === "fulfilled")?.value).toMatchObject({
    status: "deleting",
    usageCount: 0,
  });
  expect(deletionRequests()).toEqual(["media-1"]);
  for (const phase of [
    {},
    { step: "finish" },
    { step: "entry", entryId: first.id, expectedRevision: 1 },
  ] as const)
    await expect(media.detachDeletion({ ...input, ...phase })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
});

test.each(["publication", "limit", "stale", "replay"] as const)(
  "checks %s inside the guarded draft write",
  async (kind) => {
    const { content, create, media, store, deletionRequests } = await detachFixture();
    const input = { actor: editor, mediaId: mediaId("media-1") };
    const use = { fields: { cover: "media-1" } };
    const first = await create("first", use);
    const second = await create("second", use);
    const step = (id: typeof first.id) =>
      media.detachDeletion({ ...input, step: "entry", entryId: id, expectedRevision: 1 });
    await step(first.id);
    const save = store.saveDetachedDraft.bind(store);
    store.saveDetachedDraft = async (write) => {
      if (kind === "publication")
        await content.publish({ actor: admin, entryId: second.id, expectedRevision: 1 });
      if (kind === "limit") for (let i = 0; i < 50; i++) await create("late-" + i, use);
      if (kind === "stale" || kind === "replay")
        await content.save({
          actor: admin,
          entryId: second.id,
          expectedRevision: 1,
          title: "Concurrent",
          fields: kind === "stale" ? use.fields : {},
          blocks: [],
        });
      return save(write);
    };
    if (kind === "replay")
      await expect(step(second.id)).resolves.toMatchObject({ state: "entry-complete" });
    else
      await expect(step(second.id)).rejects.toMatchObject({
        code: kind === "stale" ? "CONTENT_REVISION_CONFLICT" : "MEDIA_IN_USE",
      });
    expect((await store.load({ entryId: first.id }))?.draft.revision).toBe(2);
    const current = await store.load({ entryId: second.id });
    expect(current?.draft.revision).toBe(kind === "stale" || kind === "replay" ? 2 : 1);
    expect(current?.draft.fields).toEqual(kind === "replay" ? {} : use.fields);
    expect(current?.published?.fields).toEqual(kind === "publication" ? use.fields : undefined);
    expect((await store.loadMedia(input.mediaId))?.status).toBe("active");
    expect(deletionRequests()).toEqual([]);
  },
);

test("new and removed owners between steps are reconciled against live usage", async () => {
  const { create, content, media, store, deletionRequests } = await detachFixture();
  const item = { mediaId: mediaId("media-1"), actor: editor };
  const used = await create("original", { fields: { cover: "media-1" } });
  await media.detachDeletion(item);
  await content.delete({ actor: admin, entryId: used.id, expectedRevision: 1 });
  await expect(
    media.detachDeletion({ ...item, step: "entry", entryId: used.id, expectedRevision: 1 }),
  ).resolves.toEqual({ state: "entry-complete", entryId: used.id });
  const late = await create("late", { fields: { cover: "media-1" } });
  await expect(media.detachDeletion({ ...item, step: "finish" })).rejects.toMatchObject({
    code: "MEDIA_IN_USE",
  });
  expect((await store.load({ entryId: late.id }))?.draft.revision).toBe(1);
  expect(deletionRequests()).toEqual([]);
  await expect(
    media.detachDeletion({
      ...item,
      mediaId: mediaId("absent"),
      step: "entry",
      entryId: contentEntryId("absent"),
      expectedRevision: 1,
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
});
