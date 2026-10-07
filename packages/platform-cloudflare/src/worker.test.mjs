import { afterEach, expect, test, vi } from "vitest";
import sharp from "sharp";
import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "@lacecms/application";
import { actorId, mediaId, unixMilliseconds } from "@lacecms/domain";
import config from "../../../lace.config.ts";
import {
  CloudflareEnvironmentError,
  SCHEDULED_MEDIA_DELETION_CLAIMS,
  SCHEDULED_TRACKING_CHECKS,
  createCloudflareAdminAssets,
  createCloudflareWorker,
  parseCloudflareSettings,
  producesDispatchWork,
} from "../dist/index.js";
import { countingD1, openLocalCloudflare } from "./d1-test-harness.mjs";

const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
});

const origin = "https://cms.lace.test";
const secret = "worker-auth-secret-that-is-long-enough-for-better-auth";
const password = "correct horse battery staple";
const fakeBucket = { delete() {}, get() {}, head() {}, put() {} };
const fakeDatabase = { batch() {}, prepare() {} };

test("settings require D1, R2, auth secret, and public URL and name issues without values", () => {
  const settings = parseCloudflareSettings({
    DB: fakeDatabase,
    LACE_AUTH_SECRET: secret,
    LACE_PUBLIC_BASE_URL: `${origin}/`,
    MEDIA: fakeBucket,
  });
  expect(settings).toMatchObject({
    deployHookTimeoutMs: 10_000,
    production: true,
    storageTimeoutMs: 10_000,
  });
  expect(settings.publicBaseUrl.href).toBe(`${origin}/`);
  expect(settings).not.toHaveProperty("cache");
  expect(settings).not.toHaveProperty("assets");
  expect(
    parseCloudflareSettings({
      ASSETS: { fetch() {} },
      CACHE: { delete() {}, get() {}, put() {} },
      DB: fakeDatabase,
      LACE_AUTH_SECRET: secret,
      LACE_DEPLOY_HOOK_TIMEOUT_MS: "2500",
      LACE_DEPLOY_HOOK_URL: "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/x",
      LACE_ENVIRONMENT: "development",
      LACE_PUBLIC_BASE_URL: "http://localhost:8787/",
      LACE_R2_TIMEOUT_MS: "250",
      MEDIA: fakeBucket,
    }),
  ).toMatchObject({ deployHookTimeoutMs: 2500, production: false, storageTimeoutMs: 250 });
  const leaked = "https://user:hunter2@hooks.example.test/?q=1#x";
  let failure;
  try {
    parseCloudflareSettings({
      CACHE: "not-a-binding",
      DB: {},
      LACE_AUTH_SECRET: " ",
      LACE_DEPLOY_HOOK_TIMEOUT_MS: "60001",
      LACE_DEPLOY_HOOK_URL: leaked,
      LACE_ENVIRONMENT: "staging",
      LACE_PUBLIC_BASE_URL: "https://cms.lace.test/path?x=1",
      LACE_R2_TIMEOUT_MS: "0",
    });
  } catch (error) {
    failure = error;
  }
  expect(failure).toBeInstanceOf(CloudflareEnvironmentError);
  expect(failure.issues.map((issue) => issue.variable).sort()).toEqual([
    "CACHE",
    "DB",
    "LACE_AUTH_SECRET",
    "LACE_DEPLOY_HOOK_TIMEOUT_MS",
    "LACE_DEPLOY_HOOK_URL",
    "LACE_ENVIRONMENT",
    "LACE_PUBLIC_BASE_URL",
    "LACE_R2_TIMEOUT_MS",
    "MEDIA",
  ]);
  expect(failure.message).not.toContain("hunter2");
  expect(JSON.stringify(failure.issues)).not.toContain("hunter2");
});

test("admin assets redirect, fall back to the SPA entry, and reject other methods", async () => {
  const files = new Map([
    ["/index.html", ["<!doctype html>", "text/html"]],
    ["/assets/app.js", ["console.log(1)", "text/javascript"]],
  ]);
  const requested = [];
  const assets = createCloudflareAdminAssets({
    fetch: async (request) => {
      const path = new URL(request.url).pathname;
      requested.push(path);
      const file = files.get(path);
      return file === undefined
        ? new Response("missing", { status: 404 })
        : new Response(file[0], { headers: { "content-type": file[1] } });
    },
  });
  const redirect = await assets.fetch(new Request(`${origin}/admin`));
  expect(redirect.status).toBe(308);
  expect(redirect.headers.get("location")).toBe(`${origin}/admin/`);
  const spa = await assets.fetch(new Request(`${origin}/admin/content/posts`));
  expect(spa.status).toBe(200);
  expect(await spa.text()).toBe("<!doctype html>");
  expect(spa.headers.get("x-content-type-options")).toBe("nosniff");
  const script = await assets.fetch(new Request(`${origin}/admin/assets/app.js`));
  expect(script.headers.get("content-type")).toBe("text/javascript");
  expect((await assets.fetch(new Request(`${origin}/admin/missing.js`))).status).toBe(404);
  const head = await assets.fetch(new Request(`${origin}/admin/`, { method: "HEAD" }));
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
  expect((await assets.fetch(new Request(`${origin}/admin/`, { method: "POST" }))).status).toBe(
    405,
  );
  expect(requested).toEqual(["/index.html", "/assets/app.js", "/missing.js", "/index.html"]);
});

