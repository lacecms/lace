import { expect, test } from "vitest";
import { createLaceApp } from "../dist/index.js";
import { ContentUseCases, MediaUseCases, SiteBuildUseCases } from "@lacecms/application";
import { defineCollection, defineConfig, definePage } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import {
  actorId,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  unixMilliseconds,
} from "@lacecms/domain";
import {
  DeterministicClock,
  DeterministicIdGenerator,
  InMemoryContentStore,
  InMemoryObjectStorage,
} from "@lacecms/test-utils";

const admin = { id: actorId("admin"), role: "admin" };
const editor = { id: actorId("editor"), role: "editor" };

async function fixture({
  actor = admin,
  auth,
  ready = true,
  allowed = true,
  maxBodyBytes = 256,
  models,
  builds,
  security,
  buildSite,
} = {}) {
  const config = await defineConfig({
    blocks: [
      defineBlock({
        fields: { heading: field.text({ required: true }) },
        type: "hero",
        version: 1,
      }),
      defineBlock({ fields: { body: field.richText() }, type: "richText", version: 1 }),
    ],
    content: models ?? [
      definePage({ key: "home", path: "/", version: 1 }),
      defineCollection({
        blocks: ["hero"],
        fields: { author: field.text(), image: field.media() },
        key: "posts",
        listFields: ["author"],
        route: "/blog/:slug",
        version: 1,
      }),
    ],
  });
  const store = new InMemoryContentStore();
  const storage = new InMemoryObjectStorage();
  const content = new ContentUseCases({
    clock: new DeterministicClock(unixMilliseconds(1)),
    config: config.runtime,
    content: store,
    idGenerator: new DeterministicIdGenerator("server"),
    media: store,
  });
  const logs = [];
  const media = new MediaUseCases({
    clock: new DeterministicClock(unixMilliseconds(1)),
    idGenerator: new DeterministicIdGenerator("media"),
    imageInspector: {
      async inspect() {
        return { height: 1, width: 1 };
      },
    },
    logger: { error() {} },
    media: store,
    publicMedia: store,
    storage,
  });
  let exportLoads = 0;
  const app = createLaceApp({
    ...(auth === undefined ? {} : { auth }),
    actors: { resolve: async () => actor },
    adminAssets: { fetch: async () => new Response("admin-shell") },
    config,
    content,
    buildSite,
    ...(builds === undefined ? {} : { builds }),
    ...(security === undefined ? {} : { security }),
    environment: { engineVersion: "0.0.0-test", openApiTitle: "Lace test" },
    logger: { log: (entry) => logs.push(entry) },
    maxBodyBytes,
    media,
    publicBaseUrl: "https://lace.test/",
    publicContent: {
      exportBuildContent: async () => {
        exportLoads += 1;
        return store.exportBuildContent();
      },
      listPublic: store.listPublic.bind(store),
      loadPublic: store.loadPublic.bind(store),
      loadPublicMedia: store.loadPublicMedia.bind(store),
      publishedContentVersion: store.publishedContentVersion.bind(store),
    },
    rateLimiter: { check: async () => allowed },
    readiness: { isReady: async () => ready },
    requestIds: { next: () => `request-${logs.length + 1}` },
  });
  return { app, content, exportLoads: () => exportLoads, logs, media, storage, store };
}

test("admin build routes queue strict requests without running a trigger", async () => {
  const calls = [];
  const builds = new SiteBuildUseCases({
    clock: { now: () => unixMilliseconds(1) },
    builds: {
      listSiteBuilds: async () => [],
      getSiteBuild: async () => null,
      requestBuild: async (input) => {
        calls.push(input);
        return { coalesced: false, eventId: "event-1", targetVersion: 4 };
      },
    },
  });
  const { app } = await fixture({ builds });
  const post = (path, body) =>
    app.fetch(
      new Request(`https://lace.test${path}`, {
        method: "POST",
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
      }),
    );
  expect((await post("/api/v1/admin/builds")).status).toBe(202);
  expect((await post("/api/v1/admin/builds/failed-1/retry", {})).status).toBe(202);
  expect(calls).toMatchObject([{}, { retryOfBuildId: "failed-1" }]);
  expect((await post("/api/v1/admin/builds", { command: "echo secret" })).status).toBe(422);
  expect(calls).toHaveLength(2);
  const editorApp = (await fixture({ actor: editor, builds })).app;
  expect(
    (
      await editorApp.fetch(
        new Request("https://lace.test/api/v1/admin/builds", { method: "POST" }),
      )
    ).status,
  ).toBe(403);
  expect(calls).toHaveLength(2);
});

