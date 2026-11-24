import { mediaId } from "@lacecms/domain";
import { expect, test, vi } from "vitest";
import type { ThumbnailGenerator, ThumbnailStorage } from "../ports/media-thumbnails.js";
import { bytes, mediaRecord, mediaViewer } from "../test-support/media-fixtures.js";
import { mediaThumbnailKey } from "../shared/media-thumbnail-key.js";
import { MediaThumbnails } from "./thumbnails.js";

const opaque = new Uint8Array(
  Buffer.from(
    "524946463e000000574542505650382032000000d001009d012a0100010001402625a00274ba01f80003b000feeeff9ffe9a478d23c691f316fff32f3e65e7ccbcff98980000",
    "hex",
  ),
);
const translucent = new Uint8Array(
  Buffer.from(
    "524946465400000057454250565038580a00000010000000000000000000414c5048020000000080565038202c0000007001009d012a0100010001402625a0027401400000fefaae0fff7071fff7071fff7071fbd6ee93f53f940000",
    "hex",
  ),
);
const id = mediaId("media-1");
const read = { actor: mediaViewer, mediaId: id };

function fixture() {
  let status = "active" as "active" | "deleting";
  const objects = new Map<string, Uint8Array>();
  const media = {
    loadMedia: vi.fn(async (id: string) =>
      mediaRecord({
        id: mediaId(id),
        mimeType: "image/webp",
        status,
      }),
    ),
  };
  const originals = { get: vi.fn(async (_key: string) => bytes(opaque)) };
  const storage = {
    get: vi.fn<ThumbnailStorage["get"]>(async (key) =>
      objects.has(key) ? bytes(objects.get(key)!) : null,
    ),
    putIfAbsent: vi.fn<ThumbnailStorage["putIfAbsent"]>(async ({ key, bytes }) => {
      if (objects.has(key)) return "exists";
      objects.set(key, bytes);
      return "created";
    }),
    delete: vi.fn<ThumbnailStorage["delete"]>(async (key) => {
      objects.delete(key);
    }),
    list: async () => ({ keys: [...objects.keys()] }),
  };
  const generate = vi.fn<ThumbnailGenerator["generate"]>(async () => translucent);
  const dependencies = { media, originals, storage };
  const thumbnails = new MediaThumbnails({ ...dependencies, generator: { generate } });
  return {
    thumbnails,
    generate,
    storage,
    originals,
    media,
    objects,
    dependencies,
    deactivate: () => {
      status = "deleting";
    },
  };
}

test("legacy media with stale dimensions uses actual original dimensions and persists one shared result", async () => {
  const f = fixture();
  const results = await Promise.all([f.thumbnails.read(read), f.thumbnails.read(read)]);
  const thumbnail = results[0];
  expect(thumbnail).toMatchObject({
    width: 1,
    height: 1,
    bytes: translucent,
    mimeType: "image/webp",
  });
  expect(results[1]).toEqual(thumbnail);
  expect(f.generate).toHaveBeenCalledOnce();
  expect(f.generate).toHaveBeenCalledWith(expect.objectContaining({ width: 1, height: 1 }));
  const fresh = new MediaThumbnails(f.dependencies);
  await expect(fresh.read(read)).resolves.toEqual(thumbnail);
  expect(f.originals.get).toHaveBeenCalledOnce();
  expect(f.storage.putIfAbsent).toHaveBeenCalledExactlyOnceWith({
    key: mediaThumbnailKey(id),
    bytes: translucent,
    sha256: thumbnail!.sha256,
  });
});

test("authorization and active eligibility precede derivative storage", async () => {
  const f = fixture();
  await expect(
    f.thumbnails.read({
      ...read,
      actor: { ...mediaViewer, authority: { permissions: [], operations: [] } },
    }),
  ).rejects.toThrow();
  expect(f.media.loadMedia).not.toHaveBeenCalled();
  f.deactivate();
  await expect(f.thumbnails.read(read)).resolves.toBeNull();
  expect(f.storage.get).not.toHaveBeenCalled();
});