test("only successful dispatch-producing admin mutations schedule post-commit work", () => {
  const request = (method, path) => new Request(`${origin}${path}`, { method });
  expect(producesDispatchWork(request("POST", "/api/v1/admin/entries/e/publish"), 200)).toBe(true);
  expect(producesDispatchWork(request("DELETE", "/api/v1/admin/entries/e"), 204)).toBe(true);
  expect(producesDispatchWork(request("DELETE", "/api/v1/admin/media/m"), 202)).toBe(true);
  expect(producesDispatchWork(request("POST", "/api/v1/admin/media/m/retry-deletion"), 202)).toBe(
    true,
  );
  expect(producesDispatchWork(request("POST", "/api/v1/admin/builds"), 202)).toBe(true);
  expect(producesDispatchWork(request("POST", "/api/v1/admin/builds/b/retry"), 202)).toBe(true);
  expect(producesDispatchWork(request("POST", "/api/v1/admin/entries/e/publish"), 409)).toBe(false);
  expect(producesDispatchWork(request("GET", "/api/v1/admin/entries/e"), 200)).toBe(false);
  expect(producesDispatchWork(request("PUT", "/api/v1/admin/entries/e/draft"), 200)).toBe(false);
});

let fixtureAddress = 0;
async function workerFixture(options = {}) {
  const clientAddress = `203.0.113.${++fixtureAddress}`;
  const local = await openLocalCloudflare();
  cleanups.push(local.dispose);
  const logs = [];
  const triggers = [];
  let offset = 0;
  const worker = createCloudflareWorker({
    buildTrigger: () => ({
      trigger: async (input) => {
        triggers.push(input);
        return options.buildResult ?? { status: "succeeded" };
      },
    }),
    clock: { now: () => unixMilliseconds(Date.now() + offset) },
    config,
    logger: { log() {} },
    operationalLogger: { error: (entry) => logs.push(entry) },
    postCommitBuildDelayMs: 0,
    ...options,
  });
  const env = {
    DB: local.database,
    LACE_AUTH_SECRET: secret,
    LACE_PUBLIC_BASE_URL: `${origin}/`,
    MEDIA: local.bucket,
    ...options.env,
  };
  const runtime = worker.runtime(env);
  const prepared = await prepareConfigurationSynchronization({
    models: config.runtime.content,
    state: runtime.repository,
  });
  let value = 0;
  await applyPreparedConfigurationSynchronization({
    clock: { now: () => unixMilliseconds(100) },
    ids: { next: () => `sync-${++value}` },
    models: config.runtime.content,
    prepared,
    target: runtime.repository,
  });
  const pending = [];
  const ctx = { waitUntil: (promise) => pending.push(promise) };
  let cookie;
  const call = async (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", clientAddress);
    if (cookie !== undefined) headers.set("cookie", cookie);
    if (init.json !== undefined) headers.set("content-type", "application/json");
    const response = await worker.fetch(
      new Request(`${origin}${path}`, {
        body: init.json === undefined ? init.body : JSON.stringify(init.json),
        headers,
        method: init.method ?? "GET",
      }),
      env,
      ctx,
    );
    const text = await response.text();
    return { body: text.length === 0 ? undefined : safeJson(text), response };
  };
  const signIn = async () => {
    const setup = await runtime.security.createSetupToken();
    const created = await call("/api/v1/setup/admin", {
      json: { email: "admin@lace.test", password, token: setup.token },
      method: "POST",
    });
    expect(created.response.status).toBe(201);
    const session = await worker.fetch(
      new Request(`${origin}/api/auth/sign-in/email`, {
        body: JSON.stringify({ email: "admin@lace.test", password }),
        headers: { "content-type": "application/json", origin, "cf-connecting-ip": clientAddress },
        method: "POST",
      }),
      env,
      ctx,
    );
    expect(session.status).toBe(200);
    expect(session.headers.get("set-cookie")).toContain("Secure");
    cookie = session.headers.getSetCookie()[0].split(";")[0];
    return created.body;
  };
  return {
    advance: (milliseconds) => {
      offset += milliseconds;
    },
    call,
    ctx,
    env,
    local,
    logs,
    pending,
    runtime,
    settle: async () => {
      while (pending.length > 0) await Promise.all(pending.splice(0));
    },
    signIn,
    triggers,
    worker,
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function png(width = 3, height = 2) {
  return sharp({ create: { background: { b: 3, g: 2, r: 1 }, channels: 3, height, width } })
    .png()
    .toBuffer();
}

async function upload(fixture, name = "cover.png") {
  const form = new FormData();
  form.append("file", new Blob([await png()], { type: "image/png" }), name);
  return fixture.call("/api/v1/admin/media", { body: form, method: "POST" });
}

test("Worker readiness rejects a D1 database with a pending migration", async () => {
  const fixture = await workerFixture();
  await fixture.local.database
    .prepare("delete from d1_migrations where name = ?")
    .bind("0002_mutation_guards.sql")
    .run();
  const ready = await fixture.call("/health/ready");
  expect(ready.response.status).toBe(503);
  expect(ready.body).toEqual({ status: "not_ready" });
});

test("Worker composition serves setup, auth, R2 media, and publication from D1", async () => {
  const fixture = await workerFixture();
  expect((await fixture.call("/health/ready")).response.status).toBe(200);
  expect((await fixture.call("/api/v1/admin/content-models")).response.status).toBe(403);
  const admin = await fixture.signIn();
  expect(admin).toMatchObject({ email: "admin@lace.test", role: "admin" });
  expect(
    (
      await fixture.call("/api/v1/setup/admin", {
        json: { email: "late@lace.test", password, token: "x".repeat(43) },
        method: "POST",
      })
    ).response.status,
  ).toBe(404);
  const models = await fixture.call("/api/v1/admin/content-models");
  expect(models.body.items.map((model) => model.key)).toEqual(["about", "home", "notes", "posts"]);

  const uploaded = await upload(fixture);
  expect(uploaded.response.status).toBe(201);
  expect(uploaded.body).toMatchObject({ height: 2, mimeType: "image/png", width: 3 });
  expect(await fixture.local.bucket.head(`media/${uploaded.body.id}`)).not.toBeNull();
  const binary = await fixture.worker.fetch(
    new Request(`${origin}/api/v1/public/media/${uploaded.body.id}`),
    fixture.env,
    fixture.ctx,
  );
  expect(binary.status).toBe(404);

  const created = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: { blocks: [], fields: { publishedAt: "2026-09-24" }, slug: "first", title: "First" },
    method: "POST",
  });
  expect(created.response.status).toBe(201);
  const published = await fixture.call(`/api/v1/admin/entries/${created.body.id}/publish`, {
    json: { expectedRevision: 1 },
    method: "POST",
  });
  expect(published.response.status).toBe(200);
  expect(fixture.pending).toHaveLength(1);
  const stale = await fixture.call(`/api/v1/admin/entries/${created.body.id}/publish`, {
    json: { expectedRevision: 5 },
    method: "POST",
  });
  expect(stale.response.status).toBe(409);
  expect(fixture.pending).toHaveLength(1);
  const publicEntry = await fixture.call("/api/v1/public/collections/posts/first");
  expect(publicEntry).toMatchObject({
    body: { entry: { draft: { title: "First" } } },
    response: { status: 200 },
  });
  const unknown = await fixture.call("/api/v1/unknown");
  expect(unknown.response.status).toBe(404);
  expect(unknown.body).toMatchObject({ error: { code: "NOT_FOUND" } });
  expect((await fixture.call("/admin/")).response.status).toBe(404);
  await fixture.settle();
});

