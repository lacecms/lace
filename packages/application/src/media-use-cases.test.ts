// @ts-nocheck
// TODO(rf2): Type partial media/storage ports, mutable catalog fixtures and malformed upload inputs.
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { MediaUseCases } from "./index.js";
import { DomainError } from "@lacecms/domain";

const mediaEditor = { id: "editor-1", role: "editor" };

const mediaViewer = { id: "viewer-1", role: "viewer" };

const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function mediaRecord(overrides = {}) {
  return {
    createdAt: 1,
    createdBy: "editor-1",
    filename: "cover.png",
    height: 2,
    id: "media-1",
    mimeType: "image/png",
    size: 12,
    status: "active",
    storageKey: "media/media-1",
    updatedAt: 1,
    width: 3,
    ...overrides,
  };
}

function catalogItem(overrides = {}) {
  return {
    createdBy: { displayName: "Ada", id: "editor-1" },
    media: mediaRecord(overrides),
    usageCount: 0,
  };
}

function mediaUseCases(media, overrides = {}) {
  return new MediaUseCases({
    clock: { now: () => 5 },
    idGenerator: { next: () => "media-1" },
    imageInspector: { inspect: async () => ({ height: 2, width: 3 }) },
    logger: { error() {} },
    media,
    storage: {
      async delete() {},
      async get() {
        return null;
      },
      async put(input) {
        return { contentType: input.contentType, key: input.key, size: pngBytes.byteLength };
      },
    },
    ...overrides,
  });
}

function bytes(value) {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    },
  };
}