test.each([admin, editor, { id: actorId("viewer"), role: "viewer" }])(
  "authenticated build reads expose source diagnostics for $role",
  async (actor) => {
    const build = {
      id: "build-1",
      reason: "publication",
      status: "failed",
      targetVersion: 3,
      requestedBy: "admin",
      requestedAt: unixMilliseconds(1_000),
      startedAt: unixMilliseconds(2_000),
      completedAt: unixMilliseconds(3_000),
      error: "source_symlink",
      errorPath: "src/linked.astro",
    };
    const builds = new SiteBuildUseCases({
      clock: { now: () => unixMilliseconds(1) },
      builds: {
        listSiteBuilds: async () => [build],
        getSiteBuild: async (id) => (id === build.id ? build : null),
        requestBuild: async () => ({ coalesced: false, eventId: "event-1", targetVersion: 3 }),
      },
    });
    const { app } = await fixture({ actor, builds });
    const get = (path) => app.fetch(new Request(`https://lace.test${path}`));
    expect(await (await get("/api/v1/admin/site-builds")).json()).toMatchObject({
      items: [
        { id: "build-1", targetVersion: 3, error: "source_symlink", errorPath: "src/linked.astro" },
      ],
    });
    expect(await (await get("/api/v1/admin/site-builds/build-1")).json()).toMatchObject({
      error: "source_symlink",
      errorPath: "src/linked.astro",
    });
    expect((await get("/api/v1/admin/site-builds/missing")).status).toBe(404);
    const anonymous = (await fixture({ actor: null, builds })).app;
    expect(
      (await anonymous.fetch(new Request("https://lace.test/api/v1/admin/site-builds"))).status,
    ).toBe(403);
  },
);

test("mounts authentication before API and admin fallbacks", async () => {
  const { app } = await fixture({
    auth: { fetch: async () => new Response("auth-route", { status: 202 }) },
  });
  expect(
    await (await app.fetch(new Request("https://lace.test/api/auth/sign-in/email"))).text(),
  ).toBe("auth-route");
  expect((await app.fetch(new Request("https://lace.test/api/auth/sign-in/email"))).status).toBe(
    202,
  );
  expect(await (await app.fetch(new Request("https://lace.test/health/live"))).json()).toEqual({
    status: "live",
  });
  expect(await json(app, "/api/unknown")).toMatchObject({ response: { status: 404 } });
});

async function json(app, path, init) {
  const response = await app.fetch(new Request(`https://lace.test${path}`, init));
  return {
    body: response.status === 204 || response.status === 304 ? undefined : await response.json(),
    response,
  };
}

test("keeps liveness, readiness, request IDs, and logs separate", async () => {
  const { app, logs } = await fixture({ ready: false });
  const live = await json(app, "/health/live");
  const ready = await json(app, "/health/ready");
  expect(live).toMatchObject({ body: { status: "live" }, response: { status: 200 } });
  expect(ready).toMatchObject({ body: { status: "not_ready" }, response: { status: 503 } });
  expect(live.response.headers.get("x-request-id")).toBe("request-1");
  expect(JSON.stringify(logs)).not.toContain("authorization");
});

test("settings status exposes only useful read-only state to administrators", async () => {
  const adminFixture = await fixture({ ready: false });
  expect(await json(adminFixture.app, "/api/v1/admin/settings/status")).toMatchObject({
    body: { configuredModels: 2, engineVersion: "0.0.0-test", ready: false },
    response: { status: 200 },
  });
  const editorFixture = await fixture({ actor: editor });
  expect(await json(editorFixture.app, "/api/v1/admin/settings/status")).toMatchObject({
    body: { error: { code: "AUTHORIZATION_DENIED" } },
    response: { status: 403 },
  });
  for (const actor of [null, { id: actorId("viewer"), role: "viewer" }]) {
    const other = await fixture({ actor });
    const result = await json(other.app, "/api/v1/admin/settings/status", {
      headers: { authorization: "Bearer build-token" },
    });
    expect(result.response.status).toBe(403);
    expect(result.body).not.toHaveProperty("engineVersion");
  }
});

