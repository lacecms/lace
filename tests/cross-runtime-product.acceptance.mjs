import { expect, test } from "vitest";
import { resolve } from "node:path";
import { openProductRuntime, png } from "./support/cross-runtime-fixture.mjs";
import { apiJourney } from "../scripts/cross-runtime-api.mjs";
import { astroJourney } from "../scripts/cross-runtime-astro.mjs";
import { browserJourney } from "../scripts/cross-runtime-browser.mjs";

test("34A both real compositions satisfy shared API, Astro and browser expectations", async () => {
  const results = [];
  for (const kind of ["node", "worker"]) {
    const f = await openProductRuntime(kind);
    try {
      const seed = await apiJourney(f);
      const astro = await astroJourney(f, seed);
      await browserJourney(f, resolve("."));
      results.push({ canonical: seed.canonical, globals: seed.globals, astro });
    } finally {
      await f.close();
    }
  }
  expect(results[0]).toEqual(results[1]);
}, 360000);

test("SM3A media tags expose identical Node and Worker contracts", async () => {
  const results = [];
  for (const kind of ["node", "worker"]) {
    const f = await openProductRuntime(kind);
    try {
      const admin = { cookie: f.cookies.admin };
      const form = new FormData();
      form.append("tags", " Project-2026 ");
      form.append("file", new Blob([png], { type: "image/png" }), "cover.png");
      form.append("tags", "PROJECT-2026");
      form.append("tags", "cover");
      const uploaded = await f.call("/api/v1/admin/media", {
        ...admin,
        method: "POST",
        body: form,
      });
      expect(uploaded.status, kind).toBe(201);
      const media = await uploaded.json();
      expect(media.tags).toEqual(["cover", "project-2026"]);
      const list = await f.call("/api/v1/admin/media?tag=cover&tag=project-2026", {
        cookie: f.cookies.viewer,
      });
      expect(list.status).toBe(200);
      expect((await list.json()).items.map((x) => x.id)).toEqual([media.id]);
      const catalog = await f.call("/api/v1/admin/media/tags?q=PRO", { cookie: f.cookies.viewer });
      expect(catalog.status).toBe(200);
      const detail = await f.call(`/api/v1/admin/media/${media.id}`, admin);
      const patched = await f.call(`/api/v1/admin/media/${media.id}`, {
        ...admin,
        method: "PATCH",
        headers: { "if-match": detail.headers.get("etag") },
        json: { tags: ["Other"] },
      });
      expect(patched.status).toBe(200);
      const changed = await patched.json();
      expect(changed).toMatchObject({
        media: { tags: ["other"] },
        build: { status: "not-dispatched" },
      });
      const invalid = await f.call(`/api/v1/admin/media/${media.id}`, {
        ...admin,
        method: "PATCH",
        headers: { "if-match": patched.headers.get("etag") },
        json: { tags: ["a b"] },
      });
      expect(invalid.status).toBe(422);
      expect((await invalid.json()).error.details.issues[0].path).toBe("/tags/0");
      for (const headers of [
        {},
        { authorization: "Bearer build-token" },
        { authorization: "Bearer mcp-token" },
      ]) {
        const denied = await f.call("/api/v1/admin/media/tags", { headers });
        expect([401, 403]).toContain(denied.status);
      }
      results.push({
        tags: media.tags,
        catalog: await catalog.json(),
        updated: changed.media.tags,
        build: changed.build,
      });
    } finally {
      await f.close();
    }
  }
  expect(results[0]).toEqual(results[1]);
}, 120000);
