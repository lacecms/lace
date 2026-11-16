import { strict as assert } from "node:assert";
import { object, string } from "./test-support/json.js";
import type { WorkerCallInit } from "./test-support/worker-harness.js";
import type { WorkerOperationalLogger } from "./runtime/worker.js";
import { afterEach, expect, test, vi } from "vitest";
import { readFile } from "node:fs/promises";
import sharp from "sharp";

import config from "../../../lace.config.js";
import {
  CloudflareEnvironmentError,
  createCloudflareAdminAssets,
  createCloudflareWorker,
  parseCloudflareSettings,
} from "./index.js";

import { createWorkerFixture, origin, secret } from "./test-support/worker-harness.js";
const cleanups: Array<() => unknown> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
});

const fakeBucket = { delete() {}, get() {}, head() {}, put() {} };
const fakeDatabase = { batch() {}, prepare() {} };

const workerFixture = (options = {}) =>
  createWorkerFixture(createCloudflareWorker, cleanups, options);

async function png(width = 3, height = 2) {
  return sharp({ create: { background: { b: 3, g: 2, r: 1 }, channels: 3, height, width } })
    .png()
    .toBuffer();
}

async function upload(fixture: Awaited<ReturnType<typeof workerFixture>>, name = "cover.png") {
  const form = new FormData();
  form.append("file", new Blob([await png()], { type: "image/png" }), name);
  return fixture.call("/api/v1/admin/media", { body: form, method: "POST" });
}

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
  assert(failure instanceof CloudflareEnvironmentError);
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
  const files = new Map<string, [string, string]>([
    ["/index.html", ["<!doctype html>", "text/html"]],
    ["/assets/app.js", ["console.log(1)", "text/javascript"]],
  ]);
  const requested: string[] = [];
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

test("only requests that committed outbox work register a post-commit pass", async () => {
  const fixture = await workerFixture();
  await fixture.signIn();
  fixture.pending.splice(0);
  /** Runs one request and returns how many passes it registered. */
  const passes = async (path: string, init: WorkerCallInit, status: number) => {
    const before = fixture.pending.length;
    const result = await fixture.call(path, init);
    expect(result.response.status).toBe(status);
    return { passes: fixture.pending.length - before, result };
  };
  const created = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: { blocks: [], fields: { publishedAt: "2026-09-24" }, slug: "queued", title: "Queued" },
    method: "POST",
  });
  const path = `/api/v1/admin/entries/${string(object(created.body).id)}`;
  const draft = { blocks: [], fields: { publishedAt: "2026-09-24" }, slug: "queued" };
  expect(
    (
      await passes(
        `${path}/draft`,
        { json: { ...draft, expectedRevision: 1, title: "Saved" }, method: "PUT" },
        200,
      )
    ).passes,
  ).toBe(0);
  expect(
    (
      await passes(
        `${path}/publish`,
        {
          json: { expectedRevision: 1 },
          method: "POST",
        },
        409,
      )
    ).passes,
  ).toBe(0);
  const publication = {
    headers: { "idempotency-key": "worker-publication" },
    json: { expectedRevision: 2 },
    method: "POST",
  };
  const published = await passes(`${path}/publish`, publication, 200);
  expect(published.passes).toBe(1);
  expect((await passes(`${path}/publish`, publication, 200)).passes).toBe(0);
  expect((await passes(path, {}, 200)).passes).toBe(0);
  expect(
    (
      await passes(
        `${path}/unpublish`,
        {
          json: {
            expectedPublishedSnapshotId: object(
              object(object(published.result.body).entry).published,
            ).id,
          },
          method: "POST",
        },
        200,
      )
    ).passes,
  ).toBe(1);
  const uploaded = await upload(fixture);
  expect(
    (
      await passes(
        `/api/v1/admin/media/${string(object(uploaded.body).id)}`,
        { method: "DELETE" },
        202,
      )
    ).passes,
  ).toBe(1);
  await fixture.settle();

  // Concurrent requests in one isolate are attributed to their own scope.
  const other = await fixture.call("/api/v1/admin/models/posts/entries", {
    json: { blocks: [], fields: { publishedAt: "2026-09-24" }, slug: "racing", title: "Racing" },
    method: "POST",
  });
  const publishing: Promise<unknown>[] = [];
  const reading: Promise<unknown>[] = [];
  const [racingPublication, racingRead] = await Promise.all([
    fixture.call(`/api/v1/admin/entries/${string(object(other.body).id)}/publish`, {
      ctx: { waitUntil: (promise) => void publishing.push(promise) },
      json: { expectedRevision: 1 },
      method: "POST",
    }),
    fixture.call("/api/v1/admin/site-builds", {
      ctx: { waitUntil: (promise) => void reading.push(promise) },
    }),
  ]);
  expect(racingPublication.response.status).toBe(200);
  expect(racingRead.response.status).toBe(200);
  expect(publishing).toHaveLength(1);
  expect(reading).toHaveLength(0);
  await Promise.all(publishing);
});

