import { afterAll, beforeAll, expect, test } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { crc32, deflateSync } from "node:zlib";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { appDirectory, buildWorkerBundle } from "./worker-bundle-harness.mjs";

const run = promisify(execFile);
const repositoryRoot = join(appDirectory, "..", "..");
const origin = "https://cms.lace.test";
const hook = "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/smoke-hook-secret";
const secret = "smoke-test-auth-secret-that-is-long-enough-for-better-auth";
const password = "correct horse battery staple";
const hookCalls = [];
let built;
let state;
let miniflare;
let setupToken;
let cookie;

/** A structurally valid 3×2 RGB PNG, so upload exercises the Worker image inspector. */
function png() {
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, checksum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(3, 0);
  header.writeUInt32BE(2, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc(2 * (1 + 3 * 3), 7);
  rows[0] = 0;
  rows[10] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function prepare() {
  const { stdout } = await run(
    process.execPath,
    [join(appDirectory, "dist", "cloudflare-local.js"), "prepare", "--persist-to", state],
    { cwd: repositoryRoot },
  );
  return stdout;
}

async function call(path, init = {}) {
  const headers = new Headers(init.headers);
  if (cookie !== undefined) headers.set("cookie", cookie);
  if (init.json !== undefined) headers.set("content-type", "application/json");
  const response = await miniflare.dispatchFetch(`${origin}${path}`, {
    body: init.json === undefined ? init.body : JSON.stringify(init.json),
    headers,
    method: init.method ?? "GET",
  });
  const text = await response.text();
  let body = text;
  try {
    body = text.length === 0 ? undefined : JSON.parse(text);
  } catch {
    // Non-JSON bodies (admin documents) stay as text.
  }
  return { body, response };
}

beforeAll(async () => {
  built = await buildWorkerBundle({
    assets: {
      "assets/app.js": "console.log('lace admin');",
      "index.html": "<!doctype html><title>Lace admin</title>",
    },
  });
  state = await mkdtemp(join(tmpdir(), "lace-worker-smoke-"));
  // The same command operators run, with an isolated persisted state directory.
  await run(
    process.execPath,
    [
      join(repositoryRoot, "scripts", "cloudflare.mjs"),
      "migrate",
      "--local",
      "--persist-to",
      state,
    ],
    { cwd: repositoryRoot },
  );
  const prepared = await prepare();
  expect(prepared).toContain("Synchronization applied.");
  setupToken = prepared.trim().split("\n").at(-1);
  expect(setupToken).toMatch(/^[A-Za-z0-9_-]{40,}$/u);
  miniflare = new Miniflare(
    convertV4MiniflareOptions({
      assets: {
        binding: "ASSETS",
        directory: built.assetsDirectory,
        routerConfig: { has_user_worker: true, invoke_user_worker_ahead_of_assets: true },
      },
      bindings: {
        LACE_AUTH_SECRET: secret,
        LACE_DEPLOY_HOOK_URL: hook,
        LACE_PUBLIC_BASE_URL: `${origin}/`,
      },
      compatibilityDate: built.config.compatibility_date,
      compatibilityFlags: built.config.compatibility_flags,
      d1Databases: { DB: built.config.d1_databases[0].database_id },
      modules: true,
      outboundService: async (request) => {
        hookCalls.push({
          authorization: request.headers.get("authorization"),
          body: await request.text(),
          cookie: request.headers.get("cookie"),
          method: request.method,
          url: request.url,
        });
        return Response.json({
          errors: [],
          messages: [],
          result: { id: "smoke-dep-1" },
          success: true,
        });
      },
      r2Buckets: { MEDIA: "lace-media" },
      resourcePersistencePath: join(state, "v3"),
      script: built.bundle,
    }),
  );
}, 180_000);

afterAll(async () => {
  await miniflare?.dispose();
  await built?.dispose();
  if (state !== undefined) await rm(state, { force: true, recursive: true });
});

test("Worker bundle smoke: health, auth, R2 upload, publish, deploy hook, export, admin", async () => {
  expect((await call("/health/live")).body).toEqual({ status: "live" });
  expect((await call("/health/ready")).body).toEqual({ status: "ready" });

  for (let i = 0; i < 8; i += 1) {
    const state = await call("/api/v1/setup/state");
    expect(state.body).toEqual({ setupComplete: false });
    expect(state.response.headers.get("cache-control")).toBe("no-store");
  }
  const setup = await call("/api/v1/setup/admin", {
    json: { email: "admin@lace.test", password, token: setupToken },
    method: "POST",
  });
  expect(setup.response.status).toBe(201);
  expect((await call("/api/v1/setup/state")).body).toEqual({ setupComplete: true });
  const stale = await Promise.all(
    [1, 2].map(() =>
      call("/api/v1/setup/admin", {
        json: { email: "other@lace.test", password, token: setupToken },
        method: "POST",
      }),
    ),
  );
  expect(stale.map((result) => result.response.status)).toEqual([404, 404]);
  const session = await call("/api/auth/sign-in/email", {
    headers: { origin },
    json: { email: "admin@lace.test", password },
    method: "POST",
  });
  expect(session.response.status).toBe(200);
  cookie = session.response.headers.getSetCookie()[0].split(";")[0];

  const form = new FormData();
  form.append("file", new Blob([png()], { type: "image/png" }), "cover.png");
  // Miniflare bundles its own fetch, so the multipart body is serialized up front.
  const multipart = new Request("http://multipart.invalid/", { body: form, method: "POST" });
  const uploaded = await call("/api/v1/admin/media", {
    body: await multipart.arrayBuffer(),
    headers: { "content-type": multipart.headers.get("content-type") },
    method: "POST",
  });
  expect(uploaded.response.status).toBe(201);
  expect(uploaded.body).toMatchObject({ height: 2, mimeType: "image/png", width: 3 });
  const bucket = await miniflare.getR2Bucket("MEDIA");
  expect(await bucket.head(`media/${uploaded.body.id}`)).not.toBeNull();

  const created = await call("/api/v1/admin/models/posts/entries", {
    json: { blocks: [], fields: { publishedAt: "2026-09-28" }, slug: "smoke", title: "Smoke" },
    method: "POST",
  });
  expect(created.response.status).toBe(201);
  const published = await call(`/api/v1/admin/entries/${created.body.id}/publish`, {
    json: { expectedRevision: 1 },
    method: "POST",
  });
  expect(published.response.status).toBe(200);

  // After the 5-second debounce, the scheduled handler (or the best-effort
  // post-commit pass) dispatches the build to the deploy hook exactly once.
  await new Promise((resolve) => setTimeout(resolve, 5_600));
  const worker = await miniflare.getWorker();
  await worker.scheduled({ cron: "* * * * *" });
  let build;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    build = (await call("/api/v1/admin/site-builds")).body.items[0];
    if (build !== undefined && !["pending", "running"].includes(build.status)) break;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  expect(build).toMatchObject({ providerBuildId: "smoke-dep-1", status: "accepted" });
  await worker.scheduled({ cron: "* * * * *" });
  expect(hookCalls).toEqual([
    { authorization: null, body: "", cookie: null, method: "POST", url: hook },
  ]);

  const unauthenticatedExport = await miniflare.dispatchFetch(
    `${origin}/api/v1/public/build-export`,
  );
  expect(unauthenticatedExport.status).toBeGreaterThanOrEqual(401);
  expect(unauthenticatedExport.status).toBeLessThanOrEqual(403);
  const token = await call("/api/v1/admin/api-tokens", { json: { name: "smoke" }, method: "POST" });
  expect(token.response.status).toBe(201);
  const exported = await miniflare.dispatchFetch(`${origin}/api/v1/public/build-export`, {
    headers: { authorization: `Bearer ${token.body.token}` },
  });
  expect(exported.status).toBe(200);
  const exportBody = await exported.json();
  expect(exportBody.version).toBeGreaterThanOrEqual(1);
  expect(exportBody.entries.map((entry) => entry.path)).toContain("/blog/smoke");

  const clientRoute = await call("/admin/content/posts");
  expect(clientRoute.response.status).toBe(200);
  expect(clientRoute.body).toContain("<title>Lace admin</title>");
  const script = await call("/admin/assets/app.js");
  expect(script.body).toBe("console.log('lace admin');");
  expect((await call("/admin/missing.js")).response.status).toBe(404);
  expect((await call("/api/v1/unknown")).body).toMatchObject({ error: { code: "NOT_FOUND" } });

  // Setup is closed and state persists once the Worker releases the local database.
  await miniflare.dispose();
  miniflare = undefined;
  const rerun = await prepare();
  expect(rerun).toContain("No synchronization needed.");
  expect(rerun).toContain("First-admin setup is complete.");
}, 120_000);