test("editor and viewer mutations are denied by the API independently of Admin controls", async () => {
  const editorApp = (await fixture({ actor: editor })).app;
  const viewerApp = (await fixture({ actor: { id: actorId("viewer"), role: "viewer" } })).app;
  const post = (body) => ({
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  for (const [path, init] of [
    [
      "/api/v1/admin/entries/missing/publish",
      {
        ...post({ expectedRevision: 1 }),
        headers: { "content-type": "application/json", "idempotency-key": "acceptance" },
      },
    ],
    [
      "/api/v1/admin/users",
      post({ email: "other@example.test", password: "long-password-123", role: "viewer" }),
    ],
    ["/api/v1/admin/api-tokens", post({ name: "disallowed" })],
  ]) {
    expect((await json(editorApp, path, init)).response.status).toBe(403);
  }
  expect(
    (
      await json(
        viewerApp,
        "/api/v1/admin/models/posts/entries",
        post({ title: "Denied", slug: "denied", fields: {}, blocks: [] }),
      )
    ).response.status,
  ).toBe(403);
  const media = new FormData();
  media.append("file", new File([new Uint8Array([1])], "denied.png", { type: "image/png" }));
  expect(
    (
      await viewerApp.fetch(
        new Request("https://lace.test/api/v1/admin/media", { body: media, method: "POST" }),
      )
    ).status,
  ).toBe(403);
});

test("serves public content and short-circuits matching build exports", async () => {
  const { app, content, exportLoads } = await fixture();
  const entry = await content.create({
    actor: admin,
    blocks: [],
    fields: {},
    modelKey: "posts",
    slug: "first",
    title: "First",
  });
  await content.publish({ actor: admin, entryId: entry.id, expectedRevision: 1 });
  expect(await json(app, "/api/v1/public/collections/posts?limit=1")).toMatchObject({
    body: { items: [{ path: "/blog/first" }] },
    response: { status: 200 },
  });
  const fresh = await json(app, "/api/v1/public/build-export");
  expect(fresh.response.headers.get("etag")).toBe('"1"');
  expect(exportLoads()).toBe(1);
  expect(
    (await json(app, "/api/v1/public/build-export", { headers: { "if-none-match": '"1"' } }))
      .response.status,
  ).toBe(304);
  expect(exportLoads()).toBe(1);
  const weak = await json(app, "/api/v1/public/build-export", {
    headers: { "if-none-match": 'W/"1"' },
  });
  expect(weak.response.status).toBe(304);
  expect(weak.response.headers.get("etag")).toBe('"1"');
  expect(weak.body).toBeUndefined();
  expect(exportLoads()).toBe(1);
  expect(
    (await json(app, "/api/v1/public/build-export", { headers: { "if-none-match": '"0"' } }))
      .response.status,
  ).toBe(200);
  expect(exportLoads()).toBe(2);
  expect(
    await json(app, "/api/v1/public/build-export", { headers: { "if-none-match": "invalid" } }),
  ).toMatchObject({ body: { error: { code: "VALIDATION_FAILED" } }, response: { status: 422 } });
  const openApi = await json(app, "/api/v1/openapi.json");
  expect(openApi.body.paths).toHaveProperty("/api/v1/public/build-export");
});

test("validates admin requests, rejects anonymous actors, and protects fallbacks", async () => {
  const anonymous = await fixture({ actor: null });
  expect(await json(anonymous.app, "/api/v1/admin/content-models")).toMatchObject({
    body: { error: { code: "AUTHORIZATION_DENIED" } },
    response: { status: 403 },
  });
  const authenticated = await fixture({ actor: editor });
  expect(await json(authenticated.app, "/api/v1/admin/content-models")).toMatchObject({
    body: {
      items: [
        { blockDefinitions: [], blocks: [], key: "home" },
        {
          blockDefinitions: [{ fields: { heading: { type: "text" } }, type: "hero" }],
          key: "posts",
        },
      ],
    },
    response: { status: 200 },
  });
  expect(
    await json(authenticated.app, "/api/v1/admin/models/posts/entries", {
      body: JSON.stringify({ blocks: [], fields: {}, title: "Post", unknown: true }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  ).toMatchObject({ body: { error: { code: "VALIDATION_FAILED" } }, response: { status: 422 } });
  expect(
    await json(authenticated.app, "/api/v1/admin/models/posts/entries", {
      body: JSON.stringify({ blocks: [], fields: {}, slug: "post", title: "Post" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  ).toMatchObject({ body: { model: { key: "posts" } }, response: { status: 201 } });
  const publisher = await fixture();
  const created = await json(publisher.app, "/api/v1/admin/models/posts/entries", {
    body: JSON.stringify({ blocks: [], fields: {}, slug: "publish", title: "Publish" }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const entryId = created.body.id;
  expect(
    await json(publisher.app, `/api/v1/admin/entries/${entryId}/draft`, {
      body: JSON.stringify({
        blocks: [],
        expectedRevision: 1,
        fields: {},
        slug: "publish",
        title: "Changed",
      }),
      headers: { "content-type": "application/json", "if-match": '"2"' },
      method: "PUT",
    }),
  ).toMatchObject({ body: { error: { code: "VALIDATION_FAILED" } }, response: { status: 422 } });
  expect(
    await json(publisher.app, `/api/v1/admin/entries/${entryId}/publish`, {
      body: JSON.stringify({ expectedRevision: 1 }),
      headers: { "content-type": "application/json", "idempotency-key": "publish-key" },
      method: "POST",
    }),
  ).toMatchObject({
    body: {
      build: { status: "queued" },
      entry: { published: { state: "published" } },
      publication: "published",
    },
    response: { status: 200 },
  });
  expect(
    await (await authenticated.app.fetch(new Request("https://lace.test/admin/content"))).text(),
  ).toBe("admin-shell");
  expect(await json(authenticated.app, "/api/unknown")).toMatchObject({
    body: { error: { code: "NOT_FOUND" } },
    response: { status: 404 },
  });
});

test("content validation failures use the validation envelope with JSON Pointers", async () => {
  const { app, store } = await fixture({
    maxBodyBytes: 4096,
    models: [
      defineCollection({
        blocks: ["hero", "richText"],
        fields: { summary: field.text({ required: true }) },
        key: "notes",
        route: "/notes/:slug",
        version: 1,
      }),
    ],
  });
  const send = (path, body, method = "POST") =>
    json(app, path, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method,
    });
  expect(
    await send("/api/v1/admin/models/notes/entries", {
      blocks: [],
      fields: { unknown: "x" },
      slug: "bad",
      title: "Bad",
    }),
  ).toMatchObject({
    body: {
      error: {
        code: "VALIDATION_FAILED",
        details: { issues: [{ code: "unknown_field", path: "/fields/unknown" }] },
      },
    },
    response: { status: 422 },
  });

  const created = await send("/api/v1/admin/models/notes/entries", {
    blocks: [],
    fields: {},
    slug: "note",
    title: "Note",
  });
  expect(created.response.status).toBe(201);
  const entryId = created.body.id;
  const rejected = await send(
    `/api/v1/admin/entries/${entryId}/draft`,
    {
      blocks: [
        {
          data: { body: { content: [{ type: "html" }], type: "doc" } },
          key: "01J00000000000000000000000",
          position: 1024,
          schemaVersion: 1,
          type: "richText",
        },
      ],
      expectedRevision: 1,
      fields: {},
      slug: "note",
      title: "Note",
    },
    "PUT",
  );
  expect(rejected).toMatchObject({
    body: {
      error: {
        code: "VALIDATION_FAILED",
        details: { issues: [{ code: "invalid_field_value", path: "/blocks/0/data/body" }] },
      },
    },
    response: { status: 422 },
  });
  expect(JSON.stringify(rejected.body)).not.toContain("html");
  expect((await json(app, `/api/v1/admin/entries/${entryId}`)).body.draft.revision).toBe(1);

  expect(
    await send(`/api/v1/admin/entries/${entryId}/publish`, { expectedRevision: 1 }),
  ).toMatchObject({
    body: {
      error: {
        code: "VALIDATION_FAILED",
        details: { issues: [{ code: "missing_required_field", path: "/fields/summary" }] },
      },
    },
    response: { status: 422 },
  });
  expect(await store.loadPublic("/notes/note")).toBeNull();
});

test("renders stable body-limit and rate-limit envelopes", async () => {
  const { app } = await fixture();
  expect(
    await json(app, "/api/v1/admin/models/posts/entries", {
      body: JSON.stringify({ blocks: [], fields: {}, slug: "post", title: "x".repeat(1_000) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }),
  ).toMatchObject({ body: { error: { code: "PAYLOAD_TOO_LARGE" } }, response: { status: 413 } });
  const throttled = await fixture({ allowed: false });
  expect(await json(throttled.app, "/health/live")).toMatchObject({
    body: { error: { code: "RATE_LIMITED" } },
    response: { status: 429 },
  });
});

test("bodyless media lifecycle requests reach the use case without bypassing body limits elsewhere", async () => {
  const { app } = await fixture();
  const emptyBody = () =>
    new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
  for (const [method, path] of [
    ["DELETE", "/api/v1/admin/media/missing"],
    ["POST", "/api/v1/admin/media/missing/retry-deletion"],
  ]) {
    const response = await app.fetch(
      new Request(`https://lace.test${path}`, {
        body: emptyBody(),
        duplex: "half",
        method,
      }),
    );
    expect(response.status).toBe(422);
    expect((await response.json()).error.code).toBe("CONTENT_INVALID_STATE");
  }
});

test("keeps media uploads, previews, and draft-only public reads separate", async () => {
  const { app, storage } = await fixture();
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])], {
      type: "text/plain",
    }),
    "cover\r\nX-Injected: nope.png",
  );
  const created = await app.fetch(
    new Request("https://lace.test/api/v1/admin/media", { body: form, method: "POST" }),
  );
  expect(created.status).toBe(201);
  const metadata = await created.json();
  expect(metadata).toMatchObject({
    mimeType: "image/png",
    url: expect.stringContaining("/media/"),
  });
  expect(metadata).not.toHaveProperty("storageKey");
  const preview = await app.fetch(
    new Request(`https://lace.test/api/v1/admin/media/${metadata.id}/preview`),
  );
  expect(preview.headers.get("content-type")).toBe("image/png");
  expect(preview.headers.get("content-disposition")).not.toMatch(/[\r\n]/u);
  expect(await json(app, `/api/v1/public/media/${metadata.id}`)).toMatchObject({
    body: { error: { code: "NOT_FOUND" } },
    response: { status: 404 },
  });
  const deleted = await app.fetch(
    new Request(`https://lace.test/api/v1/admin/media/${metadata.id}`, { method: "DELETE" }),
  );
  expect(deleted.status).toBe(202);

  const missing = await app.fetch(
    new Request("https://lace.test/api/v1/admin/media", { body: new FormData(), method: "POST" }),
  );
  expect(missing.status).toBe(422);
  const duplicate = new FormData();
  duplicate.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    "one.png",
  );
  duplicate.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    "two.png",
  );
  expect(
    (
      await app.fetch(
        new Request("https://lace.test/api/v1/admin/media", { body: duplicate, method: "POST" }),
      )
    ).status,
  ).toBe(422);
  const mismatch = new FormData();
  mismatch.append("file", new Blob([new TextEncoder().encode("not an image")]), "cover.png");
  expect(
    (
      await app.fetch(
        new Request("https://lace.test/api/v1/admin/media", { body: mismatch, method: "POST" }),
      )
    ).status,
  ).toBe(422);
  const oversized = new FormData();
  oversized.append("file", new Blob([new Uint8Array(10 * 1024 * 1024 + 1)]), "large.png");
  expect(
    (
      await app.fetch(
        new Request("https://lace.test/api/v1/admin/media", { body: oversized, method: "POST" }),
      )
    ).status,
  ).toBe(413);
  expect((await json(app, "/api/v1/admin/media")).body.items).toHaveLength(1);

  const publishable = new FormData();
  publishable.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    "published.png",
  );
  const publishedMedia = await (
    await app.fetch(
      new Request("https://lace.test/api/v1/admin/media", { body: publishable, method: "POST" }),
    )
  ).json();
  expect(publishedMedia).toMatchObject({ status: "active" });
  const entry = await json(app, "/api/v1/admin/models/posts/entries", {
    body: JSON.stringify({
      blocks: [],
      fields: { image: publishedMedia.id },
      slug: "image",
      title: "Image",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  expect(entry.response.status).toBe(201);
  const publication = await json(app, `/api/v1/admin/entries/${entry.body.id}/publish`, {
    body: JSON.stringify({ expectedRevision: 1 }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  expect(publication.response.status).toBe(200);
  const publicMedia = await app.fetch(
    new Request(`https://lace.test/api/v1/public/media/${publishedMedia.id}`),
  );
  expect(publicMedia.status).toBe(200);
  expect(publicMedia.headers.get("content-type")).toBe("image/png");
  await storage.delete(`media/${publishedMedia.id}`);
  expect(await json(app, `/api/v1/public/media/${publishedMedia.id}`)).toMatchObject({
    body: { error: { code: "INTERNAL_ERROR" } },
    response: { status: 500 },
  });
});

test("allows viewers to list media but not mutate it", async () => {
  const { app } = await fixture({ actor: { id: actorId("viewer"), role: "viewer" } });
  expect((await json(app, "/api/v1/admin/media")).response.status).toBe(200);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
    "denied.png",
  );
  expect(
    (
      await app.fetch(
        new Request("https://lace.test/api/v1/admin/media", { body: form, method: "POST" }),
      )
    ).status,
  ).toBe(403);
});

test("accepts an authorized retry only for terminal media deletion failures", async () => {
  const { app, storage, store } = await fixture();
  store.registerMedia({
    createdAt: unixMilliseconds(1),
    createdBy: actorId("admin"),
    filename: "failed.png",
    id: "failed-media",
    mimeType: "image/png",
    size: 1,
    status: "delete_failed",
    storageKey: "media/failed-media",
    updatedAt: unixMilliseconds(2),
  });
  expect(
    await (
      await app.fetch(
        new Request("https://lace.test/api/v1/admin/media/failed-media/retry-deletion", {
          method: "POST",
        }),
      )
    ).json(),
  ).toMatchObject({ status: "deleting" });
  expect(store.mediaDeletionRequests).toEqual(["failed-media"]);
  await expect(
    app.fetch(
      new Request("https://lace.test/api/v1/admin/media/failed-media/retry-deletion", {
        method: "POST",
      }),
    ),
  ).resolves.toMatchObject({ status: 422 });
  expect(await storage.get("media/failed-media")).toBeNull();
});

test("lists entries with filters, totals, and query-bound cursors", async () => {
  const { app, store } = await fixture();
  store.setActorDisplayNames({ admin: "admin@example.test" });
  const post = (body) => ({
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const draft = await json(
    app,
    "/api/v1/admin/models/posts/entries",
    post({ blocks: [], fields: { author: "Ann" }, slug: "zebra", title: "Zebra" }),
  );
  const launched = await json(
    app,
    "/api/v1/admin/models/posts/entries",
    post({ blocks: [], fields: {}, slug: "launch", title: "Launch" }),
  );
  expect(draft.body.updatedBy).toEqual({ displayName: "admin@example.test", id: "admin" });
  await json(
    app,
    `/api/v1/admin/entries/${launched.body.id}/publish`,
    post({ expectedRevision: 1 }),
  );

  const list = await json(app, "/api/v1/admin/models/posts/entries?sort=title");
  expect(list.response.status).toBe(200);
  expect(list.body.totals).toEqual({ all: 2, changed: 0, draft: 1, published: 1 });
  expect(list.body.items).toMatchObject([
    { id: launched.body.id, slug: "launch", status: "published", title: "Launch" },
    {
      id: draft.body.id,
      listValues: { author: "Ann" },
      slug: "zebra",
      status: "draft",
      updatedBy: { displayName: "admin@example.test", id: "admin" },
    },
  ]);
  expect(list.body.items[0].publishedAt).toMatch(/Z$/u);
  expect(list.body.items[1]).not.toHaveProperty("publishedAt");

  const filtered = await json(
    app,
    "/api/v1/admin/models/posts/entries?q=%20ZEB%20&status=draft&unknown=ignored",
  );
  expect(filtered.body.items.map((item) => item.id)).toEqual([draft.body.id]);
  expect(filtered.body.totals).toEqual({ all: 1, changed: 0, draft: 1, published: 0 });

  for (const [query, pointer] of [
    ["status=archived", "/status"],
    ["sort=author", "/sort"],
    [`q=${"x".repeat(201)}`, "/q"],
  ]) {
    expect(await json(app, `/api/v1/admin/models/posts/entries?${query}`)).toMatchObject({
      body: { error: { code: "VALIDATION_FAILED", details: { issues: [{ path: pointer }] } } },
      response: { status: 422 },
    });
  }
  const first = await json(app, "/api/v1/admin/models/posts/entries?sort=title&limit=1");
  expect(first.body.nextCursor).toBeDefined();
  const cursor = encodeURIComponent(first.body.nextCursor);
  expect(
    (await json(app, `/api/v1/admin/models/posts/entries?sort=title&limit=1&after=${cursor}`)).body
      .items,
  ).toMatchObject([{ id: draft.body.id }]);
  expect(
    await json(app, `/api/v1/admin/models/posts/entries?sort=-title&limit=1&after=${cursor}`),
  ).toMatchObject({
    body: { error: { code: "CONTENT_INVALID_STATE" } },
    response: { status: 422 },
  });
  expect((await json(app, "/api/v1/admin/models/missing/entries")).response.status).toBe(404);
});

test("admin entry responses name the last editor while public DTOs stay unchanged", async () => {
  const viewer = { id: actorId("viewer"), role: "viewer" };
  const { app, store } = await fixture();
  store.setActorDisplayNames({ admin: "admin@example.test" });
  const post = (body) => ({
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const created = await json(
    app,
    "/api/v1/admin/models/posts/entries",
    post({ blocks: [], fields: {}, slug: "named", title: "Named" }),
  );
  expect(created.body.updatedBy).toEqual({ displayName: "admin@example.test", id: "admin" });
  const saved = await json(app, `/api/v1/admin/entries/${created.body.id}/draft`, {
    body: JSON.stringify({
      blocks: [],
      expectedRevision: 1,
      fields: {},
      slug: "named",
      title: "N",
    }),
    headers: { "content-type": "application/json" },
    method: "PUT",
  });
  expect(saved.body.updatedBy.displayName).toBe("admin@example.test");
  const published = await json(
    app,
    `/api/v1/admin/entries/${created.body.id}/publish`,
    post({ expectedRevision: 2 }),
  );
  expect(published.body.entry.updatedBy).toEqual({
    displayName: "admin@example.test",
    id: "admin",
  });

  const viewerApp = await fixture({ actor: viewer });
  viewerApp.store.setActorDisplayNames({ editor: "editor@example.test" });
  for (const [id, updatedBy, expected] of [
    ["by-editor", editor, "editor@example.test"],
    ["by-sync", { id: actorId("system:content-sync"), role: "admin" }, "System"],
    ["by-gone", { id: actorId("gone"), role: "editor" }, "Unknown user"],
  ]) {
    await viewerApp.store.create({
      entry: createContentEntry({
        draft: {
          blocks: [],
          createdAt: unixMilliseconds(1),
          entryId: contentEntryId(id),
          fields: {},
          id: contentSnapshotId(`${id}-draft`),
          revision: 1,
          slug: id,
          state: "draft",
          title: id,
          updatedAt: unixMilliseconds(1),
          updatedBy,
        },
        id: contentEntryId(id),
        model: { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" },
      }),
      mediaReferences: [],
    });
    const loaded = await json(viewerApp.app, `/api/v1/admin/entries/${id}`);
    expect(loaded.body.updatedBy).toEqual({ displayName: expected, id: updatedBy.id });
  }

  const page = await json(app, "/api/v1/public/collections/posts/named");
  const exported = await json(app, "/api/v1/public/build-export");
  expect(page).toMatchObject({ body: { path: "/blog/named" }, response: { status: 200 } });
  expect(exported).toMatchObject({ body: { entries: [{ path: "/blog/named" }] } });
  for (const body of [page.body, exported.body]) {
    expect(JSON.stringify(body)).not.toContain("displayName");
    expect(JSON.stringify(body)).not.toContain("admin@example.test");
  }
});

test("lists media with filters and bound cursors and exposes details with usage", async () => {
  const { app, store } = await fixture();
  store.setActorDisplayNames({ admin: "Ada" });
  const upload = async (filename) => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]),
      filename,
    );
    const created = await app.fetch(
      new Request("https://lace.test/api/v1/admin/media", { body: form, method: "POST" }),
    );
    expect(created.status).toBe(201);
    return created.json();
  };
  const cover = await upload("Cover.png");
  const banner = await upload("banner.png");
  expect(cover).toMatchObject({
    createdBy: { displayName: "Ada", id: "admin" },
    height: 1,
    usageCount: 0,
    width: 1,
  });

  const ids = async (query) =>
    (await json(app, `/api/v1/admin/media?${query}`)).body.items.map((item) => item.id);
  expect(await ids("q=%20COVER%20")).toEqual([cover.id]);
  expect(await ids("type=image/png&sort=filename")).toEqual([banner.id, cover.id]);
  expect(await ids("type=image/jpeg")).toEqual([]);
  expect(await ids("q=")).toHaveLength(2);
  for (const [query, pointer] of [
    ["type=image/svg%2Bxml", "/type"],
    ["sort=width", "/sort"],
    [`q=${"x".repeat(201)}`, "/q"],
    ["limit=0", "/limit"],
  ]) {
    expect(await json(app, `/api/v1/admin/media?${query}`)).toMatchObject({
      body: { error: { code: "VALIDATION_FAILED", details: { issues: [{ path: pointer }] } } },
      response: { status: 422 },
    });
  }
  const first = await json(app, "/api/v1/admin/media?sort=filename&limit=1");
  const cursor = encodeURIComponent(first.body.nextCursor);
  expect(await ids(`sort=filename&limit=1&after=${cursor}`)).toEqual([cover.id]);
  expect(
    await json(app, `/api/v1/admin/media?sort=-createdAt&limit=1&after=${cursor}`),
  ).toMatchObject({
    body: { error: { code: "CONTENT_INVALID_STATE" } },
    response: { status: 422 },
  });

  const entry = await json(app, "/api/v1/admin/models/posts/entries", {
    body: JSON.stringify({
      blocks: [],
      fields: { image: cover.id },
      slug: "cover",
      title: "Cover",
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  expect(entry.response.status).toBe(201);
  await json(app, `/api/v1/admin/entries/${entry.body.id}/publish`, {
    body: JSON.stringify({ expectedRevision: 1 }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const detail = await json(app, `/api/v1/admin/media/${cover.id}`);
  expect(detail.response.status).toBe(200);
  expect(detail.body).toMatchObject({
    createdBy: { displayName: "Ada", id: "admin" },
    id: cover.id,
    usage: [
      {
        entryId: entry.body.id,
        locations: [{ field: "image", source: "field", states: ["draft", "published"] }],
        modelKey: "posts",
        slug: "cover",
        status: "published",
        title: "Cover",
      },
    ],
    usageCount: 1,
  });
  expect(JSON.stringify(detail.body)).not.toContain("storageKey");
  expect((await ids("q=cover")).length).toBe(1);
  expect((await json(app, "/api/v1/admin/media?q=cover")).body.items[0].usageCount).toBe(1);
  expect(await json(app, "/api/v1/admin/media/missing")).toMatchObject({
    body: { error: { code: "NOT_FOUND" } },
    response: { status: 404 },
  });

  const refused = await app.fetch(
    new Request(`https://lace.test/api/v1/admin/media/${cover.id}`, { method: "DELETE" }),
  );
  expect(refused.status).toBe(409);
  expect(await refused.json()).toEqual({
    error: { code: "MEDIA_IN_USE", message: "The media is still used by content." },
  });
  expect(store.mediaDeletionRequests).toEqual([]);
  const accepted = await app.fetch(
    new Request(`https://lace.test/api/v1/admin/media/${banner.id}`, { method: "DELETE" }),
  );
  expect(accepted.status).toBe(202);
  expect(await accepted.json()).toMatchObject({ status: "deleting", usageCount: 0 });
  expect((await json(app, `/api/v1/admin/media/${banner.id}`)).body).toMatchObject({
    status: "deleting",
    usage: [],
  });
});

test("anonymous setup state exposes only durable completion with no cache or mutation", async () => {
  let complete = false;
  const { app, logs } = await fixture({
    actor: null,
    security: { isSetupComplete: async () => complete },
  });
  for (const value of [false, true]) {
    complete = value;
    const response = await app.request("/api/v1/setup/state");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ setupComplete: value });
  }
  expect((await app.request("/api/v1/admin/users")).status).toBe(403);
  expect((await app.request("/api/v1/admin/content-models")).status).toBe(403);
  expect(logs.every((entry) => entry.actorId === undefined)).toBe(true);
});

test("setup persistence failure never reports an incomplete installation", async () => {
  const { app } = await fixture({
    security: {
      isSetupComplete: async () => {
        throw new Error("SQL private database detail");
      },
    },
  });
  const response = await app.request("/api/v1/setup/state");
  expect(response.status).toBe(500);
  const body = await response.text();
  expect(body).not.toContain("SQL");
  expect(body).not.toContain("setupComplete");
});

test.each([admin, editor, { id: actorId("viewer"), role: "viewer" }])(
  "current build site is a safe read for $role",
  async (actor) => {
    const site = { id: "public-site", label: "Public site" };
    const { app } = await fixture({ actor, buildSite: site });
    const response = await app.fetch(new Request("https://lace.test/api/v1/admin/build-site"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ site });
    expect(
      (
        await app.fetch(
          new Request("https://lace.test/api/v1/admin/build-site", { method: "POST" }),
        )
      ).status,
    ).toBe(404);
  },
);
test("current build site is unknown by default and anonymous reads fail", async () => {
  const { app } = await fixture();
  expect(
    await (await app.fetch(new Request("https://lace.test/api/v1/admin/build-site"))).json(),
  ).toEqual({ site: null });
  const anonymous = (await fixture({ actor: null })).app;
  expect(
    (await anonymous.fetch(new Request("https://lace.test/api/v1/admin/build-site"))).status,
  ).toBe(403);
});

test.each([[[1000, 1000]], [[2000, 1000]], [[0, 1000]]])(
  "rejects ordered-draft positions %j atomically with actionable diagnostics",
  async (positions) => {
    const { app, content, store } = await fixture({ maxBodyBytes: 4096 });
    const created = await content.create({
      actor: admin,
      modelKey: "posts",
      title: "Order",
      slug: "order",
      fields: {},
      blocks: [],
    });
    await content.publish({
      actor: admin,
      entryId: created.id,
      expectedRevision: 1,
      idempotencyKey: "order-test",
    });
    const before = await store.load({ entryId: created.id });
    const exported = await store.exportBuildContent();
    const response = await app.fetch(
      new Request(`https://lace.test/api/v1/admin/entries/${created.id}/draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: 1,
          title: "Order",
          fields: {},
          slug: "order",
          blocks: positions.map((position, index) => ({
            data: { heading: "secret-content" },
            key: `01ARZ3NDEKTSV4RRFFQ69G5FA${index + 1}`,
            position,
            schemaVersion: 1,
            type: "hero",
          })),
        }),
      }),
    );
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.error.code).toBe("CONTENT_INVALID_STATE");
    expect(body.error.message).toContain(`Block at index ${positions[0] === 0 ? 0 : 1}`);
    expect(body.error.message).toContain("Resubmit positions");
    expect(body.error.message).not.toContain("secret-content");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(await store.load({ entryId: created.id })).toEqual(before);
    expect(await store.exportBuildContent()).toEqual(exported);
  },
);

test("the export ETag follows its payload when publication races the version lookup", async () => {
  const { app, store, content } = await fixture();
  const entry = await content.create({
    actor: admin,
    blocks: [],
    fields: {},
    modelKey: "posts",
    slug: "race",
    title: "Race",
  });
  const original = store.exportBuildContent.bind(store);
  store.exportBuildContent = async () => {
    await content.publish({ actor: admin, entryId: entry.id, expectedRevision: 1 });
    return original();
  };
  const result = await json(app, "/api/v1/public/build-export");
  expect(result.body.version).toBe(1);
  expect(result.response.headers.get("etag")).toBe('"1"');
});
