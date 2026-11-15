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
import { actorId, contentModelKey, mediaId, unixMilliseconds } from "@lacecms/domain";

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
import { defineConfig, definePage } from "@lacecms/config";
import { field } from "@lacecms/content";
import {
  admin,
  editor,
  read,
  binaryStream,
  png,
  entry,
  postsRoute,
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
  const { store } = repositorySqlite();
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
  const { store } = repositorySqlite();
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
  const { connection, store } = repositorySqlite();
  const storage = new InMemoryObjectStorage();
  const id = mediaId("published-media");
  seedSqliteMedia(connection, {
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
  const { connection, store } = repositorySqlite();
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

  seedSqliteMedia(connection, {
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
      media: repositorySqlite().store,
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
  const { store } = repositorySqlite();
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

test("SQLite persistence refuses a new reference after media deletion commits", async () => {
  const { connection, store } = repositorySqlite(postsRoute);
  const id = mediaId("deleting-media");
  seedSqliteMedia(connection, {
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
  const { connection, store } = repositorySqlite();
  seedSqliteMedia(connection, {
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
  expect(requestedMediaDeletions(connection)).toEqual(["unused-media"]);
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
  const { connection, store } = applicationSqlite(config.runtime.content);
  seedSqliteMedia(connection, {
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
    listQueryLimits: TEST_LIST_QUERY_LIMITS,
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
  expect(persistedMediaReferences(connection, created.draft.id)).toEqual([
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
  expect(persistedMediaReferences(connection, saved.draft.id)).toEqual([]);
  await expect(
    store.markForDeletion({
      mediaId: mediaId("attached-media"),
      requestedAt: unixMilliseconds(3),
      requestedBy: editor,
    }),
  ).resolves.toMatchObject({ status: "deleting" });
});
