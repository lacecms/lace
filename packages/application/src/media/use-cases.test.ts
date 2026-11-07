import { expect, test } from "vitest";
import { DomainError, mediaId, contentEntryId, contentModelKey } from "@lacecms/domain";
import {
  mediaEditor,
  mediaViewer,
  pngBytes,
  mediaRecord,
  catalogItem,
  mediaUseCases,
  bytes,
} from "../test-support/media-fixtures.js";
import type { MediaMetadata } from "@lacecms/domain";
import type {
  MediaCatalogItem,
  ListMediaInput,
  MediaUsageEntry,
  LoadMediaUsageInput,
} from "../ports/media.js";
import type { MediaUseCaseDependencies } from "../index.js";
type MediaPort = MediaUseCaseDependencies["media"];

test("validates and defaults media list queries before reading", async () => {
  const reads: ListMediaInput[] = [];
  const media = mediaUseCases({
    async listMedia(input) {
      reads.push(input);
      return { items: [catalogItem({ id: mediaId("media-2") })] };
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
  const usage: MediaUsageEntry[] = Array.from({ length: 51 }, (_, index) => ({
    entryId: contentEntryId(`post-${index}`),
    locations: [{ field: "cover", source: "field", states: ["draft", "published"] }],
    modelKey: contentModelKey("posts"),
    status: "published",
    title: `Post ${index}`,
  }));
  const requests: LoadMediaUsageInput[] = [];
  const media = mediaUseCases({
    async loadMediaCatalogItem(id) {
      return id === "media-1" ? { ...catalogItem(), usageCount: 51 } : null;
    },
    async loadMediaUsage(input) {
      requests.push(input);
      return usage;
    },
  });
  const detail = await media.get({ actor: mediaViewer, mediaId: mediaId("media-1") });
  expect(detail).toMatchObject({
    createdBy: { displayName: "Ada", id: "editor-1" },
    id: "media-1",
    usageCount: 51,
  });
  expect(detail).not.toHaveProperty("storageKey");
  expect(detail!.usage).toHaveLength(50);
  expect(detail!.usage[0]).toEqual(usage[0]);
  expect(requests).toEqual([{ limit: 50, mediaId: mediaId("media-1") }]);
  await expect(media.get({ actor: mediaViewer, mediaId: mediaId("missing") })).resolves.toBeNull();
});

test("reloads catalog views after create and deletion commands", async () => {
  const cleanup: string[] = [];
  const loads: string[] = [];
  let reload: MediaCatalogItem | null = catalogItem();
  const port: Partial<MediaPort> = {
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
    media.requestDeletion({ actor: mediaEditor, mediaId: mediaId("media-1") }),
  ).resolves.toMatchObject({ status: "deleting", usageCount: 0 });
  await expect(
    media.retryDeletion({ actor: mediaEditor, mediaId: mediaId("media-1") }),
  ).rejects.toMatchObject({ code: "MEDIA_IN_USE" });
  expect(loads).toEqual(["media-1", "media-1"]);

  reload = null;
  await expect(
    media.create({ actor: mediaEditor, body: bytes(pngBytes), filename: "cover.png" }),
  ).rejects.toThrow("Created media could not be reloaded.");
  expect(cleanup).toEqual([]);
});

test("resolves media binary eligibility without reading object storage", async () => {
  const storageReads: string[] = [];
  const records: Record<string, MediaMetadata> = {
    "media-1": mediaRecord(),
    deleting: mediaRecord({ id: mediaId("deleting"), status: "deleting" }),
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
          return id === "media-1" ? records[id]! : null;
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
  await expect(media.resolvePublic({ mediaId: mediaId("media-1") })).resolves.toMatchObject({
    id: "media-1",
    storageKey: "media/media-1",
  });
  await expect(media.resolvePublic({ mediaId: mediaId("deleting") })).resolves.toBeNull();
  await expect(media.resolvePublic({ mediaId: mediaId("missing") })).resolves.toBeNull();
  await expect(
    media.resolvePreview({ actor: mediaViewer, mediaId: mediaId("media-1") }),
  ).resolves.toMatchObject({ id: "media-1" });
  await expect(
    media.resolvePreview({ actor: mediaViewer, mediaId: mediaId("deleting") }),
  ).resolves.toBeNull();
  expect(storageReads).toEqual([]);
  const binary = await media.readPublic({ mediaId: mediaId("media-1") });
  expect(binary).toMatchObject({ filename: "cover.png", mimeType: "image/png" });
  await expect(
    media.preview({ actor: mediaViewer, mediaId: mediaId("deleting") }),
  ).resolves.toBeNull();
  expect(storageReads).toEqual(["media/media-1"]);
});
