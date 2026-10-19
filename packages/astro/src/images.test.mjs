import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";
import {
  blurredPlaceholder,
  createPlaceholderResolver,
  laceImageConfig,
  prepareLaceImage,
  variantWidths,
  webpHasAlpha,
} from "../dist/index.js";

const temporaryDirectories = [];

async function cacheDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "lace-placeholders-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function riff(chunk, payload) {
  const bytes = new Uint8Array(12 + 8 + payload.length);
  bytes.set(new TextEncoder().encode("RIFF"), 0);
  bytes.set(new TextEncoder().encode("WEBP"), 8);
  bytes.set(new TextEncoder().encode(chunk), 12);
  bytes.set(payload, 20);
  return bytes;
}

const opaqueWebp = riff("VP8 ", new Uint8Array(10));

test.each([
  [3000, [960, 1920]],
  [1920, [960, 1920]],
  [1200, [960, 1200]],
  [960, [960]],
  [800, [800]],
  [600, [600]],
])("variant widths for an original of %i px", (width, expected) => {
  expect(variantWidths(width)).toEqual(expected);
});

test("the remote allowance covers only the media path of the API base URL", () => {
  expect(laceImageConfig({ LACE_API_BASE_URL: "http://127.0.0.1:8787/lace/" })).toEqual({
    remotePatterns: [
      {
        hostname: "127.0.0.1",
        pathname: "/lace/api/v1/public/media/*",
        port: "8787",
        protocol: "http",
      },
    ],
  });
  expect(laceImageConfig({ LACE_API_BASE_URL: "https://cms.example.com" })).toEqual({
    remotePatterns: [
      { hostname: "cms.example.com", pathname: "/api/v1/public/media/*", protocol: "https" },
    ],
  });
  for (const value of [undefined, "", "not a url", "ftp://cms.example.com"])
    expect(laceImageConfig({ LACE_API_BASE_URL: value })).toEqual({ remotePatterns: [] });
  expect(laceImageConfig()).toEqual({ remotePatterns: [] });
});

test("WebP alpha detection reads VP8, VP8X and VP8L headers", () => {
  expect(webpHasAlpha(opaqueWebp)).toBe(false);
  expect(webpHasAlpha(riff("VP8X", Uint8Array.of(0x10, 0, 0, 0, 0)))).toBe(true);
  expect(webpHasAlpha(riff("VP8X", Uint8Array.of(0x08, 0, 0, 0, 0)))).toBe(false);
  expect(webpHasAlpha(riff("VP8L", Uint8Array.of(0x2f, 0, 0, 0, 0x10)))).toBe(true);
  expect(webpHasAlpha(riff("VP8L", Uint8Array.of(0x2f, 0, 0, 0, 0x00)))).toBe(false);
  expect(webpHasAlpha(Uint8Array.of(1, 2, 3))).toBe(true);
});

