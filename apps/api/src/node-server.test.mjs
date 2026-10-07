import { expect, test } from "vitest";
import { createServer } from "node:http";
import { connect } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "@lacecms/application";
import { actorId, unixMilliseconds } from "@lacecms/domain";
import {
  anonymousActorResolver,
  createNodeRuntime,
  migrateNodeDatabase,
  parseNodeRuntimeSettings,
} from "@lacecms/platform-node";
import { createTestActorResolver } from "@lacecms/platform-node/test";
import {
  createNodeDevelopmentGateway,
  proxyNodeDevelopmentUpgrade,
  startNodeServer,
} from "../dist/index.js";
import { loadProjectConfig } from "../dist/project-config.js";

const admin = { id: actorId("integration-admin"), role: "admin" };
const minioEnvironment = Object.freeze({
  LACE_MINIO_ACCESS_KEY: "test-access-key",
  LACE_MINIO_BUCKET: "lace-media",
  LACE_MINIO_ENDPOINT: "http://minio.test:9000",
  LACE_MINIO_REGION: "us-east-1",
  LACE_MINIO_SECRET_KEY: "test-secret-key",
  LACE_MINIO_TIMEOUT_MS: "1000",
});

async function fixture({ actors = createTestActorResolver(admin) } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "lace-node-api-"));
  const databasePath = join(directory, "lace.sqlite");
  migrateNodeDatabase(databasePath);
  const config = await loadProjectConfig();
  const settings = {
    ...parseNodeRuntimeSettings({
      ...minioEnvironment,
      LACE_DATABASE_PATH: databasePath,
      LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
      LACE_PUBLIC_BASE_URL: "https://public.lace.test/",
    }),
    port: 0,
  };
  const deletedKeys = [];
  const storage = {
    createReadUrl: async () => "memory-object://media",
    delete: async (key) => {
      deletedKeys.push(key);
    },
    get: async () => null,
    put: async (input) => ({
      contentType: input.contentType,
      key: input.key,
      size: 0,
    }),
  };
  const runtime = createNodeRuntime({
    actors,
    config,
    settings,
    storage,
  });
  const prepared = await prepareConfigurationSynchronization({
    models: config.runtime.content,
    state: runtime.repository,
  });
  let value = 1;
  await applyPreparedConfigurationSynchronization({
    clock: { now: () => unixMilliseconds(100) },
    ids: { next: () => `sync-${++value}` },
    models: config.runtime.content,
    prepared,
    target: runtime.repository,
  });
  const server = await startNodeServer({ runtime, settings });
  return {
    close: async () => {
      await server.close();
      runtime.close();
      await rm(directory, { force: true, recursive: true });
    },
    runtime,
    server,
    storage: { deletedKeys },
  };
}

async function json(server, path, init) {
  const response = await fetch(new URL(path, server.url), init);
  return {
    body: response.status === 204 || response.status === 304 ? undefined : await response.json(),
    response,
  };
}

