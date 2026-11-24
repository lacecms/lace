import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import type { ImageThumbnailReader } from "@lacecms/render";
import { createPlaceholderResolver, prepareLaceImage, type LaceImageService } from "./images.js";

const directories: string[] = [];
const photo = {
  height: 3_000,
  width: 2_000,
  mimeType: "image/jpeg",
  sourceUrl: "https://api.test/original",
};
const etag = '"thumbnail"';

async function directory() {
  const folder = await mkdtemp(join(tmpdir(), "lace-build-thumbnails-"));
  directories.push(folder);
  return folder;
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    directories.splice(0).map((folder) => rm(folder, { force: true, recursive: true })),
  );
});

// Minimal frame headers for the resolver. The packaged acceptance runs the real decoder.
function webp(width: number, height: number, size = 32) {
  const bytes = Buffer.alloc(size);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(size - 8, 4);
  bytes.write("WEBPVP8 ", 8);
  bytes.writeUInt32LE(size - 20, 16);
  bytes.set([0, 0, 0, 0x9d, 0x01, 0x2a], 20);
  bytes.writeUInt16LE(width, 26);
  bytes.writeUInt16LE(height, 28);
  return bytes;
}

function setup(cacheDirectory: string, input = webp(200, 300), output = webp(43, 64)) {
  const read = vi.fn<ImageThumbnailReader["read"]>(async () => ({
    changed: true,
    etag,
    bytes: input,
  }));
  const thumbnail = { cacheKey: "api.test/base/photo", read };
  const transform = vi.fn<NonNullable<LaceImageService["transform"]>>(async () => ({
    data: output,
  }));
  const fetch = vi.fn(async () => {
    throw new Error("unexpected original request");
  });
  const service = { transform };
  const resolve = createPlaceholderResolver({ cacheDirectory, service, fetch, imageConfig: {} });
  return { image: { ...photo, thumbnail }, read, transform, fetch, service, resolve };
}

test("portrait thumbnails share a single read and transform, then revalidate their cache from a new reader", async () => {
  const folder = await directory();
  const cold = setup(folder);
  const [first, second] = await Promise.all([cold.resolve(cold.image), cold.resolve(cold.image)]);
  expect(first).toBe(second);
  expect(decodeURIComponent(first!)).toContain("viewBox='0 0 43 64'");
  expect(cold.read).toHaveBeenCalledOnce();
  expect(cold.transform).toHaveBeenCalledExactlyOnceWith(
    webp(200, 300),
    expect.objectContaining({ width: 43, height: 64, format: "webp" }),
    {},
    expect.any(Object),
  );
  expect(cold.fetch).not.toHaveBeenCalled();
  const warm = setup(folder);
  warm.read.mockResolvedValue({ changed: false, etag });
  await expect(warm.resolve(warm.image)).resolves.toBe(first);
  expect(warm.read).toHaveBeenCalledExactlyOnceWith({ etag });
  expect(warm.transform).not.toHaveBeenCalled();
  const denied = setup(folder);
  denied.read.mockRejectedValue(new Error("no longer published"));
  await expect(denied.resolve(denied.image)).resolves.toBeUndefined();
  expect(denied.read).toHaveBeenCalledExactlyOnceWith({ etag });
  expect(denied.transform).not.toHaveBeenCalled();
  expect(denied.fetch).not.toHaveBeenCalled();
  const replaced = setup(folder);
  replaced.read.mockResolvedValue({ changed: true, etag: '"new"', bytes: webp(200, 300) });
  await expect(replaced.resolve(replaced.image)).resolves.toBe(first);
  const subsequent = setup(folder);
  subsequent.read.mockResolvedValue({ changed: false, etag: '"new"' });
  await expect(subsequent.resolve(subsequent.image)).resolves.toBe(first);
  expect(subsequent.read).toHaveBeenCalledExactlyOnceWith({ etag: '"new"' });
});