test("invalid Worker settings return a sanitized 503 and log only variable names", async () => {
  const logs = [];
  const worker = createCloudflareWorker({
    config,
    operationalLogger: { error: (entry) => logs.push(entry) },
  });
  const env = { LACE_AUTH_SECRET: "super-secret-value", LACE_PUBLIC_BASE_URL: "nope" };
  const response = await worker.fetch(new Request(`${origin}/health/live`), env, {
    waitUntil() {},
  });
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
  await worker.scheduled({}, env, { waitUntil() {} });
  expect(logs).toHaveLength(2);
  expect(logs[0]).toMatchObject({ reason: "invalid_environment" });
  expect(logs[0].variables.split(",").sort()).toEqual(["DB", "LACE_PUBLIC_BASE_URL", "MEDIA"]);
  expect(JSON.stringify(logs)).not.toContain("super-secret-value");
});

test("scheduled and post-commit dispatch recover builds and media deletions", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  const created = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: { blocks: [], fields: { publishedAt: "2026-09-24" }, slug: "second", title: "Second" },
    method: "POST",
  });
  // The request ends without its post-commit pass: only the scheduled run recovers it.
  await fixture.call(`/api/v1/admin/entries/${created.body.id}/publish`, {
    json: { expectedRevision: 1 },
    method: "POST",
  });
  fixture.pending.splice(0);
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  expect(fixture.triggers).toHaveLength(0);
  fixture.advance(6_000);
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  expect(fixture.triggers).toHaveLength(1);
  const builds = await fixture.call("/api/v1/admin/site-builds");
  expect(builds.body.items[0]).toMatchObject({ status: "succeeded" });

  const uploaded = await upload(fixture);
  const deleted = await fixture.call(`/api/v1/admin/media/${uploaded.body.id}`, {
    method: "DELETE",
  });
  expect(deleted.response.status).toBeGreaterThanOrEqual(200);
  expect(deleted.response.status).toBeLessThan(300);
  expect(fixture.pending).toHaveLength(1);
  await fixture.settle();
  expect(await fixture.local.bucket.head(`media/${uploaded.body.id}`)).toBeNull();
  expect((await fixture.call(`/api/v1/admin/media/${uploaded.body.id}`)).response.status).toBe(404);

  const failing = await upload(fixture, "second.png");
  await fixture.runtime.repository.markForDeletion({
    mediaId: mediaId(failing.body.id),
    requestedAt: unixMilliseconds(Date.now()),
    requestedBy: { id: actorId("admin"), role: "admin" },
  });
  fixture.runtime.buildDispatcher.runOnce = async () => {
    throw new Error(`boom ${secret}`);
  };
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  expect(await fixture.local.bucket.head(`media/${failing.body.id}`)).toBeNull();
  expect(fixture.logs).toContainEqual({
    component: "dispatch",
    dispatcher: "site-build",
    reason: "dispatch_failed",
  });
  expect(JSON.stringify(fixture.logs)).not.toContain(secret);
});

