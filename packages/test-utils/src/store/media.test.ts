import type { Actor } from "@lacecms/domain";
import type { ListMediaInput, MediaSort, OpaqueCursor } from "@lacecms/application";
import { present } from "../test-support/fixtures.js";
import { expect, test } from "vitest";
import {
  DeterministicClock,
  DeterministicIdGenerator,
  InMemoryContentStore,
  InMemoryObjectStorage,
} from "../index.js";
import {
  DomainError,
  actorId,
  blockKey,
  contentModelKey,
  contentSnapshotId,
  mediaId,
  unixMilliseconds,
} from "@lacecms/domain";

import {
  collectMediaBytes,
  ContentUseCases,
  detectMediaMimeType,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  MAX_MEDIA_BYTES,
  MediaUseCases,
  sanitizeMediaFilename,
} from "@lacecms/application";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import {
  admin,
  editor,
  read,
  binaryStream,
  png,
  entry,
  mediaUsageEntry,
  imageBlock,
  seedMediaCatalog,
  detachFixture,
} from "../test-support/fixtures.js";

test("validates portable media byte policy and sanitizes display names", async () => {
  expect(detectMediaMimeType(png)).toBe("image/png");
  expect(detectMediaMimeType(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
  expect(() => detectMediaMimeType(new Uint8Array())).toThrow(/must not be empty/u);
  expect(() => detectMediaMimeType(new TextEncoder().encode("<svg/>"))).toThrow(
    /not an allowed image format/u,
  );
  expect(sanitizeMediaFilename(" ../../\u0000 invoice\n.png ")).toBe(".. .. invoice .png");
  await expect(
    collectMediaBytes(binaryStream(new Uint8Array(MAX_MEDIA_BYTES + 1))),
  ).rejects.toThrow(/10 MiB/u);
});

test("orchestrates verified media creation and keeps storage keys private", async () => {
  const store = new InMemoryContentStore();
  const storage = new InMemoryObjectStorage();
  const logs: { code: string; storageKey: string }[] = [];
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(5)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: {
      async inspect(bytes, mimeType) {
        expect(bytes).toEqual(png);
        expect(mimeType).toBe("image/png");
        return { height: 4, width: 3 };
      },
    },
    logger: {
      error: (event) => {
        logs.push(event);
      },
    },
    media: store,
    storage,
  });

  const created = await media.create({
    actor: editor,
    body: binaryStream(png),
    filename: "../cover\r\n.png",
  });
  expect(created).toMatchObject({
    filename: ".. cover .png",
    height: 4,
    id: "media-1",
    mimeType: "image/png",
    status: "active",
    width: 3,
  });
  expect(created).not.toHaveProperty("storageKey");
  expect(await storage.get("media/media-1")).not.toBeNull();
  expect(logs).toEqual([]);

  const viewer: Actor = { id: actorId("viewer"), role: "viewer" };
  await expect(
    media.create({ actor: viewer, body: binaryStream(png), filename: "denied.png" }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await expect(media.get({ actor: viewer, mediaId: created.id })).resolves.toMatchObject({
    id: created.id,
  });
  await expect(media.list({ actor: viewer, limit: 10 })).resolves.toMatchObject({
    items: [{ id: created.id }],
  });
  await expect(
    media.requestDeletion({ actor: editor, mediaId: created.id }),
  ).resolves.toMatchObject({
    id: created.id,
    status: "deleting",
  });
  expect(await storage.get("media/media-1")).not.toBeNull();
  await expect(media.requestDeletion({ actor: viewer, mediaId: created.id })).rejects.toMatchObject(
    { code: "AUTHORIZATION_DENIED" },
  );
});

test("cleans up a stored object and logs only its opaque key when metadata creation fails", async () => {
  const store = new InMemoryContentStore();
  store.createMedia = async () => {
    throw new Error("database unavailable");
  };
  const storage = new InMemoryObjectStorage();
  const logs: { code: string; storageKey: string }[] = [];
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(5)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: {
      async inspect() {
        return { height: 1, width: 1 };
      },
    },
    logger: {
      error: (event) => {
        logs.push(event);
      },
    },
    media: store,
    storage,
  });

  await expect(
    media.create({ actor: editor, body: binaryStream(png), filename: "secret.png" }),
  ).rejects.toThrow("database unavailable");
  expect(await storage.get("media/media-1")).toBeNull();
  expect(logs).toEqual([{ code: "MEDIA_METADATA_CREATE_FAILED", storageKey: "media/media-1" }]);
});