test("cache failures are recoverable and smaller images are never upscaled", async () => {
  const folder = await directory();
  const cold = setup(folder, webp(5, 4), webp(5, 4));
  const blur = await cold.resolve(cold.image);
  expect(decodeURIComponent(blur!)).toContain("viewBox='0 0 5 4'");
  expect(cold.transform.mock.calls[0]?.[1]).toMatchObject({ width: 5, height: 4 });
  const [file] = await readdir(folder);
  await writeFile(join(folder, file!), '{"etag":"broken","webp":"nope"}');
  const corrupt = setup(folder);
  expect(await corrupt.resolve(corrupt.image)).toBeDefined();
  expect(corrupt.read).toHaveBeenCalledExactlyOnceWith(undefined);
  // A directory at the cache filename prevents atomic replacement.
  await rm(join(folder, file!));
  await mkdir(join(folder, file!));
  const unwritable = setup(folder);
  expect(await unwritable.resolve(unwritable.image)).toBeDefined();
  expect(await readdir(folder)).toEqual([file]);
});

test("transparent, malformed, and oversized WebPs preserve optimized variants without blur", async () => {
  const animated = webp(200, 300);
  animated.write("ANIM", 12);
  const transparent = webp(200, 300);
  transparent.write("ALPH", 12);
  for (const [input, output] of [
    [transparent, undefined],
    [animated, undefined],
    [Uint8Array.of(1), undefined],
    [webp(200, 300), webp(43, 64, 4_098)],
    [webp(200, 300), webp(44, 65)],
    [webp(5, 4), webp(10, 8)],
  ] as const) {
    const fixture = setup(await directory(), Buffer.from(input), output);
    const getImage = vi.fn(async ({ width }: { width: number }) => ({
      src: `/_astro/photo-${width}.webp`,
    }));
    const result = await prepareLaceImage(
      { ...fixture.image, alt: "Photo", src: "https://public.test/photo" },
      {
        getImage,
        placeholder: fixture.resolve,
        imageConfig: {},
        service: fixture.service,
      },
    );
    expect(result).toEqual({
      src: "/_astro/photo-960.webp",
      srcset: "/_astro/photo-960.webp 960w, /_astro/photo-1920.webp 1920w",
    });
    expect(fixture.fetch).not.toHaveBeenCalled();
    if (output === undefined) expect(fixture.transform).not.toHaveBeenCalled();
  }
});

test("GIFs, unknown dimensions, disabled sources and external services skip the reader", async () => {
  const folder = await directory();
  const fixture = setup(folder);
  const external = createPlaceholderResolver({
    cacheDirectory: folder,
    imageConfig: {},
    service: {},
  });
  expect(await external(fixture.image)).toBeUndefined();
  expect(await fixture.resolve({ ...fixture.image, mimeType: "image/gif" })).toBeUndefined();
  const { width: _width, sourceUrl: _sourceUrl, ...image } = fixture.image;
  expect(await fixture.resolve({ ...image, sourceUrl: photo.sourceUrl })).toBeUndefined();
  expect(await fixture.resolve({ ...image, width: photo.width })).toBeUndefined();
  expect(fixture.read).not.toHaveBeenCalled();
});

test("optional acquisition is bounded and transform failure leaves no persistent entry", async () => {
  const folder = await directory();
  const fixture = setup(folder);
  let started!: () => void;
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  fixture.read.mockImplementationOnce(() => {
    started();
    return new Promise(() => {});
  });
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const result = fixture.resolve(fixture.image);
  await ready;
  await vi.advanceTimersByTimeAsync(5_000);
  await expect(result).resolves.toBeUndefined();
  expect(fixture.transform).not.toHaveBeenCalled();
  const failed = setup(folder);
  failed.transform.mockRejectedValueOnce(new Error("unsupported transform"));
  await expect(failed.resolve(failed.image)).resolves.toBeUndefined();
  expect(await readdir(folder)).toEqual([]);
});

test("at most four distinct thumbnail requests run concurrently", async () => {
  const fixture = setup(await directory());
  let active = 0;
  let peak = 0;
  const requests = Array.from({ length: 9 }, (_, index) =>
    fixture.resolve({
      ...fixture.image,
      thumbnail: {
        cacheKey: String(index),
        async read() {
          active++;
          peak = Math.max(peak, active);
          await new Promise((resolve) => setTimeout(resolve, 10));
          active--;
          return { changed: true, etag, bytes: webp(200, 300) };
        },
      },
    }),
  );
  expect((await Promise.all(requests)).every((value) => value !== undefined)).toBe(true);
  expect(peak).toBe(4);
});