test("a scheduled run with many pending deletions stays within 50 D1 queries", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  const ids = [];
  for (let index = 0; index < SCHEDULED_MEDIA_DELETION_CLAIMS + 3; index += 1) {
    const uploaded = await upload(fixture, `bulk-${index}.png`);
    ids.push(uploaded.body.id);
    await fixture.runtime.repository.markForDeletion({
      mediaId: mediaId(uploaded.body.id),
      requestedAt: unixMilliseconds(Date.now()),
      requestedBy: { id: actorId("admin"), role: "admin" },
    });
  }
  const counted = countingD1(fixture.local.database);
  const env = { ...fixture.env, DB: counted.binding };
  await fixture.worker.scheduled({}, env, fixture.ctx);
  expect(counted.stats.queries).toBeLessThanOrEqual(50);
  expect(counted.stats.maxParameters).toBeLessThanOrEqual(100);
  const remaining = [];
  for (const id of ids)
    if ((await fixture.local.bucket.head(`media/${id}`)) !== null) remaining.push(id);
  expect(remaining).toHaveLength(3);
  await fixture.worker.scheduled({}, env, fixture.ctx);
  for (const id of ids) expect(await fixture.local.bucket.head(`media/${id}`)).toBeNull();
});

test("a configured deploy hook receives scheduled builds and records untracked acceptance", async () => {
  const hook = "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/hook-secret";
  const calls = [];
  vi.stubGlobal("fetch", async (target, init) => {
    calls.push({ body: init.body, method: init.method, target: String(target) });
    return Response.json({ result: { id: "dep-42" }, success: true });
  });
  const fixture = await workerFixture({
    buildTrigger: undefined,
    env: { LACE_DEPLOY_HOOK_URL: hook },
  });
  await fixture.signIn();
  const created = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: { blocks: [], fields: { publishedAt: "2026-09-24" }, slug: "hooked", title: "Hooked" },
    method: "POST",
  });
  await fixture.call(`/api/v1/admin/entries/${created.body.id}/publish`, {
    json: { expectedRevision: 1 },
    method: "POST",
  });
  fixture.pending.splice(0);
  fixture.advance(6_000);
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  expect(calls).toEqual([{ body: undefined, method: "POST", target: hook }]);
  const builds = await fixture.call("/api/v1/admin/site-builds");
  expect(builds.body.items[0]).toMatchObject({ providerBuildId: "dep-42", status: "accepted" });
  expect(JSON.stringify(builds.body)).not.toContain("hook-secret");
  expect(JSON.stringify(fixture.logs)).not.toContain("hook-secret");
});

test("without a deploy hook, dispatch records a sanitized trigger-unavailable failure", async () => {
  const fixture = await workerFixture({ buildTrigger: undefined });
  await fixture.signIn();
  await fixture.call("/api/v1/admin/builds", { method: "POST" });
  fixture.pending.splice(0);
  fixture.advance(6_000);
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  const builds = await fixture.call("/api/v1/admin/site-builds");
  expect(builds.body.items[0]).toMatchObject({ error: "trigger_unavailable", status: "pending" });
});

test("Worker loads the same safe current build-site identity", () => {
  const env = {
    DB: fakeDatabase,
    MEDIA: fakeBucket,
    LACE_AUTH_SECRET: secret,
    LACE_PUBLIC_BASE_URL: `${origin}/`,
  };
  expect(parseCloudflareSettings(env).buildSite).toBe(null);
  expect(
    parseCloudflareSettings({
      ...env,
      LACE_BUILD_SITE_ID: "real-site",
      LACE_BUILD_SITE_LABEL: "Real site",
    }).buildSite,
  ).toEqual({ id: "real-site", label: "Real site" });
  expect(() =>
    parseCloudflareSettings({
      ...env,
      LACE_BUILD_SITE_ID: "real-site",
      LACE_BUILD_SITE_LABEL: "/private/secret",
    }),
  ).toThrow("Invalid build site configuration: LACE_BUILD_SITE_ID, LACE_BUILD_SITE_LABEL.");
});

test.each([null, { id: "real-site", label: "Real site" }])(
  "Worker composition serves current identity %j",
  async (site) => {
    const fixture = await workerFixture({
      env: site
        ? {
            LACE_BUILD_SITE_ID: site.id,
            LACE_BUILD_SITE_LABEL: site.label,
          }
        : {},
    });
    await fixture.signIn();
    const response = await fixture.call("/api/v1/admin/build-site");
    expect(response.response.status).toBe(200);
    expect(response.body).toEqual({ site });
  },
);

