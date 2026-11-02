// @ts-nocheck
// TODO(rf2): Type import capability matrices, partial token security adapters and malformed query cases.
import { expect, test } from "vitest";
import { IMPORT_ROUTE_ALLOWLIST, isImportRoute } from "./index.js";

import { admin, editor, fixture, importToken, importFixture } from "./test-support/app-harness.js";

test("the import route allowlist is exactly the specified surface", () => {
  expect(IMPORT_ROUTE_ALLOWLIST.map(([method, route]) => `${method} ${route}`)).toEqual([
    "GET /api/v1/admin/content-models",
    "GET /api/v1/admin/models/:modelKey/entries",
    "POST /api/v1/admin/models/:modelKey/entries",
    "GET /api/v1/admin/entries/:entryId",
    "PUT /api/v1/admin/entries/:entryId/draft",
    "POST /api/v1/admin/entries/:entryId/publish",
    "GET /api/v1/admin/media",
    "POST /api/v1/admin/media",
    "GET /api/v1/admin/media/:mediaId",
    "PATCH /api/v1/admin/media/:mediaId",
    "GET /api/v1/admin/import-credential",
  ]);
  expect(Object.isFrozen(IMPORT_ROUTE_ALLOWLIST)).toBe(true);
  expect(isImportRoute("GET", "/api/v1/admin/media/m-1")).toBe(true);
  expect(isImportRoute("HEAD", "/api/v1/admin/media/m-1")).toBe(true);
  for (const [method, path] of [
    ["GET", "/api/v1/admin/media/tags"],
    ["GET", "/api/v1/admin/media/m-1/preview"],
    ["DELETE", "/api/v1/admin/media/m-1"],
    ["GET", "/api/v1/admin/models//entries"],
    ["GET", "/api/v1/admin/entries/e-1/link-impact"],
    ["GET", "/api/v1/admin/content-models/extra"],
  ])
    expect(isImportRoute(method, path), `${method} ${path}`).toBe(false);
});

test("import tokens reach allowlisted routes as their creator without a session", async () => {
  const hash = "0".repeat(63) + "1";
  const { call, sessions, limited, store } = await importFixture();
  expect((await call("GET", "/api/v1/admin/content-models")).status).toBe(200);
  const created = await call("POST", "/api/v1/admin/models/posts/entries", {
    blocks: [],
    fields: {},
    slug: "hello-world",
    title: "Hello",
  });
  expect(created.status).toBe(201);
  const entry = await created.json();
  expect(entry.updatedBy).toMatchObject({ id: "admin" });
  const read = await call("GET", `/api/v1/admin/entries/${entry.id}`);
  expect(read.status).toBe(200);
  const saved = await call("PUT", `/api/v1/admin/entries/${entry.id}/draft`, {
    blocks: [],
    expectedRevision: 1,
    fields: {},
    slug: "hello-world",
    title: "Hello again",
  });
  expect(saved.status).toBe(200);
  const bySlug = await (
    await call("GET", "/api/v1/admin/models/posts/entries?slug=hello-world")
  ).json();
  expect(bySlug.items.map((item) => item.id)).toEqual([entry.id]);
  expect(bySlug.totals.all).toBe(1);

  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    "cover.png",
  );
  const uploaded = await call("POST", "/api/v1/admin/media", form);
  expect(uploaded.status).toBe(201);
  const media = await uploaded.json();
  expect(media.sha256).toMatch(/^[0-9a-f]{64}$/u);
  expect(limited).toContain("admin");
  const found = await (await call("GET", `/api/v1/admin/media?sha256=${media.sha256}`)).json();
  expect(found.items.map((item) => item.id)).toEqual([media.id]);
  expect((await (await call("GET", `/api/v1/admin/media?sha256=${hash}`)).json()).items).toEqual(
    [],
  );
  expect((await call("GET", `/api/v1/admin/media/${media.id}`)).status).toBe(200);
  expect(sessions).toEqual([]);
  expect(store).toBeDefined();
});

