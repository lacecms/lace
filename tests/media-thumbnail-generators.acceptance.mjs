import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import {
  mediaThumbnailKey,
  MediaCreateError,
  MediaThumbnails,
} from "../packages/application/dist/index.js";
import { CloudflareImagesThumbnailGenerator } from "../packages/platform-cloudflare/src/media/thumbnail-images.ts";
import { openProductRuntime, png } from "./support/cross-runtime-fixture.mjs";
import {
  fixtureImagesBinding,
  thumbnailSources,
  transformFixtureImage,
} from "./support/media-thumbnails-fixture.mjs";

const sharp = createRequire(new URL("../packages/platform-node/package.json", import.meta.url))(
  "sharp",
);
const viewer = { id: "mp1-viewer", role: "viewer" };
const read = (fixture, mediaId) => fixture.runtime.thumbnails.read({ actor: viewer, mediaId });

async function upload(fixture, { name, type, bytes }) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  const response = await fixture.call("/api/v1/admin/media", {
    method: "POST",
    body: form,
    cookie: fixture.cookies.admin,
  });
  if (!response.ok) throw new Error(`Upload ${name} failed with ${response.status}`);
  return (await response.json()).id;
}

function imagesBinding() {
  const output = vi.fn(transformFixtureImage);
  return { output, ...fixtureImagesBinding(output) };
}

test.each(["node", "worker"])(
  "MP1 %s composition processes a page of real fixture images",
  async (kind) => {
    const binding = imagesBinding();
    const fixture = await openProductRuntime(kind, { workerImages: binding });
    try {
      vi.spyOn(fixture.runtime.thumbnails, "prepare").mockResolvedValue(undefined);
      const sources = await thumbnailSources();
      const fillers = Array.from({ length: 24 - sources.length }, (_, index) => ({
        name: `fill-${index}.png`,
        type: "image/png",
        bytes: png,
      }));
      const ids = [];
      for (const source of [...sources, ...fillers]) ids.push(await upload(fixture, source));
      const results = await Promise.all(ids.map((id) => read(fixture, id)));
      for (const result of results) {
        expect(result.mimeType).toBe("image/webp");
        expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(320);
        expect(result.bytes.length).toBeLessThanOrEqual(96 * 1024);
      }
      const byName = new Map(sources.map(({ name }, index) => [name, results[index]]));
      expect(byName.get("mp1-heavy.jpg")).toMatchObject({ width: 320, height: 222 });
      expect(byName.get("mp1-heavy.png")).toMatchObject({ width: 320, height: 198 });
      expect(byName.get("mp1-legacy-oriented.jpg")).toMatchObject({ width: 213, height: 320 });
      const transparent = await sharp(byName.get("mp1-transparent.png").bytes)
        .ensureAlpha()
        .raw()
        .toBuffer();
      expect(transparent[3]).toBe(128);
      for (const name of ["mp1-animation.gif", "mp1-large-animation.gif"]) {
        const result = byName.get(name);
        expect((await sharp(result.bytes).metadata()).pages ?? 1).toBe(1);
        const rgb = await sharp(result.bytes).raw().toBuffer();
        expect(rgb[0]).toBeGreaterThan(200);
        expect(rgb[2]).toBeLessThan(60);
      }
      expect(results.at(-1)).toMatchObject({ width: 1, height: 1 });
      if (kind === "worker") expect(binding.output).toHaveBeenCalledTimes(24);
    } finally {
      await fixture.close();
    }
  },
  90_000,
);

test.each(["node", "worker"])(
  "MP1 %s adopts missing derivatives after restoring original media",
  async (kind) => {
    const backup = await mkdtemp(join(tmpdir(), "lace-media-restore-"));
    let fixture;
    try {
      fixture = await openProductRuntime(kind, { operations: true });
      vi.spyOn(fixture.runtime.thumbnails, "prepare").mockResolvedValue(undefined);
      const id = await upload(fixture, { name: "existing.png", bytes: png, type: "image/png" });
      const key = mediaThumbnailKey(id);
      expect(await fixture.runtime.deletionDispatcher.options.thumbnails.get(key)).toBeNull();
      await fixture.backup(backup);
      await fixture.close();
      fixture = await openProductRuntime(kind, {
        operations: true,
        backup,
        workerImages: imagesBinding(),
      });
      expect(await fixture.runtime.deletionDispatcher.options.thumbnails.get(key)).toBeNull();
      const preview = `/api/v1/admin/media/${id}`;
      const who = { cookie: fixture.cookies.viewer };
      const original = await fixture.call(`${preview}/preview`, who);
      expect(Buffer.from(await original.arrayBuffer())).toEqual(png);
      const regenerated = await fixture.call(`${preview}/thumbnail`, who);
      expect(regenerated.status).toBe(200);
      expect(regenerated.headers.get("content-type")).toBe("image/webp");
      const etag = regenerated.headers.get("etag");
      expect(etag).toMatch(/^"t-[a-f0-9]{64}"$/u);
      expect(
        (
          await fixture.call(`${preview}/thumbnail`, {
            ...who,
            headers: { "if-none-match": etag },
          })
        ).status,
      ).toBe(304);
    } finally {
      await fixture?.close();
      await rm(backup, { recursive: true, force: true });
    }
  },
  80_000,
);