test("reads eligible media binaries without exposing storage locations", async () => {
  const store = new InMemoryContentStore();
  const storage = new InMemoryObjectStorage();
  const id = mediaId("published-media");
  store.registerMedia({
    tags: [],
    createdAt: unixMilliseconds(1),
    createdBy: editor.id,
    filename: "cover.png",
    height: 1,
    id,
    mimeType: "image/png",
    size: 3,
    status: "active",
    storageKey: "media/private-published-media",
    updatedAt: unixMilliseconds(1),
    width: 1,
  });
  await storage.put({
    body: binaryStream(new Uint8Array([1, 2, 3])),
    contentType: "image/png",
    key: "media/private-published-media",
  });
  let publiclyEligible = false;
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(1)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: {
      async inspect() {
        return { height: 1, width: 1 };
      },
    },
    logger: { error() {} },
    media: store,
    publicMedia: {
      async loadPublicMedia(mediaId_) {
        return publiclyEligible ? store.loadMedia(mediaId_) : null;
      },
    },
    storage,
  });
  const viewer: Actor = { id: actorId("viewer"), role: "viewer" };
  const preview = await media.preview({ actor: viewer, mediaId: id });
  expect(preview).toMatchObject({ filename: "cover.png", mimeType: "image/png" });
  expect(preview).not.toHaveProperty("storageKey");
  expect(await read(present(preview).body)).toBe("\u0001\u0002\u0003");
  await expect(media.readPublic({ mediaId: id })).resolves.toBeNull();
  publiclyEligible = true;
  const publicBinary = await media.readPublic({ mediaId: id });
  expect(await read(present(publicBinary).body)).toBe("\u0001\u0002\u0003");
  await storage.delete("media/private-published-media");
  await expect(media.preview({ actor: viewer, mediaId: id })).rejects.toThrow(
    "Stored media object is unavailable.",
  );
});

test("enforces image dimensions and authorized deletion lifecycle operations", async () => {
  const store = new InMemoryContentStore();
  let dimensions = { height: 1, width: MAX_IMAGE_DIMENSION + 1 };
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(9)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: {
      async inspect() {
        return dimensions;
      },
    },
    logger: { error() {} },
    media: store,
    storage: new InMemoryObjectStorage(),
  });
  await expect(
    media.create({ actor: editor, body: binaryStream(png), filename: "large.png" }),
  ).rejects.toThrow(/dimensions/u);
  dimensions = { height: 10_001, width: 10_000 };
  await expect(
    media.create({ actor: editor, body: binaryStream(png), filename: "many-pixels.png" }),
  ).rejects.toThrow(/dimensions/u);
  dimensions = { height: 10_000, width: 10_000 };
  await expect(
    media.create({ actor: editor, body: binaryStream(png), filename: "boundary.png" }),
  ).resolves.toMatchObject({ height: 10_000, width: 10_000 });

  store.registerMedia({
    tags: [],
    createdAt: unixMilliseconds(1),
    createdBy: editor.id,
    filename: "retry.png",
    height: 1,
    id: mediaId("retry-media"),
    mimeType: "image/png",
    size: 1,
    status: "delete_failed",
    storageKey: "media/retry-media",
    updatedAt: unixMilliseconds(1),
    width: 1,
  });
  await expect(
    media.retryDeletion({ actor: editor, mediaId: mediaId("retry-media") }),
  ).resolves.toMatchObject({ id: "retry-media", status: "deleting" });
  expect(MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION).toBeGreaterThan(MAX_IMAGE_PIXELS);
});

