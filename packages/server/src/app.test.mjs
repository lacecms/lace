import { expect, test } from "vitest";
import { createLaceApp, sensitiveRequestLimit } from "../dist/index.js";
import { ContentUseCases, MediaUseCases, SiteBuildUseCases } from "@lacecms/application";
import { defineCollection, defineConfig, defineGlobal, definePage } from "@lacecms/config";
import { defineBlock, field } from "@lacecms/content";
import {
  actorId,
  contentEntryId,
  contentModelKey,
  contentSnapshotId,
  createContentEntry,
  mediaId,
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
  resolveActor,
  auth,
  ready = true,
  allowed = true,
  maxBodyBytes = 256,
  models,
  blocks = [],
  builds,
  security,
  buildSite,
  email,
  rateLimiter,
  sessionId,
  sensitiveLimiter,
  defer,
} = {}) {
  const config = await defineConfig({
    blocks: [
      defineBlock({
        fields: { heading: field.text({ required: true }) },
        type: "hero",
        version: 1,
      }),
      defineBlock({ fields: { body: field.richText() }, type: "richText", version: 1 }),
      ...blocks,
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
    actors: {
      resolve: resolveActor ?? (async () => actor),
      ...(sessionId === undefined ? {} : { sessionId: async () => sessionId }),
    },
    ...(sensitiveLimiter === undefined ? {} : { sensitiveLimiter }),
    ...(defer === undefined ? {} : { defer }),
    adminAssets: { fetch: async () => new Response("admin-shell") },
    config,
    content,
    buildSite,
    ...(builds === undefined ? {} : { builds }),
    ...(security === undefined ? {} : { security }),
    ...(email === undefined ? {} : { email }),
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
      loadPublicGlobal: store.loadPublicGlobal.bind(store),
      loadPublicMedia: store.loadPublicMedia.bind(store),
      publishedContentVersion: store.publishedContentVersion.bind(store),
    },
    rateLimiter: rateLimiter ?? { check: async () => allowed },
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
    body: {
      configuredModels: 2,
      email: { provider: "none" },
      engineVersion: "0.0.0-test",
      ready: false,
    },
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

const profiles = {
  admin: { disabled: false, email: "admin@lace.test", name: "Ada Admin" },
  disabled: { disabled: true, email: "gone@lace.test" },
  editor: { disabled: false, email: "editor@lace.test" },
  viewer: { disabled: false, email: "viewer@lace.test", name: "Vi" },
};
const profileSecurity = { readUserProfile: async (id) => profiles[id] ?? null };

test("session summary returns identity and the exact permissions for each role", async () => {
  const expected = {
    admin: [
      "content:read",
      "content:write",
      "content:publish",
      "media:write",
      "users:manage",
      "settings:manage",
    ],
    editor: ["content:read", "content:write", "media:write"],
    viewer: ["content:read"],
  };
  for (const role of ["admin", "editor", "viewer"]) {
    const { app } = await fixture({
      actor: { id: actorId(role), role },
      security: profileSecurity,
    });
    const result = await json(app, "/api/v1/admin/session");
    expect(result.response.status).toBe(200);
    expect(result.response.headers.get("cache-control")).toBe("no-store");
    expect(result.body.permissions).toEqual(expected[role]);
    expect(result.body.user).toEqual({
      ...(profiles[role].name === undefined ? {} : { displayName: profiles[role].name }),
      email: profiles[role].email,
      id: role,
      role,
    });
    expect(JSON.stringify(result.body)).not.toMatch(/token|password|session/iu);
  }
  for (const actor of [null, { id: actorId("disabled"), role: "admin" }]) {
    const { app } = await fixture({ actor, security: profileSecurity });
    const result = await json(app, "/api/v1/admin/session");
    expect(result.response.status).toBe(403);
    expect(result.body).not.toHaveProperty("user");
  }
});

test("settings status reports the composed email provider without settings", async () => {
  const { app } = await fixture({
    email: { from: "Lace <cms@lace.test>", provider: "smtp", send: async () => ({}) },
  });
  const result = await json(app, "/api/v1/admin/settings/status");
  expect(result.body.email).toEqual({ from: "Lace <cms@lace.test>", provider: "smtp" });
});

test("email test sends only to the acting administrator and reports closed outcomes", async () => {
  const sent = [];
  let outcome = { status: "sent" };
  const email = {
    from: "cms@lace.test",
    provider: "resend",
    send: async (message) => {
      sent.push(message);
      return outcome;
    },
  };
  const post = (body = {}) => ({
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const { app } = await fixture({
    actor: { id: actorId("admin"), role: "admin" },
    email,
    security: profileSecurity,
  });
  expect(await json(app, "/api/v1/admin/settings/email-test", post())).toMatchObject({
    body: { status: "sent" },
    response: { status: 200 },
  });
  expect(sent).toHaveLength(1);
  expect(sent[0].to).toBe("admin@lace.test");
  expect(sent[0].text).toContain("https://lace.test/");
  outcome = { reason: "rate_limited", status: "failed" };
  expect(await json(app, "/api/v1/admin/settings/email-test", post())).toMatchObject({
    body: { reason: "rate_limited", status: "failed" },
    response: { status: 200 },
  });
  const named = await json(
    app,
    "/api/v1/admin/settings/email-test",
    post({ to: "attacker@example.com" }),
  );
  expect(named.response.status).toBe(422);
  expect(named.body.error.code).toBe("VALIDATION_FAILED");
  expect(sent).toHaveLength(2);
  for (const role of ["editor", "viewer"]) {
    const denied = await fixture({
      actor: { id: actorId(role), role },
      email,
      security: profileSecurity,
    });
    expect(
      (await json(denied.app, "/api/v1/admin/settings/email-test", post())).response.status,
    ).toBe(403);
  }
  expect(sent).toHaveLength(2);
});

test("email test passes the acting administrator to the rate limiter before sending", async () => {
  const checks = [];
  const sent = [];
  const { app } = await fixture({
    email: { from: "cms@lace.test", provider: "smtp", send: async (m) => sent.push(m) },
    rateLimiter: {
      check: async (input) => {
        if (new URL(input.request.url).pathname === "/api/v1/admin/settings/email-test")
          checks.push(input.actor?.id);
        return { allowed: false, retryAfterSeconds: 120 };
      },
    },
    security: profileSecurity,
  });
  const result = await json(app, "/api/v1/admin/settings/email-test", {
    body: "{}",
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  expect(result.response.status).toBe(429);
  expect(result.response.headers.get("retry-after")).toBe("120");
  expect(result.body.error.code).toBe("RATE_LIMITED");
  expect(checks).toEqual(["admin"]);
  expect(sent).toEqual([]);
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
    ["/api/v1/admin/invitations", post({ email: "other@example.test", role: "viewer" })],
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
  expect(fresh.body.formatVersion).toBe(1);
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
  for (const path of [
    "/api/v1/public/pages/{modelKey}",
    "/api/v1/public/collections/{modelKey}",
    "/api/v1/public/collections/{modelKey}/{slug}",
    "/api/v1/public/content/by-path",
  ])
    expect(openApi.body.paths[path].get.responses).toHaveProperty("200");
});

test("public responses return published entries with one resolved media dictionary", async () => {
  const { app, store } = await fixture();
  const media = (id, extra = {}) => ({
    createdAt: unixMilliseconds(1),
    createdBy: admin.id,
    filename: "image.png",
    id: mediaId(id),
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: `private/${id}`,
    updatedAt: unixMilliseconds(1),
    ...extra,
  });
  store.registerMedia(media("shared", { alt: "Office", focalPoint: { x: 0.25, y: 0.4 } }));
  store.registerMedia(media("only-a"));
  store.registerMedia(media("draft-only"));
  for (const [id, ids] of [
    ["post-a", ["shared", "only-a"]],
    ["post-b", ["shared"]],
  ]) {
    await store.create({
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
          updatedBy: admin,
        },
        id: contentEntryId(id),
        model: { key: contentModelKey("posts"), kind: "collection", route: "/blog/:slug" },
      }),
      mediaReferences: ids.map((mediaValue, index) => ({
        fieldPath: `image${index}`,
        mediaId: mediaId(mediaValue),
        sourceKey: "$fields",
      })),
    });
    await store.publish({
      entryId: contentEntryId(id),
      expectedRevision: 1,
      publishedAt: unixMilliseconds(2),
      publishedBy: admin,
      publishedSnapshotId: contentSnapshotId(`${id}-published`),
    });
  }
  await store.saveCompleteDraft({
    entryId: contentEntryId("post-a"),
    mutation: {
      blocks: [],
      expectedRevision: 1,
      fields: {},
      mediaReferences: [
        { fieldPath: "image", mediaId: mediaId("draft-only"), sourceKey: "$fields" },
      ],
      title: "DRAFT ONLY",
      updatedAt: unixMilliseconds(3),
      updatedBy: admin,
    },
  });
  const list = await json(app, "/api/v1/public/collections/posts?limit=10");
  expect(Object.keys(list.body.media)).toEqual(["only-a", "shared"]);
  expect(list.body.media.shared).toEqual({
    alt: "Office",
    caption: null,
    focalPoint: { x: 0.25, y: 0.4 },
    height: null,
    id: "shared",
    mimeType: "image/png",
    url: "https://lace.test/api/v1/public/media/shared",
    width: null,
  });
  const single = await json(app, "/api/v1/public/content/by-path?path=/blog/post-b");
  expect(Object.keys(single.body)).toEqual(["entry", "media"]);
  expect(single.body.entry).toEqual({
    blocks: [],
    fields: {},
    id: "post-b",
    modelKey: "posts",
    path: "/blog/post-b",
    publishedAt: new Date(2).toISOString(),
    slug: "post-b",
    title: "post-b",
  });
  expect(Object.keys(single.body.media)).toEqual(["shared"]);
  const exported = await json(app, "/api/v1/public/build-export");
  expect(Object.keys(exported.body.media)).toEqual(["only-a", "shared"]);
  for (const body of [list.body, single.body, exported.body]) {
    expect(JSON.stringify(body)).not.toContain("DRAFT ONLY");
    expect(JSON.stringify(body)).not.toContain("draft-only");
    expect(JSON.stringify(body)).not.toContain("private/");
  }
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

test("admin entry responses name the last editor while public DTOs carry no editor names", async () => {
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
  expect(page).toMatchObject({
    body: { entry: { path: "/blog/named" } },
    response: { status: 200 },
  });
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

const TOKEN = "Q".repeat(43);

function accountSecurity(overrides = {}) {
  const calls = [];
  const record =
    (name, result) =>
    async (...args) => {
      calls.push([name, ...args]);
      return typeof result === "function" ? result(...args) : result;
    };
  return {
    calls,
    security: {
      readUserProfile: async (id) => ({ disabled: false, email: `${id}@lace.test`, name: id }),
      acceptInvitation: record("acceptInvitation", { status: "invalid" }),
      changePassword: record("changePassword", { revoked: 1, status: "changed" }),
      confirmPasswordReset: record("confirmPasswordReset", { status: "invalid" }),
      createInvitation: record("createInvitation", {
        invitation: {
          createdAt: unixMilliseconds(1_000),
          email: "new@lace.test",
          expiresAt: unixMilliseconds(1_000 + 72 * 3_600_000),
          id: "inv-1",
          invitedBy: "admin",
          invitedByName: "Admin",
          role: "editor",
        },
        status: "created",
        token: TOKEN,
      }),
      deleteOtherSessions: record("deleteOtherSessions", 2),
      deleteSession: record("deleteSession", false),
      deleteUserSessions: record("deleteUserSessions", 3),
      inspectInvitation: record("inspectInvitation", null),
      issuePasswordReset: record("issuePasswordReset", {
        email: "editor@lace.test",
        status: "issued",
        token: TOKEN,
        userId: "editor",
      }),
      listInvitations: record("listInvitations", []),
      listSessions: record("listSessions", [
        { createdAt: unixMilliseconds(1), id: "s-current", lastActiveAt: unixMilliseconds(2) },
        {
          createdAt: unixMilliseconds(1),
          id: "s-other",
          lastActiveAt: unixMilliseconds(3),
          userAgent: "Mozilla/5.0 (Windows NT 10.0) Chrome/129.0 Safari/537.36",
        },
      ]),
      reissueInvitation: record("reissueInvitation", { status: "not_found" }),
      revokeInvitation: record("revokeInvitation", "revoked"),
      updateDisplayName: record("updateDisplayName", true),
      ...overrides,
    },
  };
}

function send(app, path, method = "POST", body) {
  return app.fetch(
    new Request(`https://lace.test${path}`, {
      method,
      ...(body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { "content-type": "application/json" } }),
    }),
  );
}

test("globals are read by model key and refused as routed or deletable entries", async () => {
  const models = [
    definePage({ key: "home", path: "/", version: 1 }),
    defineCollection({ key: "posts", route: "/blog/:slug", version: 1 }),
    defineGlobal({
      fields: { logo: field.media(), siteName: field.text({ required: true }) },
      key: "settings",
      label: "Site settings",
      version: 1,
    }),
  ];
  const { app, store } = await fixture({ maxBodyBytes: 4096, models });
  store.registerMedia({
    createdAt: unixMilliseconds(1),
    createdBy: admin.id,
    filename: "logo.png",
    id: mediaId("logo"),
    mimeType: "image/png",
    size: 1,
    status: "active",
    storageKey: "private/logo",
    updatedAt: unixMilliseconds(1),
  });
  const call = (path, { body, method = "POST" } = {}) =>
    json(app, path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "content-type": "application/json" },
    });

  const listed = await json(app, "/api/v1/admin/content-models");
  const settingsModel = listed.body.items.find((model) => model.key === "settings");
  expect(settingsModel).toMatchObject({ key: "settings", kind: "global", label: "Site settings" });
  expect(settingsModel).not.toHaveProperty("path");
  expect(settingsModel).not.toHaveProperty("route");

  const created = await call("/api/v1/admin/models/settings/entries", {
    body: { blocks: [], fields: { logo: "logo", siteName: "Lace" }, title: "Ignored" },
  });
  expect(created.response.status).toBe(201);
  expect(created.body).toMatchObject({
    draft: { title: "Site settings" },
    model: { key: "settings", kind: "global" },
  });
  expect(
    await call("/api/v1/admin/models/settings/entries", {
      body: { blocks: [], fields: { siteName: "Again" }, title: "Again" },
    }),
  ).toMatchObject({
    body: { error: { code: "CONTENT_MODEL_CARDINALITY_CONFLICT" } },
    response: { status: 409 },
  });
  const entryPath = `/api/v1/admin/entries/${created.body.id}`;
  expect(await json(app, "/api/v1/public/globals/settings")).toMatchObject({
    body: { error: { code: "NOT_FOUND" } },
    response: { status: 404 },
  });

  const before = await json(app, "/api/v1/public/build-export");
  const published = await call(`${entryPath}/publish`, { body: { expectedRevision: 1 } });
  expect(published.response.status).toBe(200);
  const read = await json(app, "/api/v1/public/globals/settings");
  expect(read.response.status).toBe(200);
  expect(Object.keys(read.body)).toEqual(["global", "media"]);
  expect(read.body.global).toEqual({
    blocks: [],
    fields: { logo: "logo", siteName: "Lace" },
    id: created.body.id,
    modelKey: "settings",
    publishedAt: new Date(1).toISOString(),
  });
  expect(read.body.media.logo).toMatchObject({
    url: "https://lace.test/api/v1/public/media/logo",
  });
  for (const path of ["/api/v1/public/globals/home", "/api/v1/public/globals/missing"]) {
    expect((await json(app, path)).response.status, path).toBe(404);
  }
  expect((await json(app, "/api/v1/public/globals/Not%20Valid")).response.status).not.toBe(200);
  expect((await json(app, "/api/v1/public/pages/settings")).response.status).toBe(404);

  const exported = await json(app, "/api/v1/public/build-export");
  expect(exported.response.headers.get("etag")).not.toBe(before.response.headers.get("etag"));
  expect(exported.body.entries).toEqual([]);
  expect(exported.body.globals.map((item) => item.modelKey)).toEqual(["settings"]);
  expect(Object.keys(exported.body.media)).toEqual(["logo"]);

  for (const [path, init] of [
    [entryPath, { headers: { "if-match": '"1"' }, method: "DELETE" }],
    [
      `${entryPath}/duplicate`,
      { body: "{}", headers: { "content-type": "application/json" }, method: "POST" },
    ],
  ]) {
    expect(await json(app, path, init), path).toMatchObject({
      body: { error: { code: "CONTENT_PAGE_SINGLETON" } },
      response: { status: 409 },
    });
  }

  const unpublished = await call(`${entryPath}/unpublish`, {
    body: { expectedPublishedSnapshotId: published.body.entry.published.id },
  });
  expect(unpublished.response.status).toBe(200);
  expect((await json(app, "/api/v1/public/globals/settings")).response.status).toBe(404);
  const afterUnpublish = await json(app, "/api/v1/public/build-export");
  expect(afterUnpublish.response.headers.get("etag")).not.toBe(
    exported.response.headers.get("etag"),
  );
  expect(afterUnpublish.body.globals).toEqual([]);

  const openApi = await json(app, "/api/v1/openapi.json");
  expect(openApi.body.paths["/api/v1/public/globals/{modelKey}"].get.responses).toHaveProperty(
    "200",
  );
});

test("entry lifecycle routes unpublish, revert, and duplicate with stable contracts", async () => {
  let current = admin;
  const viewer = { id: actorId("viewer"), role: "viewer" };
  const { app, store } = await fixture({ maxBodyBytes: 4096, resolveActor: async () => current });
  const call = (path, { body, headers = {}, method = "POST" } = {}) =>
    json(app, path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "content-type": "application/json", ...headers },
    });
  const post = await call("/api/v1/admin/models/posts/entries", {
    body: { blocks: [], fields: { author: "Ada" }, slug: "launch", title: "Launch" },
  });
  const page = await call("/api/v1/admin/models/home/entries", {
    body: { blocks: [], fields: {}, title: "Home" },
  });
  const entryPath = `/api/v1/admin/entries/${post.body.id}`;
  const published = await call(`${entryPath}/publish`, { body: { expectedRevision: 1 } });
  const publishedId = published.body.entry.published.id;
  await call(`${entryPath}/draft`, {
    body: { blocks: [], expectedRevision: 1, fields: {}, slug: "changed", title: "Changed" },
    method: "PUT",
  });

  for (const actor of [viewer, editor]) {
    current = actor;
    expect(
      await call(`${entryPath}/unpublish`, { body: { expectedPublishedSnapshotId: publishedId } }),
    ).toMatchObject({
      body: { error: { code: "AUTHORIZATION_DENIED" } },
      response: { status: 403 },
    });
  }
  current = viewer;
  for (const action of ["revert", "duplicate"]) {
    expect(await call(`${entryPath}/${action}`, { body: { expectedRevision: 2 } })).toMatchObject({
      response: { status: 403 },
    });
  }

  current = editor;
  expect(
    await call(`${entryPath}/revert`, {
      body: { expectedRevision: 2 },
      headers: { "if-match": '"3"' },
    }),
  ).toMatchObject({ body: { error: { code: "VALIDATION_FAILED" } }, response: { status: 422 } });
  expect(await call(`${entryPath}/revert`, { headers: { "if-match": 'W/"2"' } })).toMatchObject({
    response: { status: 422 },
  });
  expect(await call(`${entryPath}/revert`, { body: {} })).toMatchObject({
    response: { status: 422 },
  });
  const reverted = await call(`${entryPath}/revert`, { headers: { "if-match": '"2"' } });
  expect(reverted).toMatchObject({
    body: {
      draft: { revision: 3, slug: "launch", title: "Launch" },
      published: { id: publishedId, revision: 3 },
      updatedBy: { id: "editor" },
    },
    response: { status: 200 },
  });

  const copy = await call(`${entryPath}/duplicate`);
  expect(copy).toMatchObject({
    body: { draft: { fields: { author: "Ada" }, revision: 1, title: "Launch (copy)" } },
    response: { status: 201 },
  });
  expect(copy.body.draft).not.toHaveProperty("slug");
  expect(copy.body).not.toHaveProperty("published");
  expect(await call(`${entryPath}/duplicate`, { body: { expectedRevision: 1 } })).toMatchObject({
    body: { error: { code: "CONTENT_REVISION_CONFLICT" } },
    response: { status: 409 },
  });
  expect(await call(`${entryPath}/duplicate`, { body: { title: "Other" } })).toMatchObject({
    response: { status: 422 },
  });

  current = admin;
  const pagePath = `/api/v1/admin/entries/${page.body.id}`;
  expect(await call(`${pagePath}/duplicate`)).toMatchObject({
    body: { error: { code: "CONTENT_PAGE_SINGLETON" } },
    response: { status: 409 },
  });
  expect(await call(pagePath, { body: { expectedRevision: 1 }, method: "DELETE" })).toMatchObject({
    body: { error: { code: "CONTENT_PAGE_SINGLETON" } },
    response: { status: 409 },
  });
  expect(
    await call(`${pagePath}/unpublish`, { body: { expectedPublishedSnapshotId: "none" } }),
  ).toMatchObject({
    body: { error: { code: "CONTENT_NOT_PUBLISHED" } },
    response: { status: 409 },
  });
  expect(await call(`${entryPath}/unpublish`, { body: {} })).toMatchObject({
    body: { error: { code: "VALIDATION_FAILED" } },
    response: { status: 422 },
  });
  const publicPath = "/api/v1/public/collections/posts/launch";
  expect((await json(app, publicPath)).response.status).toBe(200);
  const unpublishRequest = {
    body: { expectedPublishedSnapshotId: publishedId },
    headers: { "idempotency-key": "unpublish-key" },
  };
  const unpublished = await call(`${entryPath}/unpublish`, unpublishRequest);
  expect(unpublished).toMatchObject({
    body: {
      build: { status: "queued", targetVersion: 2 },
      entry: { draft: { revision: 3 } },
      unpublication: "unpublished",
    },
    response: { status: 200 },
  });
  expect(unpublished.body.entry).not.toHaveProperty("published");
  expect(await store.loadPublic("/blog/launch")).toBeNull();
  expect((await json(app, publicPath)).response.status).toBe(404);
  expect(await call(`${entryPath}/unpublish`, unpublishRequest)).toMatchObject({
    body: { build: { status: "not-dispatched" }, unpublication: "replayed" },
    response: { status: 200 },
  });
  expect(
    await call(`${entryPath}/unpublish`, { body: { expectedPublishedSnapshotId: publishedId } }),
  ).toMatchObject({
    body: { error: { code: "CONTENT_NOT_PUBLISHED" } },
    response: { status: 409 },
  });
});

test("the password-based user creation route no longer exists", async () => {
  const { security, calls } = accountSecurity();
  const { app } = await fixture({ security });
  const response = await send(app, "/api/v1/admin/users", "POST", {
    email: "new@lace.test",
    password: "long-password-123",
    role: "viewer",
  });
  expect(response.status).toBe(404);
  expect(calls).toEqual([]);
});

test("invitations return the accept link only when email was not sent", async () => {
  const { security, calls } = accountSecurity();
  const unsent = await fixture({ security });
  const created = await send(unsent.app, "/api/v1/admin/invitations", "POST", {
    email: "New@Lace.test",
    role: "editor",
  });
  expect(created.status).toBe(201);
  expect(created.headers.get("cache-control")).toBe("no-store");
  expect(await created.json()).toEqual({
    delivery: { reason: "not_configured", status: "failed" },
    invitation: {
      createdAt: "1970-01-01T00:00:01.000Z",
      email: "new@lace.test",
      expiresAt: "1970-01-04T00:00:01.000Z",
      id: "inv-1",
      invitedBy: "Admin",
      role: "editor",
      state: "expired",
    },
    link: `https://lace.test/admin/accept-invite#token=${TOKEN}`,
  });
  expect(calls[0]).toMatchObject([
    "createInvitation",
    { email: "new@lace.test", invitedBy: "admin" },
  ]);
  const sent = [];
  const delivered = await fixture({
    email: {
      from: "cms@lace.test",
      provider: "log",
      send: async (m) => (sent.push(m), { status: "sent" }),
    },
    security,
  });
  const body = await (
    await send(delivered.app, "/api/v1/admin/invitations", "POST", {
      email: "n@lace.test",
      role: "viewer",
    })
  ).json();
  expect(body).not.toHaveProperty("link");
  expect(sent[0].text).toContain(`#token=${TOKEN}`);
  for (const entry of [...unsent.logs, ...delivered.logs])
    expect(JSON.stringify(entry)).not.toContain(TOKEN);
  const reset = await send(unsent.app, "/api/v1/admin/users/editor/password-reset", "POST", {});
  expect(await reset.json()).toEqual({
    delivery: { reason: "not_configured", status: "failed" },
    link: `https://lace.test/admin/reset-password#token=${TOKEN}`,
  });
  expect(
    await (await send(unsent.app, "/api/v1/admin/users/editor/sessions/revoke", "POST")).json(),
  ).toEqual({ revoked: 3 });
  expect((await send(unsent.app, "/api/v1/admin/invitations/inv-1", "DELETE")).status).toBe(204);
  expect(
    (await send(unsent.app, "/api/v1/admin/invitations/inv-1/resend", "POST", {})).status,
  ).toBe(404);
});

test("reset requests answer 202 immediately without awaiting a slow sender", async () => {
  const deferred = [];
  const { security } = accountSecurity();
  let sendStarted = false;
  const { app } = await fixture({
    actor: null,
    defer: (task) => deferred.push(task),
    email: {
      from: "cms@lace.test",
      provider: "smtp",
      send: () => {
        sendStarted = true;
        return new Promise(() => undefined);
      },
    },
    security,
  });
  const response = await send(app, "/api/v1/password-reset/request", "POST", {
    email: "editor@lace.test",
  });
  expect(response.status).toBe(202);
  expect(await response.text()).toBe("");
  expect(sendStarted).toBe(true);
  expect(deferred).toHaveLength(1);
  const unknown = await fixture({
    actor: null,
    defer: (task) => deferred.push(task),
    security: accountSecurity({ issuePasswordReset: async () => ({ status: "not_found" }) })
      .security,
  });
  const other = await send(unknown.app, "/api/v1/password-reset/request", "POST", {
    email: "nobody@lace.test",
  });
  expect(other.status).toBe(202);
  expect([...other.headers.keys()].sort()).toEqual([...response.headers.keys()].sort());
  expect(deferred).toHaveLength(1);
});

test("the per-email reset limit returns the rate-limit envelope", async () => {
  const { security, calls } = accountSecurity();
  const { app } = await fixture({
    actor: null,
    security,
    sensitiveLimiter: { check: async () => ({ allowed: false, retryAfterSeconds: 600 }) },
  });
  const response = await send(app, "/api/v1/password-reset/request", "POST", {
    email: "editor@lace.test",
  });
  expect(response.status).toBe(429);
  expect(response.headers.get("retry-after")).toBe("600");
  expect((await response.json()).error.code).toBe("RATE_LIMITED");
  expect(calls).toEqual([]);
});

test("invalid invitation and reset tokens share one 410 envelope and never echo tokens", async () => {
  const { security } = accountSecurity();
  const { app, logs } = await fixture({ actor: null, security });
  for (const [path, body, code] of [
    ["/api/v1/invitations/inspect", { token: TOKEN }, "INVITATION_INVALID"],
    [
      "/api/v1/invitations/accept",
      { password: "long-password-123", token: TOKEN },
      "INVITATION_INVALID",
    ],
    [
      "/api/v1/password-reset/confirm",
      { password: "long-password-123", token: TOKEN },
      "RESET_INVALID",
    ],
  ]) {
    const response = await send(app, path, "POST", body);
    expect(response.status).toBe(410);
    const text = await response.text();
    expect(JSON.parse(text).error.code).toBe(code);
    expect(text).not.toContain(TOKEN);
  }
  const malformed = await send(app, "/api/v1/invitations/inspect", "POST", {
    token: "secret-value",
  });
  expect(malformed.status).toBe(422);
  expect(await malformed.text()).not.toContain("secret-value");
  const short = await send(app, "/api/v1/invitations/accept", "POST", {
    password: "short",
    token: TOKEN,
  });
  expect((await short.json()).error.details.issues.map((issue) => issue.path)).toEqual([
    "/password",
  ]);
  expect(JSON.stringify(logs)).not.toContain(TOKEN);
  expect(logs.every((entry) => !entry.path.includes("token"))).toBe(true);
});

test("public account routes are rate limited before any token lookup", async () => {
  const { security, calls } = accountSecurity();
  const { app } = await fixture({ actor: null, allowed: false, security });
  for (const path of [
    "/api/v1/invitations/inspect",
    "/api/v1/invitations/accept",
    "/api/v1/password-reset/confirm",
  ]) {
    const response = await send(app, path, "POST", { password: "long-password-123", token: TOKEN });
    expect(response.status).toBe(429);
  }
  expect(calls).toEqual([]);
});

test("account routes require a session and admin routes require users:manage", async () => {
  const { security, calls } = accountSecurity();
  const anonymous = await fixture({ actor: null, security });
  for (const [path, method, body] of [
    ["/api/v1/account", "PATCH", { displayName: "Ada" }],
    [
      "/api/v1/account/password",
      "POST",
      { currentPassword: "x", newPassword: "long-password-123", signOutOtherSessions: true },
    ],
    ["/api/v1/account/sessions", "GET"],
    ["/api/v1/account/sessions/s-other", "DELETE"],
    ["/api/v1/account/sessions/revoke-others", "POST", {}],
    ["/api/v1/admin/invitations", "GET"],
    ["/api/v1/admin/invitations", "POST", { email: "x@lace.test", role: "viewer" }],
  ]) {
    const response = await send(anonymous.app, path, method, body);
    expect(response.status, `${method} ${path}`).toBe(403);
    expect((await response.json()).error.code).toBe("AUTHORIZATION_DENIED");
  }
  const restricted = await fixture({ actor: editor, security });
  for (const [path, method, body] of [
    ["/api/v1/admin/invitations", "GET"],
    ["/api/v1/admin/invitations", "POST", { email: "x@lace.test", role: "viewer" }],
    ["/api/v1/admin/invitations/inv-1/resend", "POST", {}],
    ["/api/v1/admin/invitations/inv-1", "DELETE"],
    ["/api/v1/admin/users/admin/password-reset", "POST", {}],
    ["/api/v1/admin/users/admin/sessions/revoke", "POST", {}],
  ]) {
    expect((await send(restricted.app, path, method, body)).status, `${method} ${path}`).toBe(403);
  }
  expect(calls).toEqual([]);
});

test("self-service routes mark the current session and refuse to end it", async () => {
  const deferred = [];
  const { security, calls } = accountSecurity();
  const { app } = await fixture({
    actor: editor,
    defer: (task) => deferred.push(task),
    email: { from: "cms@lace.test", provider: "log", send: async () => ({ status: "sent" }) },
    security,
    sessionId: "s-current",
  });
  const listed = await send(app, "/api/v1/account/sessions", "GET");
  expect(await listed.json()).toEqual({
    items: [
      {
        browser: "Unknown",
        createdAt: "1970-01-01T00:00:00.001Z",
        current: true,
        id: "s-current",
        lastActiveAt: "1970-01-01T00:00:00.002Z",
        os: "Unknown",
      },
      {
        browser: "Chrome",
        createdAt: "1970-01-01T00:00:00.001Z",
        current: false,
        id: "s-other",
        lastActiveAt: "1970-01-01T00:00:00.003Z",
        os: "Windows",
      },
    ],
  });
  const current = await send(app, "/api/v1/account/sessions/s-current", "DELETE");
  expect(current.status).toBe(409);
  expect((await current.json()).error.code).toBe("CONFLICT");
  expect((await send(app, "/api/v1/account/sessions/foreign", "DELETE")).status).toBe(404);
  expect(await (await send(app, "/api/v1/account/sessions/revoke-others", "POST")).json()).toEqual({
    revoked: 2,
  });
  const changed = await send(app, "/api/v1/account/password", "POST", {
    currentPassword: "old password",
    newPassword: "long-password-123",
    signOutOtherSessions: true,
  });
  expect(await changed.json()).toEqual({ revoked: 1 });
  expect(calls.find(([name]) => name === "changePassword")[1]).toMatchObject({
    keepSessionId: "s-current",
    userId: "editor",
  });
  expect(deferred).toHaveLength(1);
  const renamed = await send(app, "/api/v1/account", "PATCH", { displayName: "  Ada Lovelace " });
  expect(renamed.status).toBe(200);
  expect(calls.find(([name]) => name === "updateDisplayName")[1]).toMatchObject({
    displayName: "Ada Lovelace",
    userId: "editor",
  });
  expect((await send(app, "/api/v1/account", "PATCH", { displayName: "   " })).status).toBe(422);
  const wrong = await fixture({
    actor: editor,
    security: accountSecurity({ changePassword: async () => ({ status: "invalid_credentials" }) })
      .security,
    sessionId: "s-current",
  });
  const denied = await send(wrong.app, "/api/v1/account/password", "POST", {
    currentPassword: "wrong",
    newPassword: "long-password-123",
    signOutOtherSessions: false,
  });
  expect(denied.status).toBe(400);
  expect((await denied.json()).error.code).toBe("INVALID_CREDENTIALS");
});

test("both runtimes share one sensitive-limit mapping for account routes", () => {
  const cases = [
    ["POST", "/api/auth/sign-in/email", { operation: "auth", scope: "client" }],
    ["GET", "/api/auth/get-session", undefined],
    ["POST", "/api/v1/invitations/inspect", { operation: "auth", scope: "client" }],
    ["POST", "/api/v1/invitations/accept", { operation: "auth", scope: "client" }],
    ["POST", "/api/v1/password-reset/request", { operation: "auth", scope: "client" }],
    ["POST", "/api/v1/password-reset/confirm", { operation: "auth", scope: "client" }],
    ["POST", "/api/v1/account/password", { operation: "auth", scope: "actor" }],
    ["PATCH", "/api/v1/account", undefined],
    ["GET", "/api/v1/account/sessions", undefined],
    ["GET", "/api/v1/admin/invitations", undefined],
    ["POST", "/api/v1/admin/invitations", { operation: "invite", scope: "actor" }],
    ["POST", "/api/v1/admin/invitations/inv-1/resend", { operation: "invite", scope: "actor" }],
    ["DELETE", "/api/v1/admin/invitations/inv-1", { operation: "invite", scope: "actor" }],
    ["POST", "/api/v1/admin/users/u-1/password-reset", { operation: "invite", scope: "actor" }],
    ["POST", "/api/v1/admin/users/u-1/sessions/revoke", undefined],
    ["POST", "/api/v1/setup/admin", { operation: "setup", scope: "client" }],
    ["POST", "/api/v1/admin/api-tokens", { operation: "token", scope: "actor" }],
    ["POST", "/api/v1/admin/media", { operation: "upload", scope: "actor" }],
    ["POST", "/api/v1/admin/settings/email-test", { operation: "email", scope: "actor" }],
  ];
  for (const [method, path, expected] of cases)
    expect(sensitiveRequestLimit(method, path), `${method} ${path}`).toEqual(expected);
});

test("media metadata route updates with If-Match, returns ETags, and queues builds for published media", async () => {
  let current = admin;
  const viewer = { id: actorId("viewer"), role: "viewer" };
  const { app, store } = await fixture({ maxBodyBytes: 8192, resolveActor: async () => current });
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
    return created.json();
  };
  const patch = (id, body, ifMatch) =>
    app.fetch(
      new Request(`https://lace.test/api/v1/admin/media/${id}`, {
        body: JSON.stringify(body),
        headers: {
          "content-type": "application/json",
          ...(ifMatch === undefined ? {} : { "if-match": ifMatch }),
        },
        method: "PATCH",
      }),
    );
  const cover = await upload("cover.png");
  const unused = await upload("unused.png");
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
  await json(app, `/api/v1/admin/entries/${entry.body.id}/publish`, {
    body: JSON.stringify({ expectedRevision: 1 }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  const detail = await app.fetch(new Request(`https://lace.test/api/v1/admin/media/${cover.id}`));
  const tag = detail.headers.get("etag");
  expect(tag).toBe(`"${Date.parse((await detail.json()).updatedAt)}"`);

  const version = await store.publishedContentVersion();
  const updated = await patch(
    cover.id,
    { alt: "Red bicycle", focalPoint: { x: 0.5, y: 0.3 } },
    tag,
  );
  expect(updated.status).toBe(200);
  const updatedBody = await updated.json();
  expect(updatedBody).toMatchObject({
    build: { status: "queued", targetVersion: version + 1 },
    media: { alt: "Red bicycle", focalPoint: { x: 0.5, y: 0.3 }, id: cover.id },
  });
  expect(JSON.stringify(updatedBody)).not.toContain("storageKey");
  const nextTag = updated.headers.get("etag");
  expect(nextTag).not.toBe(tag);
  expect(nextTag).toBe(`"${Date.parse(updatedBody.media.updatedAt)}"`);
  expect(store.mediaMetadataBuildRequests).toEqual([version + 1]);

  const stale = await patch(cover.id, { alt: "Stale" }, tag);
  expect(stale.status).toBe(409);
  expect(await stale.json()).toEqual({
    error: {
      code: "MEDIA_UPDATE_CONFLICT",
      message: "The media was modified by another request.",
    },
  });

  const unusedTag = `"${Date.parse(unused.updatedAt)}"`;
  const idle = await patch(unused.id, { caption: "Spare" }, unusedTag);
  expect(idle.status).toBe(200);
  expect((await idle.json()).build).toEqual({ status: "not-dispatched" });

  for (const [body, ifMatch, pointer] of [
    [{ alt: "x" }, undefined, ""],
    [{ alt: "x" }, `W/${nextTag}`, ""],
    [{ alt: "x" }, "*", ""],
    [{ focalPoint: { x: -0.1, y: 0.5 } }, nextTag, "/focalPoint/x"],
    [{ title: "x" }, nextTag, "/title"],
    [{ alt: "a\nb" }, nextTag, "/alt"],
    [{}, nextTag, ""],
  ]) {
    const refused = await patch(cover.id, body, ifMatch);
    expect(refused.status, JSON.stringify(body)).toBe(422);
    const envelope = await refused.json();
    expect(envelope.error.code).toBe("VALIDATION_FAILED");
    expect(envelope.error.details.issues.map((issue) => issue.path)).toContain(pointer);
  }
  expect((await patch("missing", { alt: "x" }, nextTag)).status).toBe(404);

  current = viewer;
  const denied = await patch(cover.id, { alt: "Viewer" }, nextTag);
  expect(denied.status).toBe(403);
  expect((await denied.json()).error.code).toBe("AUTHORIZATION_DENIED");
  current = admin;

  const deleting = await app.fetch(
    new Request(`https://lace.test/api/v1/admin/media/${unused.id}`, { method: "DELETE" }),
  );
  const deletingBody = await deleting.json();
  const refusedDeleting = await patch(
    unused.id,
    { alt: "Gone" },
    `"${Date.parse(deletingBody.updatedAt)}"`,
  );
  expect(refusedDeleting.status).toBe(422);
  expect((await refusedDeleting.json()).error.code).toBe("CONTENT_INVALID_STATE");
  expect((await json(app, `/api/v1/admin/media/${cover.id}`)).body).toMatchObject({
    alt: "Red bicycle",
    focalPoint: { x: 0.5, y: 0.3 },
  });
});

test("SEO values travel through admin, public and export contracts", async () => {
  const models = [
    definePage({ key: "home", path: "/", seo: true, version: 1 }),
    defineCollection({
      fields: { cover: field.media(), summary: field.textarea() },
      key: "posts",
      route: "/blog/:slug",
      seo: { description: "summary", image: "cover" },
      version: 1,
    }),
    defineCollection({ key: "notes", route: "/notes/:slug", version: 1 }),
    defineGlobal({
      fields: { siteName: field.text({ required: true }) },
      key: "settings",
      seoDefaults: { siteName: "siteName" },
      version: 1,
    }),
  ];
  const { app, store } = await fixture({ maxBodyBytes: 8192, models });
  for (const id of ["share", "other"]) {
    store.registerMedia({
      createdAt: unixMilliseconds(1),
      createdBy: admin.id,
      filename: `${id}.png`,
      id: mediaId(id),
      mimeType: "image/png",
      size: 1,
      status: "active",
      storageKey: `private/${id}`,
      updatedAt: unixMilliseconds(1),
    });
  }
  const call = (path, { body, method = "POST" } = {}) =>
    json(app, path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "content-type": "application/json" },
    });

  const listed = (await json(app, "/api/v1/admin/content-models")).body.items;
  expect(listed.find((model) => model.key === "posts").seo).toEqual({
    description: "summary",
    image: "cover",
  });
  expect(listed.find((model) => model.key === "home").seo).toEqual({
    description: null,
    image: null,
  });
  expect(listed.find((model) => model.key === "notes")).not.toHaveProperty("seo");
  expect(listed.find((model) => model.key === "settings").seoDefaults).toEqual({
    description: null,
    image: null,
    siteName: "siteName",
    titleTemplate: null,
  });

  const created = await call("/api/v1/admin/models/posts/entries", {
    body: {
      blocks: [],
      fields: { summary: "Hello" },
      seo: { canonical: "https://example.com/hello", image: "share", title: "Hello SEO" },
      slug: "hello",
      title: "Hello",
    },
  });
  expect(created.response.status).toBe(201);
  const fullSeo = {
    canonical: "https://example.com/hello",
    description: null,
    image: "share",
    noindex: false,
    title: "Hello SEO",
  };
  expect(created.body.draft.seo).toEqual(fullSeo);
  const entryPath = `/api/v1/admin/entries/${created.body.id}`;
  expect((await json(app, entryPath)).body.draft.seo).toEqual(fullSeo);

  for (const [seo, pointer] of [
    [{ canonical: "/hello" }, "/seo/canonical"],
    [{ title: "x".repeat(201) }, "/seo/title"],
    [{ keywords: "x" }, "/seo"],
  ]) {
    const invalid = await call(`${entryPath}/draft`, {
      body: { blocks: [], expectedRevision: 1, fields: {}, seo, slug: "hello", title: "Hello" },
      method: "PUT",
    });
    expect(invalid.response.status).toBe(422);
    expect(invalid.body.error.code).toBe("VALIDATION_FAILED");
    expect(invalid.body.error.details.issues.some((issue) => issue.path.startsWith(pointer))).toBe(
      true,
    );
  }
  const refused = await call("/api/v1/admin/models/notes/entries", {
    body: { blocks: [], fields: {}, seo: { title: "x" }, slug: "n", title: "Note" },
  });
  expect(refused.response.status).toBe(422);
  expect(refused.body.error.details.issues).toEqual([
    expect.objectContaining({ code: "seo_not_allowed", path: "/seo" }),
  ]);
  const note = await call("/api/v1/admin/models/notes/entries", {
    body: { blocks: [], fields: {}, seo: null, slug: "n", title: "Note" },
  });
  expect(note.response.status).toBe(201);
  expect(note.body.draft).not.toHaveProperty("seo");

  const published = await call(`${entryPath}/publish`, { body: { expectedRevision: 1 } });
  expect(published.body.entry.published.seo).toEqual(fullSeo);
  await call(`/api/v1/admin/entries/${note.body.id}/publish`, { body: { expectedRevision: 1 } });

  const page = await json(app, "/api/v1/public/collections/posts/hello");
  expect(page.body.entry.seo).toEqual(fullSeo);
  expect(Object.keys(page.body.media)).toEqual(["share"]);
  expect(
    (await json(app, "/api/v1/public/content/by-path?path=/blog/hello")).body.entry.seo,
  ).toEqual(fullSeo);
  expect((await json(app, "/api/v1/public/collections/posts")).body.items[0].seo).toEqual(fullSeo);
  expect((await json(app, "/api/v1/public/collections/notes/n")).body.entry).not.toHaveProperty(
    "seo",
  );
  expect(await store.loadPublicMedia(mediaId("share"))).toMatchObject({ id: "share" });
  expect(await store.loadPublicMedia(mediaId("other"))).toBeNull();

  const exported = (await json(app, "/api/v1/public/build-export")).body;
  expect(exported.seo).toEqual({
    defaults: {
      description: null,
      image: null,
      modelKey: "settings",
      siteName: "siteName",
      titleTemplate: null,
    },
    models: {
      home: { description: null, image: null },
      posts: { description: "summary", image: "cover" },
    },
  });
  expect(exported.entries.find((item) => item.modelKey === "posts").seo).toEqual(fullSeo);
  expect(exported.entries.find((item) => item.modelKey === "notes")).not.toHaveProperty("seo");
  expect(Object.keys(exported.media)).toEqual(["share"]);

  const detail = (await json(app, "/api/v1/admin/media/share")).body;
  expect(detail.usage).toEqual([
    expect.objectContaining({
      locations: [{ field: "image", source: "seo", states: ["draft", "published"] }],
    }),
  ]);
});

test("block envelopes travel through admin, public and export contracts", async () => {
  const panel = defineBlock({
    fields: { heading: field.text({ required: true }), image: field.media() },
    settings: { align: field.select({ defaultValue: "left", options: ["left", "center"] }) },
    type: "panel",
    version: 1,
  });
  const models = [
    defineCollection({ blocks: ["panel"], key: "posts", route: "/blog/:slug", version: 1 }),
    defineGlobal({ blocks: ["panel"], key: "settings", version: 1 }),
  ];
  const { app, store } = await fixture({ blocks: [panel], maxBodyBytes: 8192, models });
  for (const id of ["shown", "secret"]) {
    store.registerMedia({
      createdAt: unixMilliseconds(1),
      createdBy: admin.id,
      filename: `${id}.png`,
      id: mediaId(id),
      mimeType: "image/png",
      size: 1,
      status: "active",
      storageKey: `private/${id}`,
      updatedAt: unixMilliseconds(1),
    });
  }
  const call = (path, { body, method = "POST" } = {}) =>
    json(app, path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { "content-type": "application/json" },
    });
  const block = (key, position, envelope = {}, data = { heading: key }) => ({
    data,
    key,
    position,
    schemaVersion: 1,
    type: "panel",
    ...envelope,
  });

  const panelMetadata = (await json(app, "/api/v1/admin/content-models")).body.items.find(
    (model) => model.key === "posts",
  ).blockDefinitions[0];
  expect(panelMetadata.settings).toEqual({
    align: { defaultValue: "left", options: ["left", "center"], required: false, type: "select" },
  });

  const created = await call("/api/v1/admin/models/posts/entries", {
    body: {
      blocks: [
        block(
          "b1",
          1000,
          { anchor: "pricing", className: " wide  wide " },
          { heading: "A", image: "shown" },
        ),
        block("b2", 2000, { hidden: true }, { image: "secret" }),
        block("b3", 3000),
      ],
      fields: {},
      slug: "hello",
      title: "Hello",
    },
  });
  expect(created.response.status).toBe(201);
  expect(created.body.draft.blocks).toEqual([
    {
      anchor: "pricing",
      className: "wide",
      data: { heading: "A", image: "shown" },
      hidden: false,
      key: "b1",
      position: 1000,
      schemaVersion: 1,
      settings: { align: "left" },
      type: "panel",
    },
    {
      data: { image: "secret" },
      hidden: true,
      key: "b2",
      position: 2000,
      schemaVersion: 1,
      settings: { align: "left" },
      type: "panel",
    },
    {
      data: { heading: "b3" },
      hidden: false,
      key: "b3",
      position: 3000,
      schemaVersion: 1,
      settings: { align: "left" },
      type: "panel",
    },
  ]);
  const entryPath = `/api/v1/admin/entries/${created.body.id}`;

  for (const [envelope, pointer, code] of [
    [{ anchor: "Top" }, "/blocks/0/anchor", undefined],
    [{ hidden: "yes" }, "/blocks/0/hidden", undefined],
    [{ settings: { width: 2 } }, "/blocks/0/settings/width", "unknown_field"],
    [{ settings: { align: "right" } }, "/blocks/0/settings/align", undefined],
  ]) {
    const invalid = await call(`${entryPath}/draft`, {
      body: {
        blocks: [block("b1", 1000, envelope)],
        expectedRevision: 1,
        fields: {},
        slug: "hello",
        title: "Hello",
      },
      method: "PUT",
    });
    expect(invalid.response.status, JSON.stringify(envelope)).toBe(422);
    expect(invalid.body.error.code).toBe("VALIDATION_FAILED");
    const issue = invalid.body.error.details.issues.find((value) => value.path === pointer);
    expect(issue, JSON.stringify(invalid.body.error.details.issues)).toBeDefined();
    if (code !== undefined) expect(issue.code).toBe(code);
  }
  const duplicate = await call(`${entryPath}/draft`, {
    body: {
      blocks: [block("b1", 1000, { anchor: "faq" }), block("b2", 2000, { anchor: "faq" })],
      expectedRevision: 1,
      fields: {},
      slug: "hello",
      title: "Hello",
    },
    method: "PUT",
  });
  expect(duplicate.response.status).toBe(422);
  expect(duplicate.body.error.details.issues).toEqual([
    expect.objectContaining({ code: "duplicate_block_anchor", path: "/blocks/1/anchor" }),
  ]);

  // The hidden block lacks its required heading, yet the entry publishes.
  const published = await call(`${entryPath}/publish`, { body: { expectedRevision: 1 } });
  expect(published.response.status).toBe(200);
  const global = await call("/api/v1/admin/models/settings/entries", {
    body: {
      blocks: [block("g1", 1000, { hidden: true }, { heading: "G", image: "secret" })],
      fields: {},
      title: "Settings",
    },
  });
  expect(global.response.status).toBe(201);
  await call(`/api/v1/admin/entries/${global.body.id}/publish`, { body: { expectedRevision: 1 } });
  const publicGlobal = await json(app, "/api/v1/public/globals/settings");
  expect(publicGlobal.body.global.blocks).toEqual([]);
  expect(publicGlobal.body.media).toEqual({});

  const delivered = [
    {
      anchor: "pricing",
      className: "wide",
      data: { heading: "A", image: "shown" },
      key: "b1",
      position: 1000,
      schemaVersion: 1,
      settings: { align: "left" },
      type: "panel",
    },
    {
      data: { heading: "b3" },
      key: "b3",
      position: 3000,
      schemaVersion: 1,
      settings: { align: "left" },
      type: "panel",
    },
  ];
  const page = await json(app, "/api/v1/public/collections/posts/hello");
  expect(page.body.entry.blocks).toEqual(delivered);
  expect(Object.keys(page.body.media)).toEqual(["shown"]);
  expect(
    (await json(app, "/api/v1/public/content/by-path?path=/blog/hello")).body.entry.blocks,
  ).toEqual(delivered);
  expect((await json(app, "/api/v1/public/collections/posts")).body.items[0].blocks).toEqual(
    delivered,
  );
  const exported = (await json(app, "/api/v1/public/build-export")).body;
  expect(exported.entries[0].blocks).toEqual(delivered);
  expect(Object.keys(exported.media)).toEqual(["shown"]);
  expect((await json(app, "/api/v1/public/media/shown")).response.status).not.toBe(404);
  expect((await json(app, "/api/v1/public/media/secret")).response.status).toBe(404);
  expect((await json(app, entryPath)).body.published.blocks[1]).toMatchObject({
    hidden: true,
    key: "b2",
  });
});

test("composite metadata and content round trip with precise nested validation pointers", async () => {
  const { app } = await fixture({
    maxBodyBytes: 4096,
    models: [
      defineCollection({
        key: "posts",
        version: 1,
        route: "/blog/:slug",
        blocks: [],
        fields: {
          team: field.list({
            item: field.group({ fields: { url: field.url({ required: true }) } }),
          }),
          empty: field.group({ fields: {} }),
        },
      }),
    ],
  });
  const input = {
    title: "Nested",
    slug: "nested",
    blocks: [],
    fields: { team: [{ url: "/ok" }], empty: {} },
  };
  const created = await json(app, "/api/v1/admin/models/posts/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  expect(created.response.status).toBe(201);
  expect(created.body.draft.fields).toEqual(input.fields);
  const invalid = await json(app, "/api/v1/admin/models/posts/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...input, fields: { team: [{ url: "javascript:bad" }] } }),
  });
  expect(invalid.response.status).toBe(422);
  expect(invalid.body.error.details.issues).toContainEqual(
    expect.objectContaining({ path: "/fields/team/0/url" }),
  );
  const openApi = (await json(app, "/api/v1/openapi.json")).body;
  expect(
    openApi.components.schemas.GroupFieldDefinition.properties.fields.additionalProperties.$ref,
  ).toBe("#/components/schemas/FieldDefinition");
  expect(openApi.components.schemas.ListFieldDefinition.properties.item.oneOf).toContainEqual({
    $ref: "#/components/schemas/GroupFieldDefinition",
  });
});
