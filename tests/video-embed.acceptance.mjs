import { expect, test } from "vitest";
import { openProductRuntime, png } from "./support/cross-runtime-fixture.mjs";
import { readCompleteBuildExport } from "../packages/test-utils/dist/index.js";

test("video embeds preserve publication, poster usage and permissions on both runtimes", async () => {
  for (const kind of ["node", "worker"]) {
    const f = await openProductRuntime(kind);
    try {
      const admin = { cookie: f.cookies.admin };
      const json = async (path, options = {}, status = 200) => {
        const response = await f.call(path, { ...admin, ...options });
        expect(response.status, `${kind} ${path}: ${await response.clone().text()}`).toBe(status);
        return response.json();
      };
      const upload = async () => {
        const form = new FormData();
        form.append("file", new Blob([png], { type: "image/png" }), "poster.png");
        return json("/api/v1/admin/media", { method: "POST", body: form }, 201);
      };
      const poster = await upload();
      const hiddenPoster = await upload();
      const entries = await json("/api/v1/admin/models/home/entries");
      let entry = await json(`/api/v1/admin/entries/${entries.items[0].id}`);
      const save = (blocks, cookie = f.cookies.admin, revision = entry.draft.revision) =>
        json(`/api/v1/admin/entries/${entry.id}/draft`, {
          cookie,
          method: "PUT",
          json: { expectedRevision: revision, title: "Film", fields: {}, blocks },
        });
      const publish = () =>
        json(`/api/v1/admin/entries/${entry.id}/publish`, {
          method: "POST",
          headers: { "idempotency-key": `video-${kind}-${entry.draft.revision}` },
          json: { expectedRevision: entry.draft.revision },
        });
      const block = {
        key: "video-one",
        type: "videoEmbed",
        schemaVersion: 1,
        position: 1000,
        data: { url: "https://youtu.be/dQw4w9WgXcQ", title: "Film" },
      };
      entry = await save([block]);
      await publish();
      expect((await f.call(`/api/v1/public/media/${poster.id}`)).status).toBe(404);
      const withPoster = { ...block, data: { ...block.data, poster: poster.id } };
      const hidden = {
        ...withPoster,
        key: "hidden-video",
        position: 2000,
        hidden: true,
        data: { ...block.data, poster: hiddenPoster.id },
      };
      entry = await save([withPoster, hidden]);
      await publish();
      expect((await f.call(`/api/v1/public/media/${poster.id}`)).status).toBe(200);
      expect((await f.call(`/api/v1/public/media/${hiddenPoster.id}`)).status).toBe(404);
      const detail = await json(`/api/v1/admin/media/${poster.id}`);
      expect(detail.usageCount).toBe(1);
      const refused = await f.call(`/api/v1/admin/media/${poster.id}`, {
        ...admin,
        method: "DELETE",
      });
      expect(refused.status).toBe(409);
      const token = await json(
        "/api/v1/admin/api-tokens",
        { method: "POST", json: { name: "embed-build" } },
        201,
      );
      const read = () =>
        readCompleteBuildExport(
          (url, init) => {
            const target = new URL(url);
            return f.call(`${target.pathname}${target.search}`, init);
          },
          "https://lace.invalid",
          token.token,
        );
      const before = (await read()).export;
      const published = before.entries.find((item) => item.id === entry.id);
      expect(published.blocks).toHaveLength(1);
      expect(published.blocks[0].data.poster).toBe(poster.id);
      expect(before.media[hiddenPoster.id]).toBeUndefined();
      const previousRevision = entry.draft.revision;
      entry = await save([
        { ...block, data: { url: "https://vimeo.com/123/abc", title: "Draft film" } },
      ]);
      expect((await read()).export.entries.find((item) => item.id === entry.id)).toEqual(published);
      const viewer = await f.call(`/api/v1/admin/entries/${entry.id}/draft`, {
        cookie: f.cookies.viewer,
        method: "PUT",
        json: { expectedRevision: entry.draft.revision, title: "No", fields: {}, blocks: [] },
      });
      expect(viewer.status).toBe(403);
      const stale = await f.call(`/api/v1/admin/entries/${entry.id}/draft`, {
        ...admin,
        method: "PUT",
        json: { expectedRevision: previousRevision, title: "Stale", fields: {}, blocks: [] },
      });
      expect(stale.status).toBe(409);
      await publish();
      expect(
        (await read()).export.entries.find((item) => item.id === entry.id).blocks[0].data,
      ).toEqual({ url: "https://vimeo.com/123/abc", title: "Draft film" });
    } finally {
      await f.close();
    }
  }
}, 180_000);
