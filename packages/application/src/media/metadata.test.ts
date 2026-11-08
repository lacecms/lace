import { expect, test } from "vitest";
import { mediaId, unixMilliseconds } from "@lacecms/domain";
import {
  mediaEditor,
  mediaViewer,
  pngBytes,
  mediaRecord,
  catalogItem,
  mediaUseCases,
  bytes,
} from "../test-support/media-fixtures.js";
import type { Actor } from "@lacecms/domain";
import type { MediaMetadataPatch } from "./types.js";
import type { UpdateMediaMetadataInput } from "../ports/media.js";
import type { MediaUseCaseDependencies, MediaUseCases } from "../index.js";
type MediaPort = MediaUseCaseDependencies["media"];

test("validates media metadata patches before any read and merges onto stored values", async () => {
  const reads: string[] = [];
  const writes: UpdateMediaMetadataInput[] = [];
  let stored = mediaRecord({
    alt: "Old alt",
    focalPoint: { x: 0.1, y: 0.2 },
    updatedAt: unixMilliseconds(9),
  });
  const port: Partial<MediaPort> = {
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
  const update = (
    patch: unknown,
    overrides: Partial<Parameters<MediaUseCases["updateMetadata"]>[0]> = {},
  ) =>
    media.updateMetadata({
      actor: mediaEditor,
      expectedUpdatedAt: unixMilliseconds(9),
      mediaId: mediaId("media-1"),
      patch: patch as MediaMetadataPatch,
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

  await expect(update({ alt: "x" }, { mediaId: mediaId("missing") })).resolves.toBeNull();
  await expect(
    update({ alt: "x" }, { expectedUpdatedAt: unixMilliseconds(8) }),
  ).rejects.toMatchObject({
    code: "MEDIA_UPDATE_CONFLICT",
  });
  // An unchanged submission (after trimming) writes nothing.
  await expect(update({ alt: "  Old alt ", focalPoint: { x: 0.1, y: 0.2 } })).resolves.toEqual({
    build: { status: "not-dispatched" },
    media: expect.objectContaining({ alt: "Old alt", updatedAt: unixMilliseconds(9) }),
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
      expectedUpdatedAt: unixMilliseconds(9),
      focalPoint: null,
      mediaId: mediaId("media-1"),
      requestedBy: mediaEditor,
      updatedAt: 10,
    },
  ]);

  stored = mediaRecord({ status: "deleting", updatedAt: unixMilliseconds(9) });
  await expect(update({ alt: "x" })).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  expect(writes).toHaveLength(1);
});

test("media tags validate before I/O, preserve authorization, and separate build effects", async () => {
  let reads = 0;
  const writes: UpdateMediaMetadataInput[] = [];
  let stored = mediaRecord({ tags: ["a"], updatedAt: unixMilliseconds(9) });
  const media = mediaUseCases({
    loadMedia: async () => {
      reads++;
      return stored;
    },
    loadMediaCatalogItem: async () => ({ ...catalogItem(), media: stored }),
    updateMediaMetadata: async (input) => {
      writes.push(input);
      stored = { ...stored, tags: input.tags ?? [], updatedAt: input.updatedAt };
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
  const update = (tags: readonly string[] | null, actor: Actor = mediaEditor) =>
    media.updateMetadata({
      actor,
      mediaId: mediaId("media-1"),
      expectedUpdatedAt: stored.updatedAt,
      patch: { tags: tags as readonly string[] },
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
      media.create({
        actor: mediaEditor,
        body: bytes(pngBytes),
        filename: "x.png",
        tags: tags as readonly string[],
      }),
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
      mediaId: mediaId("media-1"),
      expectedUpdatedAt: unixMilliseconds(10),
      patch: { tags: [], caption: "new" },
    }),
  ).resolves.toMatchObject({ build: { status: "queued", targetVersion: 4 } });
  await media.list({ actor: mediaViewer, limit: 10, tags: ["B", "a"] });
  await expect(media.listTags({ actor: mediaViewer, limit: 50, q: " Re " })).resolves.toEqual({
    items: [{ tag: "red", count: 2 }],
  });
});