test("import tokens are denied everywhere else and never fall back to a session", async () => {
  const { call, sessions, presented } = await importFixture();
  for (const [method, path] of [
    ["DELETE", "/api/v1/admin/entries/e-1"],
    ["POST", "/api/v1/admin/entries/e-1/unpublish"],
    ["POST", "/api/v1/admin/entries/e-1/revert"],
    ["POST", "/api/v1/admin/entries/e-1/duplicate"],
    ["DELETE", "/api/v1/admin/media/m-1"],
    ["POST", "/api/v1/admin/media/m-1/retry-deletion"],
    ["GET", "/api/v1/admin/media/m-1/preview"],
    ["GET", "/api/v1/admin/media/tags"],
    ["GET", "/api/v1/admin/link-targets"],
    ["GET", "/api/v1/admin/builds"],
    ["GET", "/api/v1/admin/session"],
    ["GET", "/api/v1/admin/users"],
    ["GET", "/api/v1/admin/invitations"],
    ["GET", "/api/v1/admin/settings/status"],
    ["POST", "/api/v1/admin/api-tokens"],
    ["GET", "/api/v1/admin/import-tokens"],
    ["POST", "/api/v1/admin/import-tokens"],
    ["GET", "/api/v1/account/sessions"],
  ]) {
    const response = await call(method, path, method === "GET" ? undefined : {});
    expect(response.status, `${method} ${path}`).toBe(403);
    expect((await response.json()).error.code).toBe("AUTHORIZATION_DENIED");
  }
  expect(presented).toEqual([]);
  expect(sessions).toEqual([]);
  // An invalid Bearer value beside a valid session cookie is still denied.
  const withCookie = await call("GET", "/api/v1/admin/content-models", undefined, {
    authorization: "Bearer bad",
    cookie: "better-auth.session_token=valid",
  });
  expect(withCookie.status).toBe(403);
  const queryToken = await call("GET", "/api/v1/admin/media?access_token=good", undefined, {
    authorization: "",
  });
  expect(queryToken.status).toBe(403);
  expect(sessions).toEqual([]);
});

test("publication through an import token needs its publish capability", async () => {
  for (const [capabilities, status] of [
    [["content:import"], 403],
    [["content:import", "content:publish"], 200],
  ]) {
    const { call } = await importFixture(capabilities);
    const created = await (
      await call("POST", "/api/v1/admin/models/posts/entries", {
        blocks: [],
        fields: {},
        slug: "post",
        title: "Post",
      })
    ).json();
    const published = await call("POST", `/api/v1/admin/entries/${created.id}/publish`, {
      expectedRevision: 1,
    });
    expect(published.status, capabilities.join(" ")).toBe(status);
  }
});

test("the import credential describes itself only to import tokens", async () => {
  const { call } = await importFixture(["content:import", "content:publish"]);
  const described = await call("GET", "/api/v1/admin/import-credential");
  expect(described.status).toBe(200);
  expect(described.headers.get("cache-control")).toBe("no-store");
  expect(await described.json()).toEqual({
    permissions: ["content:read", "content:write", "content:publish", "media:write"],
    token: {
      capabilities: ["content:import", "content:publish"],
      createdAt: "1970-01-01T00:00:00.001Z",
      createdBy: { email: "admin@lace.test", id: "admin" },
      expiresAt: "1970-01-08T00:00:00.000Z",
      id: "import-1",
      name: "Framer",
      tokenPrefix: "abcdefgh",
    },
  });
  const demoted = await importFixture(["content:import", "content:publish"], { role: "editor" });
  expect(
    (await (await demoted.call("GET", "/api/v1/admin/import-credential")).json()).permissions,
  ).toEqual(["content:read", "content:write", "media:write"]);
  const { app } = await fixture();
  expect(
    (await app.fetch(new Request("https://lace.test/api/v1/admin/import-credential"))).status,
  ).toBe(403);
});