test("Worker/D1 compares strong and weak export validators through publication", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  const created = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: { blocks: [], fields: { publishedAt: "2026-09-24" }, slug: "etag", title: "First" },
    method: "POST",
  });
  const path = `/api/v1/admin/entries/${created.body.id}`;
  expect(
    (await fixture.call(`${path}/publish`, { json: { expectedRevision: 1 }, method: "POST" }))
      .response.status,
  ).toBe(200);
  const buildToken = await fixture.runtime.security.createBuildToken({
    name: "etag-test",
    now: unixMilliseconds(Date.now()),
  });
  const headers = { authorization: `Bearer ${buildToken.token}` };
  const fresh = await fixture.call("/api/v1/public/build-export", { headers });
  expect(fresh.response.status).toBe(200);
  const etag = fresh.response.headers.get("etag");
  expect(etag).toBe(`"${fresh.body.version}"`);
  for (const tag of [etag, `W/${etag}`]) {
    const result = await fixture.call("/api/v1/public/build-export", {
      headers: { ...headers, "if-none-match": tag },
    });
    expect(result.response.status).toBe(304);
    expect(result.body).toBeUndefined();
    expect(result.response.headers.get("etag")).toBe(etag);
  }
  expect(
    (
      await fixture.call("/api/v1/public/build-export", {
        headers: { "if-none-match": `W/${etag}` },
      })
    ).response.status,
  ).toBe(403);
  for (const tag of ["*", 'W/"bad"', '"1", "2"', '"9007199254740992"'])
    expect(
      (
        await fixture.call("/api/v1/public/build-export", {
          headers: { ...headers, "if-none-match": tag },
        })
      ).response.status,
    ).toBe(422);
  expect(
    (
      await fixture.call(`${path}/draft`, {
        json: {
          blocks: [],
          expectedRevision: 1,
          fields: { publishedAt: "2026-09-24" },
          slug: "etag",
          title: "Second",
        },
        method: "PUT",
      })
    ).response.status,
  ).toBe(200);
  expect(
    (
      await fixture.call(`${path}/publish`, {
        headers: { "if-match": 'W/"2"' },
        json: { expectedRevision: 2 },
        method: "POST",
      })
    ).response.status,
  ).toBe(422);
  expect(
    (await fixture.call(`${path}/publish`, { json: { expectedRevision: 2 }, method: "POST" }))
      .response.status,
  ).toBe(200);
  const changed = await fixture.call("/api/v1/public/build-export", {
    headers: { ...headers, "if-none-match": `W/${etag}` },
  });
  expect(changed.response.status).toBe(200);
  expect(changed.body.version).toBe(fresh.body.version + 1);
  expect(changed.response.headers.get("etag")).toBe(`"${changed.body.version}"`);
  expect(
    changed.body.entries.find(({ entry }) => entry.id === created.body.id).entry.published.title,
  ).toBe("Second");
  await fixture.settle();
});

test("Worker history and detail preserve source diagnostics", async () => {
  const fixture = await workerFixture({
    buildResult: { status: "failed", reason: "source_symlink", path: "src/linked.astro" },
  });
  await fixture.signIn();
  const receipt = await fixture.call("/api/v1/admin/builds", { method: "POST", json: {} });
  fixture.pending.splice(0);
  fixture.advance(6000);
  await fixture.worker.scheduled({}, fixture.env, fixture.ctx);
  const builds = await fixture.call("/api/v1/admin/site-builds");
  expect(builds.body.items[0]).toMatchObject({
    id: receipt.body.eventId,
    status: "pending",
    error: "source_symlink",
    errorPath: "src/linked.astro",
  });
  const detail = await fixture.call(`/api/v1/admin/site-builds/${receipt.body.eventId}`);
  expect(detail.body).toMatchObject({ error: "source_symlink", errorPath: "src/linked.astro" });
});

const pagesAccount = "0123456789abcdef0123456789abcdef";
const pagesToken = "pages-read-token-secret";
const trackedHook = "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/hook-secret";
const pagesEnv = {
  LACE_DEPLOY_HOOK_URL: trackedHook,
  LACE_PAGES_ACCOUNT_ID: pagesAccount,
  LACE_PAGES_API_TOKEN: pagesToken,
  LACE_PAGES_PROJECT_NAME: "my-site",
};