test("the placeholder is a blurred SVG around the base64 WebP", () => {
  const url = blurredPlaceholder(opaqueWebp, 64, 43);
  expect(url.startsWith("data:image/svg+xml,")).toBe(true);
  const svg = decodeURIComponent(url.slice("data:image/svg+xml,".length));
  expect(svg).toContain("viewBox='0 0 64 43'");
  expect(svg).toContain("feGaussianBlur");
  expect(svg).toContain(`data:image/webp;base64,${Buffer.from(opaqueWebp).toString("base64")}`);
  expect(url).not.toMatch(/[#<>"]/u);
});

function scriptedService(output = opaqueWebp) {
  const calls = [];
  return {
    calls,
    service: {
      async transform(bytes, options) {
        calls.push({ bytes, options });
        return { data: output, format: "webp" };
      },
    },
  };
}

function scriptedFetch(status = 200) {
  const requests = [];
  return {
    fetch: async (url) => {
      requests.push(url);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Response(Uint8Array.of(1, 2, 3), { status });
    },
    requests,
  };
}

const photo = {
  height: 2000,
  mimeType: "image/jpeg",
  sourceUrl: "http://api.test/api/v1/public/media/photo",
  width: 3000,
};

test("concurrent placeholders share one fetch and transform a 64 px WebP", async () => {
  const transport = scriptedFetch();
  const { calls, service } = scriptedService();
  const resolve = createPlaceholderResolver({
    cacheDirectory: await cacheDirectory(),
    fetch: transport.fetch,
    imageConfig: {},
    service,
  });
  const results = await Promise.all([resolve(photo), resolve(photo), resolve(photo)]);
  expect(new Set(results).size).toBe(1);
  expect(results[0]).toMatch(/^data:image\/svg\+xml,/u);
  expect(transport.requests).toEqual([photo.sourceUrl]);
  expect(calls).toHaveLength(1);
  expect(calls[0].options).toMatchObject({ format: "webp", height: 43, width: 64 });
  await resolve(photo);
  expect(transport.requests).toHaveLength(1);
});

test("a cached placeholder needs no fetch in a later build", async () => {
  const directory = await cacheDirectory();
  const first = createPlaceholderResolver({
    cacheDirectory: directory,
    fetch: scriptedFetch().fetch,
    imageConfig: {},
    service: scriptedService().service,
  });
  const value = await first(photo);
  const offline = scriptedFetch(503);
  const second = createPlaceholderResolver({
    cacheDirectory: directory,
    fetch: offline.fetch,
    imageConfig: {},
    service: scriptedService().service,
  });
  expect(await second(photo)).toBe(value);
  expect(offline.requests).toHaveLength(0);
  expect((await readdir(directory)).filter((name) => name.endsWith(".txt"))).toHaveLength(1);
});

test("transparent, animated, unsourced and untransformable images have no placeholder", async () => {
  const transport = scriptedFetch();
  const transparent = createPlaceholderResolver({
    cacheDirectory: await cacheDirectory(),
    fetch: transport.fetch,
    imageConfig: {},
    service: scriptedService(riff("VP8X", Uint8Array.of(0x10, 0, 0, 0, 0))).service,
  });
  expect(await transparent(photo)).toBeUndefined();
  expect(await transparent({ ...photo, mimeType: "image/gif" })).toBeUndefined();
  expect(await transparent({ ...photo, sourceUrl: undefined })).toBeUndefined();
  expect(await transparent({ ...photo, width: undefined })).toBeUndefined();
  const external = createPlaceholderResolver({
    cacheDirectory: await cacheDirectory(),
    fetch: transport.fetch,
    imageConfig: {},
    service: {},
  });
  expect(await external(photo)).toBeUndefined();
  expect(transport.requests).toHaveLength(1);
});

test("a failed original fetch names the URL and is retried later", async () => {
  const failing = scriptedFetch(500);
  const resolve = createPlaceholderResolver({
    cacheDirectory: await cacheDirectory(),
    fetch: failing.fetch,
    imageConfig: {},
    service: scriptedService().service,
  });
  await expect(resolve(photo)).rejects.toThrow(`${photo.sourceUrl} for its placeholder: HTTP 500`);
  await expect(resolve(photo)).rejects.toThrow(/HTTP 500/u);
  expect(failing.requests).toHaveLength(2);
});

test("prepared images list WebP variants and the placeholder style", async () => {
  const requested = [];
  const prepared = await prepareLaceImage(
    { ...photo, alt: "Desk", objectPosition: "25% 40%", src: "https://cms.example/photo" },
    {
      getImage: async (options) => {
        requested.push(options);
        return { src: `/_astro/photo-${options.width}.webp` };
      },
      imageConfig: {},
      placeholder: async () => "data:image/svg+xml,placeholder",
      service: {},
    },
  );
  expect(requested).toEqual([
    { format: "webp", height: 640, src: photo.sourceUrl, width: 960 },
    { format: "webp", height: 1280, src: photo.sourceUrl, width: 1920 },
  ]);
  expect(prepared).toEqual({
    src: "/_astro/photo-960.webp",
    srcset: "/_astro/photo-960.webp 960w, /_astro/photo-1920.webp 1920w",
    style: {
      "background-image": 'url("data:image/svg+xml,placeholder")',
      "background-position": "25% 40%",
      "background-repeat": "no-repeat",
      "background-size": "cover",
      "object-position": "25% 40%",
    },
  });
});

test("images without a build source or dimensions keep their public URL", async () => {
  const options = {
    getImage: async () => {
      throw new Error("no variants expected");
    },
    imageConfig: {},
    placeholder: async () => {
      throw new Error("no placeholder expected");
    },
    service: {},
  };
  expect(
    await prepareLaceImage(
      { alt: "", height: 600, src: "https://cms.example/a", width: 800 },
      options,
    ),
  ).toEqual({ src: "https://cms.example/a" });
  expect(
    await prepareLaceImage(
      {
        alt: "",
        objectPosition: "10% 20%",
        sourceUrl: "http://api/a",
        src: "https://cms.example/a",
      },
      options,
    ),
  ).toEqual({ src: "https://cms.example/a", style: { "object-position": "10% 20%" } });
});