test("rejects truncated and polyglot image containers before object storage", async () => {
  for (const bytes of [png, new Uint8Array([...png, 0x3c, 0x73, 0x76, 0x67, 0x3e])]) {
    const writes: string[] = [];
    const media = new MediaUseCases({
      clock: new DeterministicClock(unixMilliseconds(5)),
      idGenerator: new DeterministicIdGenerator("media"),
      imageInspector: {
        async inspect() {
          throw new Error("container is malformed or contains trailing data");
        },
      },
      logger: { error() {} },
      media: new InMemoryContentStore(),
      storage: {
        async get() {
          return null;
        },
        async createReadUrl() {
          return "memory://unused";
        },
        async delete() {},
        async put(input) {
          writes.push(input.key);
          return { contentType: input.contentType, key: input.key, size: bytes.byteLength };
        },
      },
    });
    await expect(
      media.create({ actor: editor, body: binaryStream(bytes), filename: "spoofed.png" }),
    ).rejects.toThrow(/container/u);
    expect(writes).toEqual([]);
  }
});

test("records cleanup failure without leaking a metadata-write error", async () => {
  const store = new InMemoryContentStore();
  store.createMedia = async () => {
    throw new Error("untrusted database detail");
  };
  const logs: { code: string; storageKey: string }[] = [];
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(5)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: {
      async inspect() {
        return { height: 1, width: 1 };
      },
    },
    logger: {
      error: (event) => {
        logs.push(event);
      },
    },
    media: store,
    storage: {
      async get() {
        return null;
      },
      async createReadUrl() {
        return "memory://unused";
      },
      async delete() {
        throw new Error("storage credentials must not be logged");
      },
      async put(input) {
        return { contentType: input.contentType, key: input.key, size: png.byteLength };
      },
    },
  });

  await expect(
    media.create({ actor: editor, body: binaryStream(png), filename: "private.png" }),
  ).rejects.toThrow("untrusted database detail");
  expect(logs).toEqual([
    { code: "MEDIA_METADATA_CREATE_FAILED", storageKey: "media/media-1" },
    { code: "MEDIA_OBJECT_CLEANUP_FAILED", storageKey: "media/media-1" },
  ]);
});