/** Adapts the fixture's in-process Worker call to the shared export reader. */
test("Worker metadata identifies the bundled platform release", async () => {
  const fixture = await workerFixture();
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const result = await fixture.call("/api/v1/openapi.json");
  expect(object(object(result.body).info).version).toBe(manifest.version);
});

test("Worker readiness rejects a D1 database with a pending migration", async () => {
  const fixture = await workerFixture();
  await fixture.local.database
    .prepare("delete from d1_migrations where name = ?")
    .bind("0000_baseline.sql")
    .run();
  const ready = await fixture.call("/health/ready");
  expect(ready.response.status).toBe(503);
  expect(ready.body).toEqual({ status: "not_ready" });
});

test("Worker readiness rejects a D1 database migrated before the baseline", async () => {
  const fixture = await workerFixture();
  await fixture.local.database.batch([
    fixture.local.database.prepare("delete from d1_migrations"),
    fixture.local.database
      .prepare("insert into d1_migrations (id, name) values (1, ?), (2, ?)")
      .bind("0000_exotic_tarantula.sql", "0015_import_credentials.sql"),
  ]);
  const ready = await fixture.call("/health/ready");
  expect(ready.response.status).toBe(503);
  expect(ready.body).toEqual({ status: "not_ready" });
});

test("invalid Worker settings return a sanitized 503 and log only variable names", async () => {
  const logs: Parameters<WorkerOperationalLogger["error"]>[0][] = [];
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
  expect(string(logs[0]?.variables).split(",").sort()).toEqual([
    "DB",
    "LACE_PUBLIC_BASE_URL",
    "MEDIA",
  ]);
  expect(JSON.stringify(logs)).not.toContain("super-secret-value");
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
  expect(() =>
    parseCloudflareSettings({
      ...env,
      LACE_BUILD_SITE_ID: "real-site",
      LACE_BUILD_SITE_LABEL: "Real site",
      LACE_BUILD_SITE_URL: "https://site.test/?preview=secret",
    }),
  ).toThrow(/^Invalid build site configuration: LACE_BUILD_SITE_URL\.$/u);
});

test.each([
  null,
  { id: "real-site", label: "Real site" },
  { id: "real-site", label: "Real site", url: "https://site.pages.dev/" },
])("Worker composition serves current identity %j", async (site) => {
  const fixture = await workerFixture({
    env: site
      ? {
          LACE_BUILD_SITE_ID: site.id,
          LACE_BUILD_SITE_LABEL: site.label,
          ...(site.url ? { LACE_BUILD_SITE_URL: site.url } : {}),
        }
      : {},
  });
  await fixture.signIn();
  const response = await fixture.call("/api/v1/admin/build-site");
  expect(response.response.status).toBe(200);
  expect(response.body).toEqual({ site });
});