test("Pages tracking settings are all-or-none, bounded and never echoed", () => {
  const base = {
    DB: fakeDatabase,
    LACE_AUTH_SECRET: secret,
    LACE_PUBLIC_BASE_URL: `${origin}/`,
    MEDIA: fakeBucket,
  };
  expect(parseCloudflareSettings(base)).not.toHaveProperty("pagesTracking");
  const tracked = parseCloudflareSettings({ ...base, ...pagesEnv });
  expect(tracked.pagesTracking).toMatchObject({
    accountId: pagesAccount,
    apiToken: pagesToken,
    projectName: "my-site",
    timeoutMs: 3_600_000,
  });
  expect(tracked.pagesTracking.apiBaseUrl.href).toBe("https://api.cloudflare.com/client/v4/");
  const development = parseCloudflareSettings({
    ...base,
    ...pagesEnv,
    LACE_ENVIRONMENT: "development",
    LACE_PAGES_API_BASE_URL: "http://127.0.0.1:9100/client/v4/",
    LACE_PAGES_TRACKING_TIMEOUT_MINUTES: "1440",
  });
  expect(development.pagesTracking.timeoutMs).toBe(86_400_000);
  expect(development.pagesTracking.apiBaseUrl.href).toBe("http://127.0.0.1:9100/client/v4/");
  const issues = (env) => {
    try {
      parseCloudflareSettings({ ...base, ...env });
    } catch (error) {
      expect(error).toBeInstanceOf(CloudflareEnvironmentError);
      expect(JSON.stringify(error.issues)).not.toContain(pagesToken);
      expect(error.message).not.toContain(pagesToken);
      return error.issues.map((issue) => `${issue.variable}:${issue.reason}`).sort();
    }
    return [];
  };
  expect(issues({ LACE_PAGES_ACCOUNT_ID: pagesAccount })).toEqual([
    "LACE_PAGES_API_TOKEN:missing",
    "LACE_PAGES_PROJECT_NAME:missing",
  ]);
  expect(
    issues({
      LACE_PAGES_ACCOUNT_ID: "ABC",
      LACE_PAGES_API_TOKEN: `${pagesToken} with space`,
      LACE_PAGES_PROJECT_NAME: "My_Site",
    }),
  ).toEqual([
    "LACE_PAGES_ACCOUNT_ID:invalid",
    "LACE_PAGES_API_TOKEN:invalid",
    "LACE_PAGES_PROJECT_NAME:invalid",
  ]);
  for (const minutes of ["4", "1441", "7.5", "soon"])
    expect(issues({ ...pagesEnv, LACE_PAGES_TRACKING_TIMEOUT_MINUTES: minutes })).toEqual([
      "LACE_PAGES_TRACKING_TIMEOUT_MINUTES:invalid",
    ]);
  expect(
    issues({ ...pagesEnv, LACE_PAGES_API_BASE_URL: "https://stub.example.test/client/v4/" }),
  ).toEqual(["LACE_PAGES_API_BASE_URL:invalid"]);
  for (const url of [
    "http://stub.example.test/",
    "https://stub.example.test/v4",
    "ftp://127.0.0.1/",
  ])
    expect(
      issues({ ...pagesEnv, LACE_ENVIRONMENT: "development", LACE_PAGES_API_BASE_URL: url }),
    ).toEqual(["LACE_PAGES_API_BASE_URL:invalid"]);
});

/** A controlled Cloudflare: a deploy hook returning queued IDs and a Pages deployments API. */
function cloudflareStub() {
  const state = { calls: [], deployments: new Map(), hookIds: [] };
  vi.stubGlobal("fetch", async (target, init) => {
    const url = String(target);
    state.calls.push({ authorization: init.headers?.authorization, method: init.method, url });
    if (url === trackedHook) {
      const id = state.hookIds.shift();
      return Response.json(
        id === undefined ? { result: {}, success: true } : { result: { id }, success: true },
      );
    }
    const match = /\/accounts\/([^/]+)\/pages\/projects\/([^/]+)\/deployments\/([^/]+)$/u.exec(url);
    if (match === null || match[1] !== pagesAccount || match[2] !== "my-site")
      return new Response("unexpected", { status: 418 });
    const id = decodeURIComponent(match[3]);
    const behavior = state.deployments.get(id);
    const next = Array.isArray(behavior)
      ? behavior.length > 1
        ? behavior.shift()
        : behavior[0]
      : behavior;
    if (next === undefined) return new Response("missing", { status: 404 });
    if (typeof next === "number") return new Response("status", { status: next });
    const [name, status, extra = {}] = next;
    return Response.json({
      result: {
        env_vars: { LACE_BUILD_TOKEN: { type: "secret_text", value: "pages-env-secret" } },
        id,
        is_skipped: false,
        latest_stage: { name, status },
        ...extra,
      },
      success: true,
    });
  });
  return state;
}

async function trackedFixture(env = {}) {
  const fixture = await workerFixture({ buildTrigger: undefined, env: { ...pagesEnv, ...env } });
  await fixture.signIn();
  const run = async (env = fixture.env, worker = fixture.worker) => {
    await worker.scheduled({}, env, fixture.ctx);
  };
  const dispatch = async () => {
    const requested = await fixture.call("/api/v1/admin/builds", { method: "POST" });
    expect(requested.response.status).toBe(202);
    fixture.pending.splice(0);
    fixture.advance(6_000);
    await run();
    return (await fixture.call("/api/v1/admin/site-builds")).body.items[0];
  };
  const build = async (id) => (await fixture.call(`/api/v1/admin/site-builds/${id}`)).body;
  return { ...fixture, build, dispatch, run };
}

