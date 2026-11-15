import type { ListMediaInput, MediaSort, OpaqueCursor } from "@lacecms/application";
import { present } from "../test-support/fixtures.js";
import { expect, test } from "vitest";
import { DeterministicIdGenerator, InMemoryContentStore, InMemoryObjectStorage } from "../index.js";
import { contentSnapshotId, mediaId, unixMilliseconds } from "@lacecms/domain";

import { MediaUseCases } from "@lacecms/application";

import { editor, mediaUsageEntry, seedMediaCatalog } from "../test-support/fixtures.js";

test("mirrors Node media search, type filter, sorts, and query-bound cursors in memory", async () => {
  const store = new InMemoryContentStore();
  seedMediaCatalog(store);
  const ids = async (input: Partial<ListMediaInput>) =>
    (await store.listMedia({ limit: 100, sort: "-createdAt", ...input })).items.map(
      (item) => item.media.id,
    );
  const all = await store.listMedia({ limit: 100, sort: "-createdAt" });
  expect(all.items.find((item) => item.media.id === "m-a")).toMatchObject({
    createdBy: { displayName: "Ada", id: "editor" },
    usageCount: 0,
  });
  expect(present(all.items.find((item) => item.media.id === "m-b")).createdBy.displayName).toBe(
    "Unknown user",
  );
  expect(present(all.items.find((item) => item.media.id === "m-c")).createdBy.displayName).toBe(
    "System",
  );
  expect(await ids({ q: "cover" })).toEqual(["m-b", "m-e", "m-a"]);
  expect(await ids({ q: "COVER", type: "image/png" })).toEqual(["m-e", "m-a"]);
  expect(await ids({ q: "%" })).toEqual(["m-c"]);
  expect(await ids({ q: "o_f" })).toEqual([]);
  const expectedOrders = {
    "-createdAt": ["m-d", "m-c", "m-b", "m-e", "m-a"],
    "-filename": ["m-e", "m-a", "m-b", "m-d", "m-c"],
    "-size": ["m-e", "m-a", "m-d", "m-c", "m-b"],
    createdAt: ["m-a", "m-e", "m-b", "m-c", "m-d"],
    filename: ["m-c", "m-d", "m-b", "m-a", "m-e"],
    size: ["m-b", "m-c", "m-d", "m-a", "m-e"],
  };
  for (const [sort, expected] of Object.entries(expectedOrders) as [MediaSort, string[]][]) {
    const paged = [];
    let after: OpaqueCursor | undefined;
    do {
      const page = await store.listMedia({ limit: 1, sort, ...(after ? { after } : {}) });
      paged.push(...page.items.map((item) => item.media.id));
      after = page.nextCursor;
    } while (after !== undefined);
    expect(paged).toEqual(expected);
  }
  const first = await store.listMedia({ limit: 1, sort: "filename" });
  for (const mismatch of [
    { sort: "-createdAt" },
    { sort: "filename", type: "image/png" },
  ] as const) {
    await expect(
      store.listMedia({ limit: 1, after: present(first.nextCursor), ...mismatch }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  }
});

test("updates media metadata in memory and requests a build only for published usage", async () => {
  const store = new InMemoryContentStore();
  seedMediaCatalog(store);
  let now = 100;
  const media = new MediaUseCases({
    clock: { now: () => unixMilliseconds(now) },
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: { inspect: async () => ({ height: 1, width: 1 }) },
    logger: { error() {} },
    media: store,
    storage: new InMemoryObjectStorage(),
  });
  const published = mediaUsageEntry("e-pub", { fields: { cover: "m-a" }, updatedAt: 20 });
  await store.create({
    entry: published,
    mediaReferences: [{ fieldPath: "cover", mediaId: mediaId("m-a"), sourceKey: "$fields" }],
  });
  await store.publish({
    entryId: published.id,
    expectedRevision: 1,
    publishedAt: unixMilliseconds(30),
    publishedBy: editor,
    publishedSnapshotId: contentSnapshotId("e-pub-published"),
  });
  await store.create({
    entry: mediaUsageEntry("e-draft", { fields: { cover: "m-d" }, updatedAt: 40 }),
    mediaReferences: [{ fieldPath: "cover", mediaId: mediaId("m-d"), sourceKey: "$fields" }],
  });
  const version = await store.publishedContentVersion();

  const drafted = await media.updateMetadata({
    actor: editor,
    expectedUpdatedAt: unixMilliseconds(12),
    mediaId: mediaId("m-d"),
    patch: { focalPoint: { x: 0.2, y: 0.8 } },
  });
  expect(drafted).toMatchObject({
    build: { status: "not-dispatched" },
    media: { focalPoint: { x: 0.2, y: 0.8 }, updatedAt: 100 },
  });
  expect(await store.publishedContentVersion()).toBe(version);

  const live = await media.updateMetadata({
    actor: editor,
    expectedUpdatedAt: unixMilliseconds(10),
    mediaId: mediaId("m-a"),
    patch: { alt: "  Red bicycle  ", caption: "A\r\nbike" },
  });
  expect(live).toEqual({
    build: { status: "queued", targetVersion: version + 1 },
    media: expect.objectContaining({ alt: "Red bicycle", caption: "A\nbike", updatedAt: 100 }),
  });
  expect(store.mediaMetadataBuildRequests).toEqual([version + 1]);

  // Same-millisecond edits still produce a new version tag.
  const again = present(
    await media.updateMetadata({
      actor: editor,
      expectedUpdatedAt: unixMilliseconds(100),
      mediaId: mediaId("m-a"),
      patch: { alt: null, caption: "" },
    }),
  );
  expect(again.media.updatedAt).toBe(101);
  expect(again.media).not.toHaveProperty("alt");
  expect(again.media).not.toHaveProperty("caption");
  await expect(
    media.updateMetadata({
      actor: editor,
      expectedUpdatedAt: unixMilliseconds(100),
      mediaId: mediaId("m-a"),
      patch: { alt: "Stale" },
    }),
  ).rejects.toMatchObject({ code: "MEDIA_UPDATE_CONFLICT" });

  // An unchanged submission on published media writes nothing.
  now = 500;
  await expect(
    media.updateMetadata({
      actor: editor,
      expectedUpdatedAt: unixMilliseconds(101),
      mediaId: mediaId("m-a"),
      patch: { alt: null },
    }),
  ).resolves.toMatchObject({ build: { status: "not-dispatched" }, media: { updatedAt: 101 } });
  expect(store.mediaMetadataBuildRequests).toEqual([version + 1, version + 2]);

  // Unused media changes nothing public; media being deleted cannot be edited.
  await media.updateMetadata({
    actor: editor,
    expectedUpdatedAt: unixMilliseconds(10),
    mediaId: mediaId("m-e"),
    patch: { alt: "Unused" },
  });
  expect(await store.publishedContentVersion()).toBe(version + 2);
  await store.markForDeletion({
    mediaId: mediaId("m-b"),
    requestedAt: unixMilliseconds(600),
    requestedBy: editor,
  });
  await expect(
    media.updateMetadata({
      actor: editor,
      expectedUpdatedAt: unixMilliseconds(600),
      mediaId: mediaId("m-b"),
      patch: { alt: "Gone" },
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  await expect(
    store.updateMediaMetadata({
      alt: "x",
      caption: null,
      expectedUpdatedAt: unixMilliseconds(600),
      focalPoint: null,
      mediaId: mediaId("m-b"),
      requestedBy: editor,
      updatedAt: unixMilliseconds(601),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  await expect(
    media.updateMetadata({
      actor: editor,
      expectedUpdatedAt: unixMilliseconds(1),
      mediaId: mediaId("missing"),
      patch: { alt: "x" },
    }),
  ).resolves.toBeNull();
  const listed = await media.list({ actor: editor, limit: 10 });
  expect(present(listed.items.find((item) => item.id === "m-d")).focalPoint).toEqual({
    x: 0.2,
    y: 0.8,
  });
});
