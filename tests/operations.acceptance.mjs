import { expect, test, vi } from "vitest";
import { openProductRuntime } from "./support/cross-runtime-fixture.mjs";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { apiJourney } from "../scripts/cross-runtime-api.mjs";
import { astroJourney } from "../scripts/cross-runtime-astro.mjs";
import { createServer } from "node:http";
import { createBuilderHandler } from "../apps/builder/dist/index.js";
import { node, cloudflare } from "./support/operational-platforms.mjs";
const { NodeBuilderSiteBuildTrigger } = node;
const { DeployHookSiteBuildTrigger, PagesDeploymentStatusReader } = cloudflare;

let evidenceDirectory = process.env.LACE_34C_EVIDENCE;
if (!evidenceDirectory && process.env.LACE_34C_PACKED_ROOT) {
  await mkdir(resolve(".lace-acceptance"), { recursive: true });
  evidenceDirectory = await mkdtemp(resolve(".lace-acceptance/step-34c-packed-results-"));
}
const hash = (value) => createHash("sha256").update(value).digest("hex");

test("34C rotated builder, hook and Pages credentials reject old values and recover", async () => {
  const oldSecret = "old-builder-local-secret-34c-long-enough";
  const replacement = "new-builder-local-secret-34c-long-enough";
  let handler = createBuilderHandler({
    secret: oldSecret,
    build: async () => ({ status: "succeeded" }),
  });
  const server = createServer((request, response) => handler(request, response));
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  try {
    const baseUrl = new URL(`http://127.0.0.1:${server.address().port}/`);
    const build = { buildId: "rotation-34c", targetVersion: 5 };
    const old = new NodeBuilderSiteBuildTrigger({ baseUrl, secret: oldSecret });
    expect(await old.trigger(build)).toEqual({ status: "succeeded" });
    handler = createBuilderHandler({
      secret: replacement,
      build: async () => ({ status: "succeeded" }),
    });
    expect((await old.trigger(build)).status).toBe("failed");
    expect(
      await new NodeBuilderSiteBuildTrigger({ baseUrl, secret: replacement }).trigger(build),
    ).toEqual({ status: "succeeded" });
    let hook = "old-hook";
    const controlledHook = async (url) =>
      url.pathname.endsWith(hook)
        ? Response.json({ success: true, result: { id: "deployment-34c" } })
        : new Response(null, { status: 401 });
    const hookAdapter = (key) =>
      new DeployHookSiteBuildTrigger({
        url: new URL(`https://hooks.test/${key}`),
        fetch: controlledHook,
      });
    expect((await hookAdapter(hook).trigger(build)).status).toBe("accepted");
    hook = "replacement-hook";
    expect((await hookAdapter("old-hook").trigger(build)).status).toBe("failed");
    expect((await hookAdapter(hook).trigger(build)).status).toBe("accepted");
    let token = "old-pages-local-token";
    const controlledPages = async (_url, init) =>
      init.headers.authorization === `Bearer ${token}`
        ? Response.json({
            success: true,
            result: { id: "deployment-34c", latest_stage: { name: "deploy", status: "success" } },
          })
        : new Response(null, { status: 401 });
    const reader = (apiToken) =>
      new PagesDeploymentStatusReader({
        accountId: "a".repeat(32),
        projectName: "local-34c",
        apiToken,
        fetch: controlledPages,
      });
    expect((await reader(token).read("deployment-34c")).outcome).toBe("succeeded");
    token = "replacement-pages-local-token";
    expect((await reader("old-pages-local-token").read("deployment-34c")).outcome).not.toBe(
      "succeeded",
    );
    expect((await reader(token).read("deployment-34c")).outcome).toBe("succeeded");
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
});
const tables = [
  "content_models",
  "content_entries",
  "content_snapshots",
  "content_blocks",
  "published_routes",
  "media",
  "content_media_references",
  "published_state",
  "user",
  "account",
  "installation_state",
];
async function rows(f, table) {
  const query = `select * from ${table}`;
  return f.kind === "node"
    ? f.runtime.database.connection.prepare(query).all()
    : (await f.runtime.settings.database.prepare(query).all()).results;
}
async function fingerprints(f) {
  const values = {};
  for (const table of tables) {
    const data = (await rows(f, table))
      .map((row) => JSON.stringify(Object.fromEntries(Object.entries(row).sort())))
      .sort();
    values[table] = { count: data.length, hash: hash(JSON.stringify(data)) };
  }
  return values;
}
async function objectHashes(f) {
  const storage = f.runtime.deletionDispatcher.options.storage;
  const result = {};
  for (const item of await rows(f, "media")) {
    const body = await storage.get(item.storage_key);
    if (body === null) throw new Error("Restore verification: referenced object missing");
    const chunks = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    result[item.id] = hash(Buffer.concat(chunks));
  }
  return result;
}
async function verifyObjects(f, expected) {
  const actual = await objectHashes(f);
  if (JSON.stringify(actual) !== JSON.stringify(expected))
    throw new Error("Restore verification: object hashes differ");
}

for (const kind of ["node", "worker"]) {
  test(`34C ${kind}: health, migration failure, release identity and safe structured logs`, async () => {
    const logs = [];
    const f = await openProductRuntime(kind, { logger: { log: (entry) => logs.push(entry) } });
    try {
      const live = await f.call("/health/live");
      expect(live.status).toBe(200);
      expect(await live.json()).toEqual({ status: "live" });
      const ready = await f.call("/health/ready");
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({ status: "ready" });
      const status = await f.call("/api/v1/admin/settings/status", { cookie: f.cookies.admin });
      expect(await status.json()).toMatchObject({ engineVersion: "0.1.0-alpha.4", ready: true });
      const record = logs.find((entry) => entry.requestId === status.headers.get("x-request-id"));
      expect(record).toMatchObject({
        method: "GET",
        path: "/api/v1/admin/settings/status",
        status: 200,
      });
      expect(record.actorId).toBeTruthy();
      expect(record.durationMs).toBeGreaterThanOrEqual(0);
      expect(JSON.stringify(logs)).not.toContain(f.cookies.admin);
      if (kind === "node")
        f.runtime.database.connection.prepare("delete from __drizzle_migrations").run();
      else await f.runtime.settings.database.prepare("delete from d1_migrations").run();
      const failed = await f.call("/health/ready");
      expect(failed.status).toBe(503);
      expect(await failed.json()).toEqual({ status: "not_ready" });
      expect((await f.call("/health/live")).status).toBe(200);
      if (kind === "node") f.runtime.database.connection.close();
      else await f.runtime.settings.database.prepare("drop table d1_migrations").run();
      expect((await f.call("/health/ready")).status).toBe(503);
      expect((await f.call("/health/live")).status).toBe(200);
    } finally {
      await f.close();
    }
  });
}

for (const kind of ["node", "worker"]) {
  test(`34C ${kind}: coordinated restore, missing/corrupt media and credential rotation`, async () => {
    const root = await mkdtemp(join(tmpdir(), `lace-34c-drill-${kind}-`));
    const operational = [];
    const errors = vi.spyOn(console, "error").mockImplementation((entry) => {
      if (typeof entry === "string" && entry.startsWith("{")) operational.push(JSON.parse(entry));
    });
    const f = await openProductRuntime(kind, {
      operations: true,
      operationalLogger: { error: (entry) => operational.push(entry) },
    });
    let restored;
    try {
      const seed = await apiJourney(f);
      await f.settle();
      const failures = operational.filter((entry) => entry.component === "site-build");
      expect(failures.length).toBeGreaterThan(0);
      for (const entry of failures) {
        expect(entry).toEqual({
          component: "site-build",
          buildId: expect.any(String),
          reason: "build_failed",
        });
      }
      expect(JSON.stringify(operational)).not.toContain(seed.token);
      const metadata = await fingerprints(f);
      const objects = await objectHashes(f);
      const started = Date.now();
      const snapshotPoint = new Date().toISOString();
      const snapshot = join(root, "backup");
      await f.backup(snapshot);
      const durationMs = Date.now() - started;
      expect(await fingerprints(f)).toEqual(metadata);
      await verifyObjects(f, objects);
      for (const file of ["lace.config.ts", "package.json", "pnpm-lock.yaml"])
        expect(hash(await readFile(join(snapshot, "project", file)))).toBe(
          hash(await readFile(file)),
        );
      if (process.env.LACE_34C_PACKED_ROOT)
        for (const file of [
          "lace.config.ts",
          "package.json",
          "pnpm-lock.yaml",
          ".lace/manifest.json",
        ])
          expect(hash(await readFile(join(snapshot, "consumer", file)))).toBe(
            hash(await readFile(join(process.env.LACE_34C_PACKED_ROOT, file))),
          );
      // A new origin, SQLite/D1/R2 state and MinIO container keep restored work isolated.
      restored = await openProductRuntime(kind, {
        operations: true,
        backup: snapshot,
        authSecret: "isolated-restored-auth-secret-34c-long-enough",
      });
      expect(restored.origin).not.toBe(f.origin);
      expect(await fingerprints(restored)).toEqual(metadata);
      await verifyObjects(restored, objects);
      if (kind === "node") {
        expect(await restored.rotateStorageCredentials()).toEqual({
          oldDenied: true,
          newWorks: true,
        });
        await verifyObjects(restored, objects);
      }
      expect((await restored.call("/api/v1/setup/state")).status).toBe(200);
      const mediaResponse = await restored.call(`/api/v1/public/media/${seed.cover}`);
      expect(mediaResponse.status).toBe(200);
      expect(hash(Buffer.from(await mediaResponse.arrayBuffer()))).toBe(objects[seed.cover]);
      await astroJourney(restored, seed);
      const record = await restored.runtime.repository.loadMedia(seed.cover);
      const storage = restored.runtime.deletionDispatcher.options.storage;
      const originalBytes = [];
      for await (const chunk of await storage.get(record.storageKey))
        originalBytes.push(Buffer.from(chunk));
      await storage.delete(record.storageKey);
      await expect(verifyObjects(restored, objects)).rejects.toThrow("missing");
      await storage.put({
        key: record.storageKey,
        contentType: "image/png",
        body: [Buffer.from("corrupt")],
      });
      await expect(verifyObjects(restored, objects)).rejects.toThrow("hashes differ");
      await storage.put({ key: record.storageKey, contentType: "image/png", body: originalBytes });
      await verifyObjects(restored, objects);
      // Old browser signatures cannot authorize after a secret replacement.
      const staleCookie = restored.cookies.admin;
      await restored.restart({ authSecret: "replacement-auth-secret-34c-long-enough-for-auth" });
      expect(
        (await restored.call("/api/v1/admin/settings/status", { cookie: staleCookie })).status,
      ).toBe(403);
      const cookie = await restored.login("admin");
      expect((await restored.call("/api/v1/admin/settings/status", { cookie })).status).toBe(200);
      const issued = await restored.call("/api/v1/admin/api-tokens", {
        cookie,
        method: "POST",
        json: { name: "34c-replacement" },
      });
      expect(issued.status).toBe(201);
      const replacement = await issued.json();
      const tokens = await (await restored.call("/api/v1/admin/api-tokens", { cookie })).json();
      const old = tokens.items.find((item) => item.name === "34a-build");
      expect(old).toBeDefined();
      expect(
        (await restored.call(`/api/v1/admin/api-tokens/${old.id}`, { cookie, method: "DELETE" }))
          .status,
      ).toBe(200);
      expect(
        (
          await restored.call("/api/v1/public/build-export", {
            headers: { authorization: `Bearer ${seed.token}` },
          })
        ).status,
      ).toBe(403);
      expect(
        (
          await restored.call("/api/v1/public/build-export", {
            headers: { authorization: `Bearer ${replacement.token}` },
          })
        ).status,
      ).toBe(200);
      await astroJourney(restored, { ...seed, token: replacement.token });
      expect(await fingerprints(restored)).toEqual(metadata);
      // The original installation continues to authorize its own credentials and data.
      expect(
        (await f.call("/api/v1/admin/settings/status", { cookie: f.cookies.admin })).status,
      ).toBe(200);
      expect(
        (
          await f.call("/api/v1/public/build-export", {
            headers: { authorization: `Bearer ${seed.token}` },
          })
        ).status,
      ).toBe(200);
      expect(await fingerprints(f)).toEqual(metadata);
      await verifyObjects(f, objects);
      if (evidenceDirectory)
        await writeFile(
          join(evidenceDirectory, `${kind}-restore.json`),
          JSON.stringify(
            {
              kind,
              packedPlatformArtifacts: Boolean(process.env.LACE_34C_PACKED_ROOT),
              consumerOwnershipCaptured: Boolean(process.env.LACE_34C_PACKED_ROOT),
              simulatorVersion:
                kind === "worker"
                  ? JSON.parse(
                      await readFile(
                        "packages/platform-cloudflare/node_modules/miniflare/package.json",
                        "utf8",
                      ),
                    ).version
                  : undefined,
              snapshotPoint,
              durationMs,
              metadata,
              objects,
              restoredSignIn: true,
              staticRebuilds: 2,
              missingObjectRejected: true,
              corruptObjectRejected: true,
              authRotation: true,
              buildTokenRotation: true,
              originalResumed: true,
              scope:
                kind === "worker"
                  ? "local stopped Miniflare persistence snapshot only"
                  : "SQLite backup API and MinIO object API",
            },
            null,
            2,
          ) + "\n",
        );
    } finally {
      errors.mockRestore();
      if (restored) await restored.close();
      await f.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
