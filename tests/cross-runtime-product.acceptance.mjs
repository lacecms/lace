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

test("SM4A import tokens, hash and slug lookups behave identically on Node and Worker", async () => {
  const results = [];
  for (const kind of ["node", "worker"]) {
    const f = await openProductRuntime(kind);
    try {
      const admin = { cookie: f.cookies.admin };
      const issued = await f.call("/api/v1/admin/import-tokens", {
        ...admin,
        method: "POST",
        json: { allowPublish: false, expiresInDays: 1, name: "Framer" },
      });
      expect(issued.status, kind).toBe(201);
      const { token, id } = await issued.json();
      const bearer = (options = {}) => ({
        origin: null,
        ...options,
        headers: { authorization: `Bearer ${token}`, ...options.headers },
      });
      const described = await f.call("/api/v1/admin/import-credential", bearer());
      expect(described.status, kind).toBe(200);
      const credential = await described.json();

      const form = new FormData();
      form.append("file", new Blob([png], { type: "image/png" }), "cover.png");
      const uploaded = await f.call("/api/v1/admin/media", bearer({ method: "POST", body: form }));
      expect(uploaded.status, kind).toBe(201);
      const media = await uploaded.json();
      const byHash = await f.call(`/api/v1/admin/media?sha256=${media.sha256}`, bearer());
      const hashIds = (await byHash.json()).items.map((item) => item.id);

      const models = await (await f.call("/api/v1/admin/content-models", bearer())).json();
      const collection = models.items.find((model) => model.kind === "collection");
      const created = await f.call(
        `/api/v1/admin/models/${collection.key}/entries`,
        bearer({
          method: "POST",
          json: { blocks: [], fields: {}, slug: "sm4a-import", title: "SM4A import" },
        }),
      );
      expect(created.status, kind).toBe(201);
      const entry = await created.json();
      const bySlug = await (
        await f.call(`/api/v1/admin/models/${collection.key}/entries?slug=sm4a-import`, bearer())
      ).json();

      const denied = [];
      for (const [path, options] of [
        [`/api/v1/admin/entries/${entry.id}`, { method: "DELETE" }],
        [
          `/api/v1/admin/entries/${entry.id}/publish`,
          { method: "POST", json: { expectedRevision: 1 } },
        ],
        [`/api/v1/admin/media/${media.id}`, { method: "DELETE" }],
        ["/api/v1/admin/users", {}],
        ["/api/v1/admin/session", {}],
      ])
        denied.push((await f.call(path, bearer(options))).status);
      const foreign = await f.call(
        `/api/v1/admin/models/${collection.key}/entries`,
        bearer({
          method: "POST",
          origin: "https://evil.example",
          json: { blocks: [], fields: {}, slug: "foreign", title: "Foreign" },
        }),
      );
      const buildExport = await f.call("/api/v1/public/build-export", bearer());
      const cookieAndBadBearer = await f.call("/api/v1/admin/content-models", {
        ...admin,
        headers: { authorization: "Bearer not-a-token" },
      });
      const revoked = await f.call(`/api/v1/admin/import-tokens/${id}`, {
        ...admin,
        method: "DELETE",
      });
      const afterRevoke = await f.call("/api/v1/admin/import-credential", bearer());
      const listed = await (await f.call("/api/v1/admin/import-tokens", admin)).json();
      results.push({
        afterRevoke: afterRevoke.status,
        buildExport: buildExport.status,
        cookieAndBadBearer: cookieAndBadBearer.status,
        credential: { permissions: credential.permissions, name: credential.token.name },
        denied,
        foreign: foreign.status,
        hashMatches: hashIds.length === 1 && hashIds[0] === media.id,
        listedRevoked: listed.items.some((item) => item.id === id && item.revokedAt !== undefined),
        revoked: revoked.status,
        sha256: /^[0-9a-f]{64}$/u.test(media.sha256),
        slugMatches: bySlug.items.map((item) => item.id).join() === entry.id,
        updatedBy: entry.updatedBy.displayName !== undefined,
      });
    } finally {
      await f.close();
    }
  }
  expect(results[0]).toEqual({
    afterRevoke: 403,
    buildExport: 403,
    cookieAndBadBearer: 403,
    credential: {
      name: "Framer",
      permissions: ["content:read", "content:write", "media:write"],
    },
    denied: [403, 403, 403, 403, 403],
    foreign: 403,
    hashMatches: true,
    listedRevoked: true,
    revoked: 200,
    sha256: true,
    slugMatches: true,
    updatedBy: true,
  });
  expect(results[1]).toEqual(results[0]);
}, 360000);