test("administrators issue, list and revoke import tokens through session routes", async () => {
  const calls = [];
  const security = {
    async createImportToken(input) {
      calls.push(["create", input]);
      return { ...importToken(input.capabilities), name: input.name, token: "plaintext" };
    },
    async listImportTokens() {
      return [importToken()];
    },
    async revokeImportToken(input) {
      calls.push(["revoke", input.tokenId]);
      return input.tokenId === "import-1" ? { ...importToken(), revokedAt: 5 } : null;
    },
  };
  let current = admin;
  const { app } = await fixture({
    maxBodyBytes: 8192,
    resolveActor: async () => current,
    security,
  });
  const send = (method, path, body) =>
    app.fetch(
      new Request(`https://lace.test${path}`, {
        method,
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
      }),
    );
  const created = await send("POST", "/api/v1/admin/import-tokens", {
    allowPublish: true,
    expiresInDays: 3,
    name: "Framer",
  });
  expect(created.status).toBe(201);
  expect(await created.json()).toMatchObject({
    capabilities: ["content:import", "content:publish"],
    token: "plaintext",
  });
  expect(calls[0][1]).toMatchObject({
    capabilities: ["content:import", "content:publish"],
    createdBy: "admin",
    name: "Framer",
  });
  expect(calls[0][1].expiresAt - calls[0][1].now).toBe(3 * 86_400_000);
  const listed = await (await send("GET", "/api/v1/admin/import-tokens")).json();
  expect(listed.items).toHaveLength(1);
  expect(listed.items[0]).not.toHaveProperty("token");
  expect((await send("DELETE", "/api/v1/admin/import-tokens/import-1")).status).toBe(200);
  expect((await send("DELETE", "/api/v1/admin/import-tokens/missing")).status).toBe(404);
  const invalid = await send("POST", "/api/v1/admin/import-tokens", {
    expiresInDays: 30,
    name: "Framer",
  });
  expect(invalid.status).toBe(422);
  expect((await invalid.json()).error.details.issues.map((issue) => issue.path)).toContain(
    "/expiresInDays",
  );
  current = editor;
  expect(
    (await send("POST", "/api/v1/admin/import-tokens", { expiresInDays: 1, name: "x" })).status,
  ).toBe(403);
  expect((await send("GET", "/api/v1/admin/import-tokens")).status).toBe(403);
  expect(calls.filter(([kind]) => kind === "create")).toHaveLength(1);
});

test("slug and hash list parameters are validated and bind cursors", async () => {
  const { app, content } = await fixture();
  for (const slug of ["a", "a", "b"])
    await content.create({
      actor: admin,
      blocks: [],
      fields: {},
      modelKey: "posts",
      slug,
      title: slug,
    });
  const get = async (path) => {
    const response = await app.fetch(new Request(`https://lace.test${path}`));
    return { body: await response.json(), status: response.status };
  };
  const first = await get("/api/v1/admin/models/posts/entries?slug=a&limit=1");
  expect(first.body.items).toHaveLength(1);
  expect(first.body.totals.all).toBe(2);
  const after = encodeURIComponent(first.body.nextCursor);
  expect(
    (await get(`/api/v1/admin/models/posts/entries?slug=a&limit=1&after=${after}`)).status,
  ).toBe(200);
  expect(
    (await get(`/api/v1/admin/models/posts/entries?slug=b&limit=1&after=${after}`)).status,
  ).toBe(422);
  for (const [path, pointer] of [
    ["/api/v1/admin/models/posts/entries?slug=Bad", "/slug"],
    ["/api/v1/admin/models/home/entries?slug=home", "/slug"],
    [`/api/v1/admin/media?sha256=${"A".repeat(64)}`, "/sha256"],
    ["/api/v1/admin/media?sha256=abc", "/sha256"],
  ]) {
    const result = await get(path);
    expect(result.status, path).toBe(422);
    expect(result.body.error.details.issues.map((issue) => issue.path)).toContain(pointer);
  }
});