test("in-memory persistence refuses a new reference after media deletion commits", async () => {
  const store = new InMemoryContentStore();
  const id = mediaId("deleting-media");
  store.registerMedia({
    tags: [],
    createdAt: unixMilliseconds(1),
    createdBy: editor.id,
    filename: "image.png",
    id,
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: "media/deleting-media",
    updatedAt: unixMilliseconds(1),
  });
  await store.markForDeletion({
    mediaId: id,
    requestedAt: unixMilliseconds(2),
    requestedBy: editor,
  });
  await expect(
    store.create({
      entry: entry({
        id: "deleting-reference",
        model: { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" },
        slug: "deleting-reference",
      }),
      mediaReferences: [{ fieldPath: "image", mediaId: id, sourceKey: "$fields" }],
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
});

test("marks only unreferenced active media for independent deletion", async () => {
  const store = new InMemoryContentStore();
  store.registerMedia({
    tags: [],
    createdAt: unixMilliseconds(1),
    createdBy: admin.id,
    filename: "unused.png",
    id: mediaId("unused-media"),
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: "media/unused",
    updatedAt: unixMilliseconds(1),
  });
  await expect(
    store.markForDeletion({
      mediaId: mediaId("unused-media"),
      requestedAt: unixMilliseconds(2),
      requestedBy: admin,
    }),
  ).resolves.toMatchObject({
    media: { status: "deleting", updatedAt: 2 },
    status: "deleting",
  });
  expect(store.mediaDeletionRequests).toEqual(["unused-media"]);
});

test("rebuilds complete-draft media projections instead of retaining stale references", async () => {
  const config = await defineConfig({
    blocks: [],
    content: [
      definePage({
        blocks: [],
        fields: { image: field.media() },
        key: "home",
        path: "/",
        version: 1,
      }),
    ],
  });
  const store = new InMemoryContentStore();
  store.registerMedia({
    tags: [],
    createdAt: unixMilliseconds(1),
    createdBy: editor.id,
    filename: "attached.png",
    id: mediaId("attached-media"),
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: "media/attached-media",
    updatedAt: unixMilliseconds(1),
  });
  const useCases = new ContentUseCases({
    clock: new DeterministicClock(unixMilliseconds(2)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("content"),
    media: store,
  });
  const created = await useCases.create({
    actor: editor,
    blocks: [],
    fields: { image: "attached-media" },
    modelKey: "home",
    title: "Home",
  });
  expect(store.mediaReferences(created.draft.id)).toEqual([
    { fieldPath: "image", mediaId: mediaId("attached-media"), sourceKey: "$fields" },
  ]);
  const saved = await useCases.save({
    actor: editor,
    blocks: [],
    entryId: created.id,
    expectedRevision: 1,
    fields: {},
    title: "Home",
  });
  expect(store.mediaReferences(saved.draft.id)).toEqual([]);
  await expect(
    store.markForDeletion({
      mediaId: mediaId("attached-media"),
      requestedAt: unixMilliseconds(3),
      requestedBy: editor,
    }),
  ).resolves.toMatchObject({ status: "deleting" });
});

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

test("derives in-memory media usage and in-use refusals from current snapshots", async () => {
  const store = new InMemoryContentStore();
  seedMediaCatalog(store);
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
  expect(store.mediaDeletionRequests).toEqual([]);
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
  const store = new InMemoryContentStore();
  let reads = 0;
  let writes = 0;
  const create = store.create.bind(store);
  store.create = async (input) => {
    writes++;
    return create(input);
  };
  const useCases = new ContentUseCases({
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
    clock: new DeterministicClock(unixMilliseconds(1)),
    config: config.runtime,
    content: new InMemoryContentStore(),
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
    clock: new DeterministicClock(unixMilliseconds(1)),
    config: config.runtime,
    content: new InMemoryContentStore(),
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

test("nested media traversal enforces location limits, batches IDs and preserves fake lifecycle", async () => {
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
  const store = new InMemoryContentStore();
  store.registerMedia({
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
  expect(store.mediaReferences(created.draft.id)).toHaveLength(200);
  expect(store.mediaReferences(created.draft.id)[99]).toMatchObject({ fieldPath: "/first/99" });
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
  expect(store.mediaReferences(saved.draft.id)).toEqual([]);
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
      actor: { id: actorId("viewer"), role: "viewer" },
      entryId: created.id,
      mediaId: mediaId("media-1"),
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await expect(
    content.detachMedia({ actor: admin, entryId: created.id, mediaId: mediaId("media-1") }),
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
    content.detachMedia({ actor: admin, entryId: created.id, mediaId: mediaId("media-1") }),
  ).resolves.toBe(false);
  expect(present(await store.load({ entryId: created.id })).draft.revision).toBe(2);
});

test("deletion with draft detaching clears draft-only usage and queues the item", async () => {
  const { asset, content, create, media, store } = await detachFixture();
  const first = await create("first", { fields: { cover: "media-1" } });
  const second = await create("second", { blocks: [asset("hero", "media-1")] });
  await expect(
    media.requestDeletion({ actor: editor, mediaId: mediaId("media-1") }),
  ).rejects.toMatchObject({
    code: "MEDIA_IN_USE",
  });
  await expect(
    media.requestDeletion({ actor: editor, detach: "drafts", mediaId: mediaId("media-1") }),
  ).resolves.toMatchObject({ status: "deleting", usageCount: 0 });
  for (const { id } of [first, second]) {
    expect(present(await content.load({ actor: editor, entryId: id })).draft).toMatchObject({
      revision: 2,
      updatedBy: { id: "editor" },
    });
  }
  expect(store.mediaDeletionRequests).toEqual(["media-1"]);
});

test("draft detaching refuses published usage, inactive media and missing ports before any draft change", async () => {
  const { asset, content, create, media, mediaDependencies, store } = await detachFixture();
  const published = await create("published", { blocks: [asset("hero", "media-1")] });
  const draftOnly = await create("draft", { fields: { cover: "media-1" } });
  await content.publish({ actor: admin, entryId: published.id, expectedRevision: 1 });
  await expect(
    media.requestDeletion({ actor: editor, detach: "drafts", mediaId: mediaId("media-1") }),
  ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
  for (const { id } of [published, draftOnly]) {
    expect(present(await store.load({ entryId: id })).draft.revision).toBe(1);
  }
  await expect(
    media.requestDeletion({
      actor: { id: actorId("viewer"), role: "viewer" },
      detach: "drafts",
      mediaId: mediaId("media-1"),
    }),
  ).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  await expect(
    new MediaUseCases(mediaDependencies).requestDeletion({
      actor: editor,
      detach: "drafts",
      mediaId: mediaId("media-2"),
    }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  await media.requestDeletion({ actor: editor, mediaId: mediaId("media-2") });
  await expect(
    media.requestDeletion({ actor: editor, detach: "drafts", mediaId: mediaId("media-2") }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(store.mediaDeletionRequests).toEqual(["media-2"]);
});

test("draft detaching stops on a concurrent save, too many entries or a new reference", async () => {
  const { content, create, media, mediaDependencies, store } = await detachFixture();
  const first = await create("first", { fields: { cover: "media-1" } });
  const second = await create("second", { fields: { cover: "media-1" } });
  const conflicting = new MediaUseCases({
    ...mediaDependencies,
    drafts: {
      async detachMedia(input) {
        throw new DomainError("CONTENT_REVISION_CONFLICT", `Conflict for ${input.entryId}.`);
      },
    },
  });
  await expect(
    conflicting.requestDeletion({ actor: editor, detach: "drafts", mediaId: mediaId("media-1") }),
  ).rejects.toMatchObject({ code: "CONTENT_REVISION_CONFLICT" });
  expect(present(await store.loadMediaCatalogItem("media-1")).media.status).toBe("active");

  const loaded = await store.loadMediaCatalogItem("media-1");
  const truncated = new MediaUseCases({
    ...mediaDependencies,
    drafts: { detachMedia: async () => expect.unreachable() },
    media: Object.create(store, {
      loadMediaCatalogItem: { value: async () => ({ ...loaded, usageCount: 51 }) },
    }),
  });
  await expect(
    truncated.requestDeletion({ actor: editor, detach: "drafts", mediaId: mediaId("media-1") }),
  ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
  for (const { id } of [first, second]) {
    expect(present(await store.load({ entryId: id })).draft.revision).toBe(1);
  }

  let late: Awaited<ReturnType<typeof create>> | undefined;
  const racing = new MediaUseCases({
    ...mediaDependencies,
    drafts: {
      async detachMedia(input) {
        await content.detachMedia(input);
        late ??= await create("late", { fields: { cover: "media-1" } });
      },
    },
  });
  await expect(
    racing.requestDeletion({ actor: editor, detach: "drafts", mediaId: mediaId("media-1") }),
  ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
  expect(present(await store.loadMediaCatalogItem("media-1")).media.status).toBe("active");
  expect(present(await store.load({ entryId: present(late).id })).draft.fields).toEqual({
    cover: "media-1",
  });
  expect(store.mediaDeletionRequests).toEqual([]);
  await expect(
    media.requestDeletion({ actor: editor, detach: "drafts", mediaId: mediaId("media-1") }),
  ).resolves.toMatchObject({ status: "deleting" });
});
