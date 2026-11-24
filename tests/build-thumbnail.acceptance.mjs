import { expect, test, vi } from "vitest";
import { openProductRuntime, png } from "./support/cross-runtime-fixture.mjs";
import { fixtureImagesBinding } from "./support/media-thumbnails-fixture.mjs";

test.each(["node", "worker"])(
  "MP2 %s authorizes and revalidates current published thumbnails",
  async (kind) => {
    const fixture = await openProductRuntime(kind, { workerImages: fixtureImagesBinding() });
    try {
      const { runtime, cookies, call } = fixture;
      const { storage, thumbnails } = runtime.deletionDispatcher.options;
      vi.spyOn(runtime.thumbnails, "prepare").mockResolvedValue(undefined);
      const getThumbnail = vi.spyOn(thumbnails, "get");
      const getOriginal = vi.spyOn(storage, "get");
      const eligible = vi.spyOn(runtime.repository, "loadPublicMedia");
      async function json(path, input = {}, status = 200) {
        const response = await call(path, { cookie: cookies.admin, ...input });
        expect(response.status, path).toBe(status);
        return response.json();
      }
      const form = new FormData();
      form.append("file", new Blob([png], { type: "image/png" }), "mp2-poster.png");
      const media = await json("/api/v1/admin/media", { body: form, method: "POST" }, 201);
      const issued = await json(
        "/api/v1/admin/api-tokens",
        {
          method: "POST",
          json: { name: "mp2 build" },
        },
        201,
      );
      const importToken = await json(
        "/api/v1/admin/import-tokens",
        {
          method: "POST",
          json: { name: "mp2 import", expiresInDays: 1, allowPublish: false },
        },
        201,
      );
      const path = `/api/v1/public/build-media/${media.id}/thumbnail`;
      const auth = { authorization: `Bearer ${issued.token}` };
      const build = (validator) =>
        call(path, {
          origin: null,
          headers: validator === undefined ? auth : { ...auth, "if-none-match": validator },
        });
      for (const request of [
        {},
        { cookie: cookies.admin },
        { headers: { authorization: "Bearer invalid" } },
        { headers: { authorization: `Bearer ${importToken.token}` } },
      ]) {
        const result = await call(path, {
          ...request,
          headers: { ...request.headers, "if-none-match": "*" },
        });
        expect(result.status).toBe(401);
        expect(result.headers.get("www-authenticate")).toBe('Bearer realm="lace"');
        expect(result.headers.get("cache-control")).toBe("no-store");
      }
      expect(eligible).not.toHaveBeenCalled();
      expect(
        (await call(`/api/v1/admin/media/${media.id}/thumbnail`, { headers: auth })).status,
      ).toBe(403);
      const { items } = await json("/api/v1/admin/models/home/entries");
      const entryPath = `/api/v1/admin/entries/${items[0].id}`;
      const entry = await json(entryPath);
      const draft = await json(`${entryPath}/draft`, {
        method: "PUT",
        json: {
          expectedRevision: entry.draft.revision,
          title: "MP2",
          fields: {},
          blocks: [
            {
              key: "mp2-film",
              type: "videoEmbed",
              schemaVersion: 2,
              position: 1024,
              data: { url: "https://youtu.be/dQw4w9WgXcQ", title: "Film", poster: media.id },
            },
          ],
        },
      });
      expect((await build("*")).status).toBe(404);
      expect(getThumbnail).not.toHaveBeenCalled();
      expect(getOriginal).not.toHaveBeenCalled();
      const published = await json(`${entryPath}/publish`, {
        method: "POST",
        headers: { "idempotency-key": "mp2-publish" },
        json: { expectedRevision: draft.draft.revision },
      });
      const first = await build();
      expect(first.status).toBe(200);
      const etag = first.headers.get("etag");
      expect(etag).toMatch(/^"t-[a-f0-9]{64}"$/u);
      expect(first.headers.get("content-type")).toBe("image/webp");
      expect(first.headers.get("cache-control")).toBe("private, no-cache");
      expect(first.headers.get("location")).toBeNull();
      const bytes = Buffer.from(await first.arrayBuffer());
      expect(bytes.byteLength).toBeLessThanOrEqual(96 * 1024);
      const admin = await call(`/api/v1/admin/media/${media.id}/thumbnail`, {
        cookie: cookies.viewer,
      });
      expect(admin.headers.get("etag")).toBe(etag);
      expect(Buffer.from(await admin.arrayBuffer())).toEqual(bytes);
      expect(getOriginal).toHaveBeenCalledOnce();
      for (const validator of [etag, `W/${etag}`, "*"]) {
        const cached = await build(validator);
        expect(cached.status).toBe(304);
        expect(cached.headers.get("etag")).toBe(etag);
        expect(cached.headers.get("cache-control")).toBe("private, no-cache");
        expect(await cached.text()).toBe("");
      }
      expect((await build(`${etag}, broken`)).status).toBe(200);
      expect(getOriginal).toHaveBeenCalledOnce();
      getThumbnail.mockRejectedValueOnce(new Error("internal provider detail"));
      const unavailable = await build("*");
      expect(unavailable.status).toBe(503);
      expect(unavailable.headers.get("cache-control")).toBe("no-store");
      expect(await unavailable.json()).toEqual({
        error: {
          code: "MEDIA_THUMBNAIL_UNAVAILABLE",
          message: "The media thumbnail is unavailable.",
        },
      });
      const publication = published.published ?? (await json(entryPath)).published;
      await json(`${entryPath}/unpublish`, {
        method: "POST",
        json: { expectedPublishedSnapshotId: publication.id },
      });
      getThumbnail.mockClear();
      getOriginal.mockClear();
      expect((await build(etag)).status).toBe(404);
      await json(`/api/v1/admin/api-tokens/${issued.id}`, { method: "DELETE" });
      expect((await build(etag)).status).toBe(401);
      expect(getThumbnail).not.toHaveBeenCalled();
      expect(getOriginal).not.toHaveBeenCalled();
    } finally {
      await fixture.close();
    }
  },
  60_000,
);