test("validates and defaults media list queries before reading", async () => {
  const reads = [];
  const media = mediaUseCases({
    async listMedia(input) {
      reads.push(input);
      return { items: [catalogItem({ id: "media-2" })] };
    },
  });
  await expect(media.list({ actor: mediaViewer, limit: 10 })).resolves.toEqual({
    items: [
      expect.objectContaining({
        createdBy: { displayName: "Ada", id: "editor-1" },
        id: "media-2",
        usageCount: 0,
      }),
    ],
  });
  expect(reads).toEqual([{ limit: 10, sort: "-createdAt", tags: [] }]);
  expect(reads[0]).not.toHaveProperty("q");

  await media.list({
    actor: mediaViewer,
    limit: 5,
    q: "  Cover  ",
    sort: "size",
    type: "image/png",
  });
  expect(reads[1]).toEqual({ limit: 5, q: "Cover", sort: "size", type: "image/png", tags: [] });
  await media.list({ actor: mediaViewer, limit: 5, q: "   " });
  expect(reads[2]).toEqual({ limit: 5, sort: "-createdAt", tags: [] });

  for (const query of [{ q: "x".repeat(201) }, { type: "image/svg+xml" }, { sort: "width" }]) {
    await expect(media.list({ actor: mediaViewer, limit: 5, ...query })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
  }
  expect(reads).toHaveLength(3);
});

test("returns media details with bounded usage and uploader names", async () => {
  const usage = Array.from({ length: 51 }, (_, index) => ({
    entryId: `post-${index}`,
    locations: [{ field: "cover", source: "field", states: ["draft", "published"] }],
    modelKey: "posts",
    status: "published",
    title: `Post ${index}`,
  }));
  const requests = [];
  const media = mediaUseCases({
    async loadMediaCatalogItem(id) {
      return id === "media-1" ? { ...catalogItem(), usageCount: 51 } : null;
    },
    async loadMediaUsage(input) {
      requests.push(input);
      return usage;
    },
  });
  const detail = await media.get({ actor: mediaViewer, mediaId: "media-1" });
  expect(detail).toMatchObject({
    createdBy: { displayName: "Ada", id: "editor-1" },
    id: "media-1",
    usageCount: 51,
  });
  expect(detail).not.toHaveProperty("storageKey");
  expect(detail.usage).toHaveLength(50);
  expect(detail.usage[0]).toEqual(usage[0]);
  expect(requests).toEqual([{ limit: 50, mediaId: "media-1" }]);
  await expect(media.get({ actor: mediaViewer, mediaId: "missing" })).resolves.toBeNull();
});

test("reloads catalog views after create and deletion commands", async () => {
  const cleanup = [];
  const loads = [];
  let reload = catalogItem();
  const port = {
    async createMedia(input) {
      return mediaRecord({ id: input.id });
    },
    async loadMediaCatalogItem(id) {
      loads.push(id);
      return reload;
    },
    async markForDeletion() {
      return { media: mediaRecord({ status: "deleting" }), status: "deleting" };
    },
    async retryDeletion() {
      throw new DomainError("MEDIA_IN_USE", "Media is still referenced by content.");
    },
  };
  const media = mediaUseCases(port, {
    storage: {
      async delete(key) {
        cleanup.push(key);
      },
      async put(input) {
        return { contentType: input.contentType, key: input.key, size: pngBytes.byteLength };
      },
    },
  });
  await expect(
    media.create({ actor: mediaEditor, body: bytes(pngBytes), filename: "cover.png" }),
  ).resolves.toMatchObject({ createdBy: { displayName: "Ada" }, usageCount: 0 });
  reload = { ...catalogItem({ status: "deleting" }), usageCount: 0 };
  await expect(
    media.requestDeletion({ actor: mediaEditor, mediaId: "media-1" }),
  ).resolves.toMatchObject({ status: "deleting", usageCount: 0 });
  await expect(
    media.retryDeletion({ actor: mediaEditor, mediaId: "media-1" }),
  ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
  expect(loads).toEqual(["media-1", "media-1"]);

  reload = null;
  await expect(
    media.create({ actor: mediaEditor, body: bytes(pngBytes), filename: "cover.png" }),
  ).rejects.toThrow("Created media could not be reloaded.");
  expect(cleanup).toEqual([]);
});

test("resolves media binary eligibility without reading object storage", async () => {
  const storageReads = [];
  const records = {
    "media-1": mediaRecord(),
    deleting: mediaRecord({ id: "deleting", status: "deleting" }),
  };
  const media = mediaUseCases(
    {
      async loadMedia(id) {
        return records[id] ?? null;
      },
    },
    {
      publicMedia: {
        async loadPublicMedia(id) {
          return id === "media-1" ? records[id] : null;
        },
      },
      storage: {
        async delete() {},
        async get(key) {
          storageReads.push(key);
          return key === "media/media-1" ? bytes(pngBytes) : null;
        },
        async put() {
          throw new Error("unused");
        },
      },
    },
  );
  await expect(media.resolvePublic({ mediaId: "media-1" })).resolves.toMatchObject({
    id: "media-1",
    storageKey: "media/media-1",
  });
  await expect(media.resolvePublic({ mediaId: "deleting" })).resolves.toBeNull();
  await expect(media.resolvePublic({ mediaId: "missing" })).resolves.toBeNull();
  await expect(
    media.resolvePreview({ actor: mediaViewer, mediaId: "media-1" }),
  ).resolves.toMatchObject({ id: "media-1" });
  await expect(
    media.resolvePreview({ actor: mediaViewer, mediaId: "deleting" }),
  ).resolves.toBeNull();
  expect(storageReads).toEqual([]);
  const binary = await media.readPublic({ mediaId: "media-1" });
  expect(binary).toMatchObject({ filename: "cover.png", mimeType: "image/png" });
  await expect(media.preview({ actor: mediaViewer, mediaId: "deleting" })).resolves.toBeNull();
  expect(storageReads).toEqual(["media/media-1"]);
});

test("validates media metadata patches before any read and merges onto stored values", async () => {
  const reads = [];
  const writes = [];
  let stored = mediaRecord({ alt: "Old alt", focalPoint: { x: 0.1, y: 0.2 }, updatedAt: 9 });
  const port = {
    async loadMedia(id) {
      reads.push(id);
      return id === "media-1" ? stored : null;
    },
    async loadMediaCatalogItem() {
      return { ...catalogItem(), media: stored };
    },
    async updateMediaMetadata(input) {
      writes.push(input);
      const { alt, caption, focalPoint, updatedAt } = input;
      stored = mediaRecord({
        ...(alt === null ? {} : { alt }),
        ...(caption === null ? {} : { caption }),
        ...(focalPoint === null ? {} : { focalPoint }),
        updatedAt,
      });
      return { media: stored, targetVersion: 4 };
    },
  };
  const media = mediaUseCases(port);
  const update = (patch, overrides = {}) =>
    media.updateMetadata({
      actor: mediaEditor,
      expectedUpdatedAt: 9,
      mediaId: "media-1",
      patch,
      ...overrides,
    });

  await expect(update({ alt: "x" }, { actor: mediaViewer })).rejects.toMatchObject({
    code: "AUTHORIZATION_DENIED",
  });
  for (const patch of [
    {},
    { title: "x" },
    { alt: "x".repeat(1001) },
    { alt: "line\nbreak" },
    { caption: "tab\there" },
    { caption: "x".repeat(2001) },
    { alt: "\ud800" },
    { alt: 4 },
    { focalPoint: { x: 1.2, y: 0.5 } },
    { focalPoint: { x: 0.5 } },
    { focalPoint: { x: 0.5, y: 0.5, z: 0 } },
    { focalPoint: { x: Number.NaN, y: 0 } },
  ]) {
    await expect(update(patch)).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  }
  expect(reads).toEqual([]);

  await expect(update({ alt: "x" }, { mediaId: "missing" })).resolves.toBeNull();
  await expect(update({ alt: "x" }, { expectedUpdatedAt: 8 })).rejects.toMatchObject({
    code: "MEDIA_UPDATE_CONFLICT",
  });
  // An unchanged submission (after trimming) writes nothing.
  await expect(update({ alt: "  Old alt ", focalPoint: { x: 0.1, y: 0.2 } })).resolves.toEqual({
    build: { status: "not-dispatched" },
    media: expect.objectContaining({ alt: "Old alt", updatedAt: 9 }),
  });
  expect(writes).toEqual([]);

  // The clock (5) is behind the stored version, so the next version is expected + 1.
  await expect(update({ caption: " Line\r\nTwo ", focalPoint: null })).resolves.toEqual({
    build: { status: "queued", targetVersion: 4 },
    media: expect.objectContaining({ alt: "Old alt", caption: "Line\nTwo", updatedAt: 10 }),
  });
  expect(writes).toEqual([
    {
      tags: [],
      publishedEffect: true,
      alt: "Old alt",
      caption: "Line\nTwo",
      expectedUpdatedAt: 9,
      focalPoint: null,
      mediaId: "media-1",
      requestedBy: mediaEditor,
      updatedAt: 10,
    },
  ]);

  stored = mediaRecord({ status: "deleting", updatedAt: 9 });
  await expect(update({ alt: "x" })).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(writes).toHaveLength(1);
});

test("media tags validate before I/O, preserve authorization, and separate build effects", async () => {
  let reads = 0;
  const writes = [];
  let stored = mediaRecord({ tags: ["a"], updatedAt: 9 });
  const media = mediaUseCases({
    loadMedia: async () => {
      reads++;
      return stored;
    },
    loadMediaCatalogItem: async () => ({ ...catalogItem(), media: stored }),
    updateMediaMetadata: async (input) => {
      writes.push(input);
      stored = { ...stored, tags: input.tags, updatedAt: input.updatedAt };
      return { media: stored, ...(input.publishedEffect ? { targetVersion: 4 } : {}) };
    },
    listMedia: async (input) => {
      reads++;
      expect(input.tags).toEqual(["a", "b"]);
      return { items: [] };
    },
    listMediaTags: async (input) => {
      reads++;
      expect(input.q).toBe("re");
      return { items: [{ tag: "red", count: 2 }] };
    },
  });
  const update = (tags, actor = mediaEditor) =>
    media.updateMetadata({
      actor,
      mediaId: "media-1",
      expectedUpdatedAt: stored.updatedAt,
      patch: { tags },
    });
  await expect(update(["a"], mediaViewer)).rejects.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  for (const tags of [
    ["a b"],
    ["\na"],
    ["Выставка"],
    null,
    Array.from({ length: 21 }, (_, i) => `t-${i}`),
  ]) {
    await expect(update(tags)).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      media.create({ actor: mediaEditor, body: bytes(pngBytes), filename: "x.png", tags }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  }
  await expect(
    media.list({ actor: mediaViewer, limit: 10, tags: Array(6).fill("a") }),
  ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  await expect(media.listTags({ actor: mediaViewer, limit: 101 })).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
  expect(reads).toBe(0);
  await expect(update([" A ", "a"])).resolves.toMatchObject({
    build: { status: "not-dispatched" },
    media: { updatedAt: 9, tags: ["a"] },
  });
  expect(writes).toHaveLength(0);
  await expect(update(["B"])).resolves.toMatchObject({
    build: { status: "not-dispatched" },
    media: { updatedAt: 10, tags: ["b"] },
  });
  expect(writes[0]).toMatchObject({ publishedEffect: false, tags: ["b"] });
  await expect(
    media.updateMetadata({
      actor: mediaEditor,
      mediaId: "media-1",
      expectedUpdatedAt: 10,
      patch: { tags: [], caption: "new" },
    }),
  ).resolves.toMatchObject({ build: { status: "queued", targetVersion: 4 } });
  await media.list({ actor: mediaViewer, limit: 10, tags: ["B", "a"] });
  await expect(media.listTags({ actor: mediaViewer, limit: 50, q: " Re " })).resolves.toEqual({
    items: [{ tag: "red", count: 2 }],
  });
});

test("uploads record the stored bytes' SHA-256 and lists filter by a valid hash", async () => {
  const created = [];
  const reads = [];
  const expected = createHash("sha256").update(pngBytes).digest("hex");
  const media = mediaUseCases({
    async createMedia(input) {
      created.push(input);
      return mediaRecord({ id: input.id, sha256: input.sha256 });
    },
    async loadMediaCatalogItem() {
      return catalogItem({ sha256: expected });
    },
    async listMedia(input) {
      reads.push(input);
      return { items: [catalogItem({ sha256: expected })] };
    },
  });
  await expect(
    media.create({ actor: mediaEditor, body: bytes(pngBytes), filename: "cover.png" }),
  ).resolves.toMatchObject({ sha256: expected });
  expect(created[0].sha256).toBe(expected);

  await expect(
    media.list({ actor: mediaViewer, limit: 5, sha256: expected }),
  ).resolves.toMatchObject({ items: [{ sha256: expected }] });
  expect(reads).toEqual([{ limit: 5, sha256: expected, sort: "-createdAt", tags: [] }]);
  for (const sha256 of [expected.toUpperCase(), expected.slice(1), "z".repeat(64)])
    await expect(media.list({ actor: mediaViewer, limit: 5, sha256 })).rejects.toMatchObject({
      code: "CONTENT_INVALID_STATE",
    });
  expect(reads).toHaveLength(1);

  // A rejected upload stores no metadata and therefore no hash.
  await expect(
    media.create({ actor: mediaEditor, body: bytes(new Uint8Array([1, 2, 3])), filename: "x" }),
  ).rejects.toThrow();
  expect(created).toHaveLength(1);
});