test("serves the seeded lifecycle through an actual Node listener", async () => {
  const value = await fixture();
  try {
    const models = await json(value.server, "/api/v1/admin/content-models?config=ignored.ts");
    expect(models.response.status).toBe(200);
    expect(models.body.items.map((model) => model.key)).toEqual([
      "about",
      "home",
      "notes",
      "posts",
    ]);
    const created = await json(value.server, "/api/v1/admin/models/posts/entries", {
      body: JSON.stringify({
        blocks: [],
        fields: { publishedAt: "2026-09-24" },
        slug: "first",
        title: "Initial",
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    expect(created.response.status).toBe(201);
    const entryId = created.body.id;
    const saved = await json(value.server, `/api/v1/admin/entries/${entryId}/draft`, {
      body: JSON.stringify({
        blocks: [],
        expectedRevision: 1,
        fields: { publishedAt: "2026-09-24" },
        slug: "first",
        title: "Published title",
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(saved.body.draft.revision).toBe(2);
    expect(
      (
        await json(value.server, `/api/v1/admin/entries/${entryId}/publish`, {
          body: JSON.stringify({ expectedRevision: 2 }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      ).response.status,
    ).toBe(200);
    const publicBeforeDraftChange = await json(
      value.server,
      "/api/v1/public/collections/posts/first",
    );
    expect(publicBeforeDraftChange).toMatchObject({
      body: { entry: { draft: { title: "Published title" } } },
      response: { status: 200 },
    });
    await json(value.server, `/api/v1/admin/entries/${entryId}/draft`, {
      body: JSON.stringify({
        blocks: [],
        expectedRevision: 2,
        fields: { publishedAt: "2026-09-24" },
        slug: "first",
        title: "Draft-only title",
      }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    });
    expect(
      (await json(value.server, "/api/v1/public/collections/posts/first")).body.entry.draft.title,
    ).toBe("Published title");
    const buildToken = await value.runtime.security.createBuildToken({
      name: "integration-build",
      now: unixMilliseconds(Date.now()),
    });
    const buildExport = await json(value.server, "/api/v1/public/build-export", {
      headers: { authorization: `Bearer ${buildToken.token}` },
    });
    const etag = buildExport.response.headers.get("etag");
    expect(etag).not.toBeNull();
    expect(
      (
        await json(value.server, "/api/v1/public/build-export", {
          headers: { authorization: `Bearer ${buildToken.token}`, "if-none-match": etag },
        })
      ).response.status,
    ).toBe(304);
    const weakTag = `W/${etag}`;
    const headers = { authorization: `Bearer ${buildToken.token}`, "if-none-match": weakTag };
    const unchanged = await json(value.server, "/api/v1/public/build-export", { headers });
    expect(unchanged.response.status).toBe(304);
    expect(unchanged.response.headers.get("etag")).toBe(etag);
    expect(unchanged.body).toBeUndefined();
    expect(
      (
        await json(value.server, "/api/v1/public/build-export", {
          headers: { "if-none-match": weakTag },
        })
      ).response.status,
    ).toBe(403);
    for (const tag of ["*", 'W/"bad"', '"1", "2"', '"9007199254740992"'])
      expect(
        (
          await json(value.server, "/api/v1/public/build-export", {
            headers: { ...headers, "if-none-match": tag },
          })
        ).response.status,
      ).toBe(422);
    const weakMutation = await json(value.server, `/api/v1/admin/entries/${entryId}/publish`, {
      body: JSON.stringify({ expectedRevision: 3 }),
      headers: { "content-type": "application/json", "if-match": 'W/"3"' },
      method: "POST",
    });
    expect(weakMutation.response.status).toBe(422);
    expect(
      (
        await json(value.server, `/api/v1/admin/entries/${entryId}/publish`, {
          body: JSON.stringify({ expectedRevision: 3 }),
          headers: { "content-type": "application/json" },
          method: "POST",
        })
      ).response.status,
    ).toBe(200);
    const changed = await json(value.server, "/api/v1/public/build-export", { headers });
    expect(changed.response.status).toBe(200);
    expect(changed.body.version).toBe(buildExport.body.version + 1);
    expect(changed.response.headers.get("etag")).toBe(`"${changed.body.version}"`);
    expect(
      changed.body.entries.find(({ entry }) => entry.id === entryId).entry.published.title,
    ).toBe("Draft-only title");
    expect((await json(value.server, "/health/ready")).response.status).toBe(200);
  } finally {
    await value.close();
  }
});

test("keeps production composition anonymous even when a request asks for a test actor", async () => {
  const value = await fixture({ actors: anonymousActorResolver });
  try {
    expect(
      await json(value.server, "/api/v1/admin/content-models", {
        headers: { "x-lace-test-actor": "admin" },
      }),
    ).toMatchObject({
      body: { error: { code: "AUTHORIZATION_DENIED" } },
      response: { status: 403 },
    });
  } finally {
    await value.close();
  }
});

test("processes queued media deletion outside the HTTP request", async () => {
  const value = await fixture();
  try {
    await value.runtime.repository.createMedia({
      createdAt: unixMilliseconds(1),
      createdBy: admin.id,
      filename: "queued.png",
      height: 1,
      id: "queued-media",
      mimeType: "image/png",
      size: 1,
      storageKey: "media/queued-media",
      width: 1,
    });
    await value.runtime.repository.markForDeletion({
      mediaId: "queued-media",
      requestedAt: unixMilliseconds(2),
      requestedBy: admin,
    });
    await value.runtime.deletionDispatcher.runOnce();
    expect(value.storage.deletedKeys).toEqual(["media/queued-media"]);
    expect(await value.runtime.repository.loadMedia("queued-media")).toBeNull();
  } finally {
    await value.close();
  }
});

test("preflights object storage before binding a Node listener", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-node-preflight-"));
  const databasePath = join(directory, "lace.sqlite");
  migrateNodeDatabase(databasePath);
  const config = await loadProjectConfig();
  const settings = {
    ...parseNodeRuntimeSettings({
      ...minioEnvironment,
      LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
      LACE_DATABASE_PATH: databasePath,
      LACE_PUBLIC_BASE_URL: "https://public.lace.test/",
    }),
    port: 0,
  };
  const runtime = createNodeRuntime({
    config,
    settings,
    storage: {
      assertReady: async () => {
        throw new Error("bucket unavailable");
      },
      createReadUrl: async () => "memory-object://media",
      delete: async () => {},
      get: async () => null,
      put: async (input) => ({ contentType: input.contentType, key: input.key, size: 0 }),
    },
  });
  try {
    await expect(startNodeServer({ runtime, settings })).rejects.toThrow("bucket unavailable");
  } finally {
    runtime.close();
    await rm(directory, { force: true, recursive: true });
  }
});

test("refuses to construct the test actor resolver outside Vitest", () => {
  const original = [...process.argv];
  process.argv.splice(0, process.argv.length, "node", "production.js");
  try {
    expect(() => createTestActorResolver(admin)).toThrow("available only in the Vitest runtime");
  } finally {
    process.argv.splice(0, process.argv.length, ...original);
  }
});

test("routes frontend requests to same-origin development upstreams without proxying API paths", async () => {
  const requests = [];
  const upstream = createServer((request, response) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => {
      requests.push({ body: Buffer.concat(chunks).toString("utf8"), path: request.url });
      response.end("upstream");
    });
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const address = upstream.address();
  const origin = `http://127.0.0.1:${address.port}`;
  const settings = parseNodeRuntimeSettings({
    ...minioEnvironment,
    LACE_ADMIN_DEV_ORIGIN: origin,
    LACE_DATABASE_PATH: "/tmp/lace.sqlite",
    LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
    LACE_PUBLIC_BASE_URL: "https://public.lace.test/",
    LACE_SITE_DEV_ORIGIN: origin,
  });
  const gateway = createNodeDevelopmentGateway(async () => new Response("local"), settings);
  try {
    expect(await (await gateway(new Request("http://lace.test/api/v1/openapi.json"))).text()).toBe(
      "local",
    );
    expect(
      await (await gateway(new Request("http://lace.test/admin/content?view=list"))).text(),
    ).toBe("upstream");
    expect(
      await (
        await gateway(
          new Request("http://lace.test/admin/draft", { body: "draft", method: "POST" }),
        )
      ).text(),
    ).toBe("upstream");
    expect(requests).toEqual([
      { body: "", path: "/admin/content?view=list" },
      { body: "draft", path: "/admin/draft" },
    ]);
    const unavailable = createNodeDevelopmentGateway(async () => new Response("local"), {
      ...settings,
      siteDevOrigin: new URL("http://127.0.0.1:1"),
    });
    expect((await unavailable(new Request("http://lace.test/"))).status).toBe(502);
  } finally {
    await new Promise((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("forwards frontend development upgrades and closes connections on gateway shutdown", async () => {
  const upstream = createServer();
  let upgradeRequests = 0;
  let upgradedSocket;
  upstream.on("upgrade", (request, socket) => {
    upgradeRequests += 1;
    upgradedSocket = socket;
    expect(request.url).toBe("/admin/@vite/client?token=test");
    socket.write(
      "HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n",
    );
  });
  await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  const upstreamAddress = upstream.address();
  const upstreamOrigin = `http://127.0.0.1:${upstreamAddress.port}`;
  const settings = parseNodeRuntimeSettings({
    ...minioEnvironment,
    LACE_ADMIN_DEV_ORIGIN: upstreamOrigin,
    LACE_DATABASE_PATH: "/tmp/lace.sqlite",
    LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
    LACE_PUBLIC_BASE_URL: "https://public.lace.test/",
    LACE_SITE_DEV_ORIGIN: upstreamOrigin,
  });
  const gateway = createServer((request, response) => response.end("local"));
  gateway.on("upgrade", (request, socket, head) =>
    proxyNodeDevelopmentUpgrade(request, socket, head, settings),
  );
  await new Promise((resolve) => gateway.listen(0, "127.0.0.1", resolve));
  const gatewayAddress = gateway.address();
  const client = connect(gatewayAddress.port, "127.0.0.1");
  try {
    const opened = new Promise((resolve, reject) => {
      let response = "";
      client.on("data", (chunk) => {
        response += chunk;
        if (response.includes("\r\n\r\n")) resolve(response);
      });
      client.once("error", reject);
    });
    client.write(
      "GET /admin/@vite/client?token=test HTTP/1.1\r\nHost: lace.test\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: test\r\nSec-WebSocket-Version: 13\r\n\r\n",
    );
    await expect(opened).resolves.toContain("101 Switching Protocols");
    expect(upgradeRequests).toBe(1);
  } finally {
    const clientClosed = new Promise((resolve) => client.once("close", resolve));
    client.destroy();
    await clientClosed;
    upgradedSocket?.destroy();
    gateway.closeAllConnections();
    await new Promise((resolve, reject) =>
      gateway.close((error) => (error ? reject(error) : resolve())),
    );
    await new Promise((resolve, reject) =>
      upstream.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("anonymous browser setup state survives bootstrap and stale clients stay closed", async () => {
  const value = await fixture({ actors: anonymousActorResolver });
  try {
    for (let i = 0; i < 8; i += 1) {
      const state = await json(value.server, "/api/v1/setup/state");
      expect(state.response.status).toBe(200);
      expect(state.response.headers.get("cache-control")).toBe("no-store");
      expect(state.body).toEqual({ setupComplete: false });
    }
    expect((await json(value.server, "/api/auth/get-session")).response.status).toBe(200);
    const setup = await value.runtime.security.createSetupToken();
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: "browser@lace.test",
        password: "correct horse battery staple",
        token: setup.token,
      }),
    };
    expect((await json(value.server, "/api/v1/setup/admin", init)).response.status).toBe(201);
    const login = await json(value.server, "/api/auth/sign-in/email", {
      method: "POST",
      headers: {
        origin: "https://public.lace.test",
        "content-type": "application/json",
        "x-lace-client-address": "forged-transport-identity",
      },
      body: JSON.stringify({
        email: "browser@lace.test",
        password: "correct horse battery staple",
      }),
    });
    expect(login.response.status).toBe(200);
    const cookie = login.response.headers.getSetCookie()[0].split(";")[0];
    const session = await json(value.server, "/api/auth/get-session", { headers: { cookie } });
    expect(session.response.status).toBe(200);
    expect(session.body.user.email).toBe("browser@lace.test");
    expect(session.body.user.role).toBe("admin");

    const stale = await Promise.all([
      json(value.server, "/api/v1/setup/admin", init),
      json(value.server, "/api/v1/setup/admin", init),
    ]);
    expect(stale.map((result) => result.response.status)).toEqual([404, 404]);
    expect((await json(value.server, "/api/v1/setup/state")).body).toEqual({ setupComplete: true });
    expect(await value.runtime.security.listUsers()).toHaveLength(1);
    expect((await json(value.server, "/api/v1/admin/users")).response.status).toBe(403);
  } finally {
    await value.close();
  }
});