test("storage failures and malformed output do not trigger generation from the original or persist invalid bytes", async () => {
  const f = fixture();
  f.storage.get.mockRejectedValueOnce(new Error("private provider error"));
  await expect(f.thumbnails.read(read)).rejects.toMatchObject({ reason: "storage" });
  expect(f.originals.get).not.toHaveBeenCalled();
  f.generate.mockResolvedValueOnce(new Uint8Array([1, 2, 3]));
  await expect(f.thumbnails.read(read)).rejects.toMatchObject({ reason: "transform" });
  expect(f.storage.putIfAbsent).not.toHaveBeenCalled();
  await expect(f.thumbnails.read(read)).resolves.toMatchObject({ width: 1, height: 1 });
});

test("reconciles ambiguous writes and uses the concurrent winner's bytes and digest", async () => {
  const f = fixture();
  f.storage.putIfAbsent.mockImplementationOnce(async ({ key }) => {
    f.objects.set(key, opaque);
    throw new Error("missing acknowledgment");
  });
  const generated = await f.thumbnails.read(read);
  expect(generated?.bytes).toEqual(opaque);
  await expect(new MediaThumbnails(f.dependencies).read(read)).resolves.toEqual(generated);
});

test("checks active status before persistence and after a late write", async () => {
  const before = fixture();
  before.generate.mockImplementationOnce(async () => {
    before.deactivate();
    return translucent;
  });
  await expect(before.thumbnails.read(read)).resolves.toBeNull();
  expect(before.storage.putIfAbsent).not.toHaveBeenCalled();

  const failed = fixture();
  failed.generate.mockImplementationOnce(async () => {
    failed.deactivate();
    throw new Error("transform failed after deletion started");
  });
  await expect(failed.thumbnails.read(read)).resolves.toBeNull();

  const after = fixture();
  after.storage.putIfAbsent.mockImplementationOnce(async ({ key, bytes }) => {
    after.deactivate();
    after.objects.set(key, bytes);
    return "created";
  });
  await expect(after.thumbnails.read(read)).resolves.toBeNull();
  expect(after.storage.delete).toHaveBeenCalledWith(mediaThumbnailKey(id));
  expect(after.objects.size).toBe(0);
});

test("bounds elapsed time and can retry after a cancelled transformation settles", async () => {
  const f = fixture();
  const cancelled = vi.fn();
  f.generate.mockImplementationOnce(
    ({ cancellation }) =>
      new Promise((resolve) => {
        cancellation.onAbort(() => {
          cancelled();
          resolve(translucent);
        });
      }),
  );
  const thumbnails = new MediaThumbnails({
    ...f.dependencies,
    generator: { generate: f.generate },
    timeoutMs: 100,
  });
  await expect(thumbnails.read(read)).rejects.toMatchObject({ reason: "timeout" });
  expect(cancelled).toHaveBeenCalledOnce();
  expect(f.storage.putIfAbsent).not.toHaveBeenCalled();
  await expect(thumbnails.read(read)).resolves.toMatchObject({ width: 1 });
});

test("bounds parallel work, admits a page of 24, and rejects overflow", async () => {
  const f = fixture();
  const release = Promise.withResolvers<void>();
  let running = 0;
  let maxRunning = 0;
  f.generate.mockImplementation(async () => {
    maxRunning = Math.max(++running, maxRunning);
    await release.promise;
    running--;
    return translucent;
  });
  const readItem = (index: number) =>
    f.thumbnails.read({ ...read, mediaId: mediaId(`media-${index}`) });
  const admitted = Array.from({ length: 26 }, (_, index) => readItem(index));
  try {
    await expect(readItem(26)).rejects.toMatchObject({ reason: "busy" });
  } finally {
    release.resolve();
  }
  await expect(Promise.all(admitted)).resolves.toHaveLength(26);
  expect(maxRunning).toBe(2);
});