test("MP1 Worker without Images serves original media and refuses generation", async () => {
  const fixture = await openProductRuntime("worker");
  try {
    const id = await upload(fixture, { bytes: png, name: "no-binding.png", type: "image/png" });
    await expect(read(fixture, id)).rejects.toMatchObject({
      code: "MEDIA_THUMBNAIL_UNAVAILABLE",
    });
    const original = await fixture.call(`/api/v1/admin/media/${id}/preview`, {
      cookie: fixture.cookies.viewer,
    });
    expect(Buffer.from(await original.arrayBuffer())).toEqual(png);
  } finally {
    await fixture.close();
  }
}, 60_000);

test("MP1 Worker rejects malformed, animated and unsupported provider output", async () => {
  const binding = imagesBinding();
  const fixture = await openProductRuntime("worker", { workerImages: binding });
  try {
    vi.spyOn(fixture.runtime.thumbnails, "prepare").mockResolvedValue(undefined);
    const source = (await thumbnailSources()).find(({ name }) => name === "mp1-animation.gif");
    const id = await upload(fixture, source);
    const animated = await sharp(source.bytes, { animated: true }).webp().toBuffer();
    for (const bytes of [Uint8Array.of(1, 2, 3), new Uint8Array(animated)]) {
      binding.output.mockImplementationOnce(async () => ({
        response: () => new Response(bytes, { headers: { "content-type": "image/webp" } }),
      }));
      await expect(read(fixture, id)).rejects.toMatchObject({ reason: "transform" });
    }
    binding.output.mockRejectedValueOnce(new Error("unavailable provider feature"));
    await expect(read(fixture, id)).rejects.toMatchObject({ reason: "transform" });
    await expect(read(fixture, id)).resolves.toMatchObject({ width: 320, height: 213 });
  } finally {
    await fixture.close();
  }
}, 60_000);

test("MP1 Worker cancels an unfinished response body when the deadline expires", async () => {
  const binding = imagesBinding();
  const cancelled = vi.fn();
  binding.output.mockImplementationOnce(async () => ({
    response: () =>
      new Response(new ReadableStream({ cancel: cancelled }), {
        headers: { "content-type": "image/webp" },
      }),
  }));
  const thumbnails = new MediaThumbnails({
    timeoutMs: 100,
    media: { loadMedia: async () => ({ id: "mp1", status: "active", mimeType: "image/png" }) },
    originals: { get: async () => [png] },
    storage: { get: async () => null },
    generator: new CloudflareImagesThumbnailGenerator(binding),
  });
  await expect(thumbnails.read({ actor: viewer, mediaId: "mp1" })).rejects.toMatchObject({
    reason: "timeout",
  });
  expect(cancelled).toHaveBeenCalledOnce();
});

test.each(["node", "worker"])(
  "MP1 %s schedules only after commit and recovers dropped background work",
  async (kind) => {
    const background = [];
    const fixture = await openProductRuntime(kind, {
      workerImages: imagesBinding(),
      observeWorkerWaitUntil: (task) => background.push(task),
    });
    const complete = Promise.withResolvers();
    try {
      background.length = 0;
      const started = Promise.withResolvers();
      const prepare = vi
        .spyOn(fixture.runtime.thumbnails, "prepare")
        .mockImplementation(async (id) => {
          started.resolve(await fixture.runtime.repository.loadMedia(id));
          await complete.promise;
          throw new Error("simulated interrupted background thumbnail");
        });
      const source = { bytes: png, name: "repair.png", type: "image/png" };
      const id = await upload(fixture, source);
      expect(await started.promise).toMatchObject({ id, status: "active" });
      expect(prepare).toHaveBeenCalledExactlyOnceWith(id);
      if (kind === "worker") expect(background.length).toBeGreaterThan(0);
      complete.resolve();
      await Promise.all(background);
      await expect(read(fixture, id)).resolves.toMatchObject({ mimeType: "image/webp" });

      const failed = vi
        .spyOn(fixture.runtime.repository, "createMedia")
        .mockRejectedValueOnce(new MediaCreateError("rolled-back", new Error("fixture rollback")));
      await expect(upload(fixture, source)).rejects.toThrow("500");
      failed.mockRestore();
      expect(prepare).toHaveBeenCalledTimes(1);
    } finally {
      complete.resolve();
      await fixture.close();
    }
  },
  60_000,
);