test("Worker identity trusts only its ingress and ignores arbitrary provider/forwarding headers", async () => {
  const fixture = await workerFixture();
  const make = (ip: string) =>
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

test("Worker API docs flag validates exact string booleans without disclosing values", async () => {
  const env = {
    DB: fakeDatabase,
    MEDIA: fakeBucket,
    LACE_AUTH_SECRET: secret,
    LACE_PUBLIC_BASE_URL: origin,
  };
  expect(parseCloudflareSettings(env).apiDocsEnabled).toBe(false);
  for (const value of ["true", "false"])
    expect(parseCloudflareSettings({ ...env, LACE_API_DOCS_ENABLED: value }).apiDocsEnabled).toBe(
      value === "true",
    );
  for (const value of ["", "1", "TRUE", true, " secret-docs-value "]) {
    expect(() => parseCloudflareSettings({ ...env, LACE_API_DOCS_ENABLED: value })).toThrow(
      "Invalid Cloudflare environment: LACE_API_DOCS_ENABLED.",
    );
    const logs: Parameters<WorkerOperationalLogger["error"]>[0][] = [];
    const worker = createCloudflareWorker({
      config,
      operationalLogger: { error: (entry) => logs.push(entry) },
    });
    const response = await worker.fetch(
      new Request(`${origin}/api/docs`),
      {
        ...env,
        LACE_API_DOCS_ENABLED: value,
      },
      { waitUntil() {} },
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(logs)).toContain("LACE_API_DOCS_ENABLED");
    expect(JSON.stringify(logs)).not.toContain("secret-docs-value");
    expect(await response.text()).not.toContain("LACE_API_DOCS_ENABLED");
  }
});

test.each([undefined, "false", "true"])(
  "Worker API docs route precedes assets with flag %j",
  async (flag) => {
    const assets = vi.fn(async () => new Response("asset-fallback"));
    const fixture = await workerFixture({
      env: { LACE_API_DOCS_ENABLED: flag, ASSETS: { fetch: assets } },
    });
    const result = await fixture.call("/api/docs");
    expect(result.response.status).toBe(flag === "true" ? 200 : 404);
    expect(result.response.headers.get("x-request-id")).toBeTruthy();
    expect(assets).not.toHaveBeenCalled();
    expect((await fixture.call("/api/v1/openapi.json")).response.status).toBe(200);
  },
);

test("Worker MCP flag shares exact parsing and sanitized 503 diagnostics", async () => {
  const env = {
    DB: fakeDatabase,
    MEDIA: fakeBucket,
    LACE_AUTH_SECRET: secret,
    LACE_PUBLIC_BASE_URL: origin,
  };
  expect(parseCloudflareSettings(env).mcpEnabled).toBe(false);
  for (const value of ["true", "false"])
    expect(parseCloudflareSettings({ ...env, LACE_MCP_ENABLED: value }).mcpEnabled).toBe(
      value === "true",
    );
  for (const value of ["", "1", "TRUE", true, " private-value "]) {
    expect(() => parseCloudflareSettings({ ...env, LACE_MCP_ENABLED: value })).toThrow(
      "Invalid Cloudflare environment: LACE_MCP_ENABLED.",
    );
    const logs: Parameters<WorkerOperationalLogger["error"]>[0][] = [];
    const worker = createCloudflareWorker({
      config,
      operationalLogger: { error: (event) => logs.push(event) },
    });
    const response = await worker.fetch(
      new Request(`${origin}/mcp`),
      {
        ...env,
        LACE_MCP_ENABLED: value,
      },
      { waitUntil() {} },
    );
    expect(response.status).toBe(503);
    expect(JSON.stringify(logs)).toContain("LACE_MCP_ENABLED");
    expect(JSON.stringify(logs)).not.toContain("private-value");
    expect(await response.text()).not.toContain("LACE_MCP_ENABLED");
  }
});