test("tracked Pages deployments reach proven outcomes from the exact deployment", async () => {
  const stub = cloudflareStub();
  const fixture = await trackedFixture();
  stub.hookIds.push("dep-ok", "dep-build", "dep-deploy", "dep-cancel", "dep-skip", "dep-denied");
  stub.deployments.set("dep-ok", [
    ["build", "active"],
    ["build", "success"],
    ["deploy", "success"],
  ]);
  stub.deployments.set("dep-build", [["build", "failure"]]);
  stub.deployments.set("dep-deploy", [["deploy", "failure"]]);
  stub.deployments.set("dep-cancel", [["build", "canceled"]]);
  stub.deployments.set("dep-skip", [["queued", "idle", { is_skipped: true }]]);
  stub.deployments.set("dep-denied", [403]);

  const ok = await fixture.dispatch();
  expect(ok).toMatchObject({
    providerBuildId: "dep-ok",
    providerStage: "build",
    status: "running",
  });
  expect(ok.providerCheckedAt).toBeTypeOf("string");
  fixture.advance(31_000);
  await fixture.run();
  expect(await fixture.build(ok.id)).toMatchObject({ providerStage: "build", status: "running" });
  fixture.advance(31_000);
  await fixture.run();
  const succeeded = await fixture.build(ok.id);
  expect(succeeded).toMatchObject({ providerStage: "deploy", status: "succeeded" });
  expect(succeeded).not.toHaveProperty("error");
  expect(succeeded.completedAt).toBeTypeOf("string");

  const outcomes = [];
  for (let index = 0; index < 5; index += 1) {
    const build = await fixture.dispatch();
    outcomes.push([build.providerBuildId, build.status, build.error, build.providerStage]);
  }
  expect(outcomes).toEqual([
    ["dep-build", "failed", "provider_build_failed", "build"],
    ["dep-deploy", "failed", "provider_deploy_failed", "deploy"],
    ["dep-cancel", "cancelled", "provider_cancelled", "build"],
    ["dep-skip", "cancelled", "provider_skipped", "queued"],
    ["dep-denied", "unknown", "tracking_forbidden", undefined],
  ]);
  const pagesCalls = stub.calls.filter((call) => call.method === "GET");
  expect(pagesCalls.every((call) => call.authorization === `Bearer ${pagesToken}`)).toBe(true);
  const hookCalls = stub.calls.filter((call) => call.method === "POST");
  expect(hookCalls.every((call) => call.authorization === undefined)).toBe(true);
  const attempts = await fixture.local.database
    .prepare("select max(attempts) as attempts from outbox_events")
    .first();
  expect(attempts.attempts).toBe(0);
  const stored = JSON.stringify(
    (await fixture.local.database.prepare("select * from site_builds").all()).results,
  );
  const history = JSON.stringify((await fixture.call("/api/v1/admin/site-builds")).body);
  for (const leaked of [pagesToken, "pages-env-secret", "hook-secret"]) {
    expect(stored).not.toContain(leaked);
    expect(history).not.toContain(leaked);
    expect(JSON.stringify(fixture.logs)).not.toContain(leaked);
  }
});

test("transient outages back off, parallel builds stay separate and late results change nothing", async () => {
  const stub = cloudflareStub();
  const fixture = await trackedFixture({ LACE_PAGES_TRACKING_TIMEOUT_MINUTES: "5" });
  stub.hookIds.push("dep-a", "dep-b", "dep-slow");
  stub.deployments.set("dep-a", [503, 429, ["deploy", "success"]]);
  stub.deployments.set("dep-b", [
    ["build", "active"],
    ["deploy", "success"],
  ]);
  stub.deployments.set("dep-slow", [["deploy", "active"]]);
  const a = await fixture.dispatch();
  const b = await fixture.dispatch();
  expect(a).toMatchObject({ providerBuildId: "dep-a", status: "running" });
  expect(a).not.toHaveProperty("providerStage");
  expect(b).toMatchObject({ providerBuildId: "dep-b", providerStage: "build", status: "running" });
  const due = async (id) =>
    (
      await fixture.local.database
        .prepare("select provider_check_after from site_builds where id = ?")
        .bind(id)
        .first()
    ).provider_check_after;
  const firstDue = await due(a.id);
  fixture.advance(31_000);
  await fixture.run();
  // A's second outage waits longer than its first; B finished independently.
  expect(await fixture.build(b.id)).toMatchObject({
    providerBuildId: "dep-b",
    status: "succeeded",
  });
  expect(await fixture.build(a.id)).toMatchObject({ providerBuildId: "dep-a", status: "running" });
  expect((await due(a.id)) - firstDue).toBeGreaterThan(31_000);
  fixture.advance(120_000);
  await fixture.run();
  expect(await fixture.build(a.id)).toMatchObject({ providerStage: "deploy", status: "succeeded" });

  const slow = await fixture.dispatch();
  expect(slow).toMatchObject({ providerStage: "deploy", status: "running" });
  for (let minute = 0; minute < 6; minute += 1) {
    fixture.advance(60_000);
    await fixture.run();
  }
  expect(await fixture.build(slow.id)).toMatchObject({
    error: "tracking_timeout",
    providerStage: "deploy",
    status: "unknown",
  });
  const callsAtTimeout = stub.calls.length;
  stub.deployments.set("dep-slow", [["deploy", "success"]]);
  fixture.advance(600_000);
  await fixture.run();
  expect(stub.calls.length).toBe(callsAtTimeout);
  expect(await fixture.build(slow.id)).toMatchObject({
    error: "tracking_timeout",
    status: "unknown",
  });
});

