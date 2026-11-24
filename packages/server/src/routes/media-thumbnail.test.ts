import type { ThumbnailStorage } from "@lacecms/application";
import { actorId, type Actor } from "@lacecms/domain";
import { expect, test, vi } from "vitest";
import { admin, fixture, uploadImage } from "../test-support/app-harness.js";

const webp = new Uint8Array(
  Buffer.from(
    "524946463e000000574542505650382032000000d001009d012a0100010001402625a00274ba01f80003b000feeeff9ffe9a478d23c691f316fff32f3e65e7ccbcff98980000",
    "hex",
  ),
);
const viewer: Actor = { id: actorId("viewer"), role: "viewer" };

test("the session thumbnail route classifies access and revalidates the stored WebP independently", async () => {
  let current: Actor | null = admin;
  const get = vi.fn<ThumbnailStorage["get"]>(async () => ({
    async *[Symbol.asyncIterator]() {
      yield webp;
    },
  }));
  const { app, media } = await fixture({
    resolveActor: async () => current,
    importActors: { resolve: vi.fn(async () => null) },
    thumbnailStorage: {
      get,
      putIfAbsent: async () => {
        throw new Error("unexpected thumbnail write");
      },
      list: async () => ({ keys: [] }),
      delete: async () => {},
    },
  });
  const item = await uploadImage(app, "unpublished.png");
  const route = `/api/v1/admin/media/${item.id}`;
  const request = (headers: HeadersInit = {}) =>
    app.fetch(new Request(`https://lace.test${route}/thumbnail`, { headers }));
  current = viewer;
  const original = await app.fetch(new Request(`https://lace.test${route}/preview`));
  const first = await request({ "if-none-match": original.headers.get("etag")! });
  const tag = first.headers.get("etag")!;
  expect(tag).toMatch(/^"t-[a-f0-9]{64}"$/u);
  expect(tag).not.toBe(original.headers.get("etag"));
  expect(first.status).toBe(200);
  expect(first.headers.get("content-type")).toBe("image/webp");
  expect(first.headers.get("cache-control")).toBe("private, no-cache");
  expect(new Uint8Array(await first.arrayBuffer())).toEqual(webp);
  expect(first.headers.get("location")).toBeNull();

  for (const match of [tag, `W/${tag}`, `"elsewhere", W/${tag}`, "*"]) {
    const hit = await request({ "if-none-match": match });
    expect(hit.status, match).toBe(304);
    expect(hit.headers.get("etag")).toBe(tag);
    expect(hit.headers.get("cache-control")).toBe("private, no-cache");
    expect(await hit.text()).toBe("");
  }
  expect((await request({ "if-none-match": `${tag}, broken` })).status).toBe(200);
  for (const availability of [
    () => get.mockResolvedValueOnce(null),
    () => get.mockRejectedValueOnce(new Error("private location and provider failure")),
  ]) {
    availability();
    const unavailable = await request({ "if-none-match": "*" });
    expect(unavailable.status).toBe(503);
    expect(unavailable.headers.get("cache-control")).toBe("no-store");
    expect(unavailable.headers.get("etag")).toBeNull();
    expect(unavailable.headers.get("location")).toBeNull();
    expect(await unavailable.json()).toEqual({
      error: {
        code: "MEDIA_THUMBNAIL_UNAVAILABLE",
        message: "The media thumbnail is unavailable.",
      },
    });
  }

  get.mockClear();
  for (const bearer of ["Bearer import-token", "Bearer build-token"]) {
    expect((await request({ authorization: bearer, "if-none-match": tag })).status).toBe(403);
  }
  current = null;
  expect((await request({ "if-none-match": tag })).status).toBe(401);
  current = { ...viewer, authority: { permissions: [], operations: [] } };
  expect((await request({ "if-none-match": tag })).status).toBe(403);
  current = viewer;
  const missing = await app.fetch(
    new Request("https://lace.test/api/v1/admin/media/missing/thumbnail", {
      headers: { "if-none-match": "*" },
    }),
  );
  expect(missing.status).toBe(404);
  await media.requestDeletion({ actor: admin, mediaId: item.id });
  expect((await request({ "if-none-match": tag })).status).toBe(404);
  expect(get).not.toHaveBeenCalled();
});
