import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { expect, test, vi } from "vitest";
import {
  MediaThumbnails,
  mediaThumbnailKey,
  reconcileMediaThumbnails,
} from "../packages/application/dist/index.js";
import { NodeThumbnailStorage } from "../packages/platform-node/src/media/thumbnail-s3.ts";
import { CloudflareThumbnailStorage } from "../packages/platform-cloudflare/src/media/thumbnail-r2.ts";
import { CloudflareR2ObjectStorage } from "../packages/platform-cloudflare/src/media/r2-storage.ts";
import { openLocalCloudflare } from "../packages/platform-cloudflare/src/test-support/d1-test-harness.ts";
import { openProductRuntime, png } from "./support/cross-runtime-fixture.mjs";

const sharp = createRequire(new URL("../packages/platform-node/package.json", import.meta.url))(
  "sharp",
);

async function webp(background) {
  const bytes = await sharp({ create: { width: 1, height: 1, channels: 4, background } })
    .webp()
    .toBuffer();
  return { bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function verifyStorage(makeStorage, objects) {
  const storage = makeStorage();
  const key = mediaThumbnailKey("acceptance");
  const secondKey = mediaThumbnailKey("second");
  await objects.put({
    key: "media/acceptance",
    contentType: "application/octet-stream",
    body: [Uint8Array.of(42)],
  });
  await expect(storage.get(key)).resolves.toBeNull();
  const candidates = await Promise.all([webp("#FF3300"), webp("#3399FF80")]);
  const outcomes = await Promise.all(
    candidates.map((candidate) => makeStorage().putIfAbsent({ key, ...candidate })),
  );
  expect([...outcomes].sort()).toEqual(["created", "exists"]);
  const winner = candidates[outcomes.indexOf("created")];
  const originals = { get: vi.fn(async () => null) };
  const dependencies = {
    media: { loadMedia: async () => ({ id: "acceptance", status: "active" }) },
    originals,
  };
  const read = { actor: { id: "reader", role: "viewer" }, mediaId: "acceptance" };
  for (let attempt = 0; attempt < 2; attempt++) {
    const fresh = new MediaThumbnails({ ...dependencies, storage: makeStorage() });
    const derivative = await fresh.read(read);
    expect(Buffer.from(derivative.bytes)).toEqual(winner.bytes);
    expect(derivative.sha256).toBe(winner.sha256);
  }
  expect(originals.get).not.toHaveBeenCalled();
  await storage.putIfAbsent({ key: secondKey, ...winner });
  const first = await storage.list(1);
  expect(first.keys).toEqual([key]);
  expect(first.cursor).toBeTruthy();
  await storage.delete(key);
  const second = await makeStorage().list(1, first.cursor);
  expect(second.keys).toEqual([secondKey]);
  expect(second.cursor).toBeUndefined();
  await expect(storage.delete("media/acceptance")).rejects.toThrow();
  await storage.delete(key);
  await storage.delete(key);
  await expect(storage.get(key)).resolves.toBeNull();
  expect((await storage.list(5)).keys).toEqual([secondKey]);

  await storage.delete(secondKey);
  const ids = Array.from({ length: 9 }, (_, index) => `sweep-${index}`);
  for (const id of ids) await storage.putIfAbsent({ key: mediaThumbnailKey(id), ...winner });
  const loadMediaMany = vi.fn(async () => [
    { id: "sweep-0", status: "active" },
    { id: "sweep-1", status: "deleting" },
  ]);
  const sweep = () =>
    reconcileMediaThumbnails({
      media: { loadMediaMany },
      objects,
      storage: makeStorage(),
    });
  loadMediaMany.mockRejectedValueOnce(new Error("authoritative lookup unavailable"));
  await expect(sweep()).rejects.toThrow("authoritative lookup unavailable");
  expect(await storage.get(mediaThumbnailKey("sweep-1"))).not.toBeNull();
  await expect(sweep()).resolves.toBe(0);
  expect((await storage.list(8)).keys).toEqual([
    mediaThumbnailKey("sweep-0"),
    mediaThumbnailKey("sweep-8"),
  ]);
  await expect(sweep()).resolves.toBe(0);
  expect(loadMediaMany.mock.calls[2][0]).toEqual(["sweep-8"]);
  expect((await storage.list(8)).keys).toEqual([mediaThumbnailKey("sweep-0")]);
  expect(await objects.get("media/acceptance")).not.toBeNull();
}

test("MP1 pinned SILO stores one private derivative from concurrent writers", async () => {
  let makeStorage;
  const fixture = await openProductRuntime("node", {
    observeNodeStorage(settings, client) {
      makeStorage = () => new NodeThumbnailStorage(settings, client);
    },
  });
  try {
    await verifyStorage(makeStorage, fixture.runtime.storage);
  } finally {
    await fixture.close();
  }
}, 60_000);

test("MP1 native R2 stores one private derivative from concurrent writers", async () => {
  const local = await openLocalCloudflare({ migrate: false });
  try {
    await verifyStorage(
      () => new CloudflareThumbnailStorage(local.bucket, 5_000),
      new CloudflareR2ObjectStorage(local.bucket, {
        publicBaseUrl: new URL("http://localhost/"),
        timeoutMs: 5_000,
      }),
    );
  } finally {
    await local.dispose();
  }
}, 60_000);

test.each(["node", "worker"])(
  "MP1 %s deletion retries both objects and reconciles a late derivative",
  async (kind) => {
    const fixture = await openProductRuntime(kind);
    try {
      const { repository, thumbnails: service, deletionDispatcher } = fixture.runtime;
      vi.spyOn(service, "prepare").mockResolvedValue(undefined);
      const { storage, thumbnails } = deletionDispatcher.options;
      const bytes = await webp("#006600");
      const admin = (await fixture.runtime.security.listUsers({ limit: 50 })).items.find(
        ({ role }) => role === "admin",
      );
      const upload = async (name) => {
        const form = new FormData();
        form.append("file", new Blob([png], { type: "image/png" }), name);
        const response = await fixture.call("/api/v1/admin/media", {
          method: "POST",
          body: form,
          cookie: fixture.cookies.admin,
        });
        expect(response.status).toBe(201);
        return (await response.json()).id;
      };
      const requestDeletion = async (id) => {
        const requestedAt = Date.now();
        await repository.markForDeletion({
          mediaId: id,
          requestedAt,
          requestedBy: admin,
          events: [
            {
              type: "media.delete.requested",
              requestedAt,
              payload: { mediaId: id, requestedBy: admin.id },
            },
          ],
        });
      };

      const id = await upload("has-thumbnail.png");
      const key = mediaThumbnailKey(id);
      await thumbnails.putIfAbsent({ key, ...bytes });
      await requestDeletion(id);
      const removeOriginal = vi.spyOn(storage, "delete");
      const removeThumbnail = vi
        .spyOn(thumbnails, "delete")
        .mockRejectedValueOnce(new Error("temporary storage failure"));
      await deletionDispatcher.runOnce();
      expect(removeOriginal).not.toHaveBeenCalled();
      expect(await repository.loadMedia(id)).toMatchObject({ status: "deleting" });
      await fixture.dispatch();
      await deletionDispatcher.runOnce();
      expect(removeThumbnail.mock.invocationCallOrder.at(-1)).toBeLessThan(
        removeOriginal.mock.invocationCallOrder[0],
      );
      expect(await repository.loadMedia(id)).toBeNull();
      expect(await thumbnails.get(key)).toBeNull();

      const lateId = await upload("late-thumbnail.png");
      await requestDeletion(lateId);
      await deletionDispatcher.runOnce();
      expect(await repository.loadMedia(lateId)).toBeNull();
      const lateKey = mediaThumbnailKey(lateId);
      await thumbnails.putIfAbsent({ key: lateKey, ...bytes });
      await expect(
        service.read({ actor: { id: "viewer", role: "viewer" }, mediaId: lateId }),
      ).resolves.toBeNull();
      expect((await thumbnails.list(8)).keys).toContain(lateKey);
      await fixture.runtime.maintainThumbnails();
      expect(await thumbnails.get(lateKey)).toBeNull();
    } finally {
      await fixture.close();
    }
  },
  60_000,
);