test("tracking survives Worker restarts, ignores hooks without IDs and ends when removed", async () => {
  const stub = cloudflareStub();
  const fixture = await trackedFixture();
  stub.hookIds.push("dep-restart");
  stub.deployments.set("dep-restart", [
    ["build", "active"],
    ["deploy", "success"],
  ]);
  const tracked = await fixture.dispatch();
  expect(tracked.status).toBe("running");
  // An invocation claims the check and dies before recording it.
  fixture.advance(31_000);
  const claimed = await fixture.runtime.repository.claimTrackedSiteBuildChecks({
    leaseMs: 60_000,
    limit: 5,
    now: unixMilliseconds(Date.now() + 31_000 + 6_000),
  });
  expect(claimed).toHaveLength(1);
  const restarted = createCloudflareWorker({
    clock: { now: () => unixMilliseconds(Date.now() + 37_000 + 61_000) },
    config,
    logger: { log() {} },
    operationalLogger: { error: (entry) => fixture.logs.push(entry) },
  });
  const restartedEnv = { ...fixture.env };
  await restarted.scheduled({}, restartedEnv, fixture.ctx);
  expect(await fixture.build(tracked.id)).toMatchObject({
    providerStage: "deploy",
    status: "succeeded",
  });

  const anonymous = await fixture.dispatch();
  expect(anonymous).toMatchObject({ status: "accepted" });
  expect(anonymous).not.toHaveProperty("providerBuildId");

  stub.hookIds.push("dep-orphan");
  stub.deployments.set("dep-orphan", [["queued", "active"]]);
  const orphan = await fixture.dispatch();
  expect(orphan.status).toBe("running");
  const untracked = { ...fixture.env };
  for (const name of Object.keys(pagesEnv))
    if (name !== "LACE_DEPLOY_HOOK_URL") delete untracked[name];
  fixture.advance(31_000);
  const before = stub.calls.length;
  await fixture.run(untracked);
  expect(stub.calls.length).toBe(before);
  expect(await fixture.build(orphan.id)).toMatchObject({
    error: "tracking_unconfigured",
    status: "unknown",
  });
  expect(fixture.logs).toContainEqual({
    buildId: orphan.id,
    component: "site-build-tracking",
    reason: "tracking_unconfigured",
  });
});

test("a scheduled run with many due tracked builds stays within 50 D1 queries", async () => {
  const stub = cloudflareStub();
  const fixture = await trackedFixture();
  const ids = [];
  for (let index = 0; index < SCHEDULED_TRACKING_CHECKS + 2; index += 1) {
    ids.push(`dep-${index}`);
    stub.hookIds.push(`dep-${index}`);
    stub.deployments.set(`dep-${index}`, [["build", "active"]]);
    await fixture.dispatch();
  }
  for (const id of ids) stub.deployments.set(id, [["deploy", "success"]]);
  await fixture.call("/api/v1/admin/builds", { method: "POST" });
  fixture.pending.splice(0);
  stub.hookIds.push("dep-new");
  stub.deployments.set("dep-new", [["build", "active"]]);
  fixture.advance(60_000);
  const counted = countingD1(fixture.local.database);
  const before = stub.calls.filter((call) => call.method === "GET").length;
  await fixture.run({ ...fixture.env, DB: counted.binding });
  expect(counted.stats.queries).toBeLessThanOrEqual(50);
  expect(stub.calls.filter((call) => call.method === "GET").length - before).toBe(
    SCHEDULED_TRACKING_CHECKS,
  );
  const history = (await fixture.call("/api/v1/admin/site-builds")).body.items;
  expect(history.filter((build) => build.status === "succeeded")).toHaveLength(
    SCHEDULED_TRACKING_CHECKS,
  );
  expect(history.filter((build) => build.status === "running")).toHaveLength(3);
});

test("Worker identity trusts only its ingress and ignores arbitrary provider/forwarding headers", async () => {
  const fixture = await workerFixture();
  const make = (ip) =>
    new Request(`${origin}/api/v1/setup/admin`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "cf-connecting-ip": ip,
        "x-forwarded-for": "192.0.2.99",
        "x-lace-client-address": "192.0.2.98",
      },
      body: "{}",
    });
  const direct = make("198.51.100.1");
  await fixture.runtime.app.fetch(direct);
  expect(fixture.runtime.clients.get(direct)).toBe("0.0.0.0");
  const ingress = make("198.51.100.2");
  await fixture.worker.fetch(ingress, fixture.env, fixture.ctx);
  expect(fixture.runtime.clients.get(ingress)).toBe("198.51.100.2");
  const invalid = make("secret-not-an-ip");
  await fixture.worker.fetch(invalid, fixture.env, fixture.ctx);
  expect(fixture.runtime.clients.get(invalid)).toBe("0.0.0.0");
});
