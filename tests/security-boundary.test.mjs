import { afterEach, expect, test, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import config from "../lace.config.ts";
import { assertSecretFree } from "../scripts/consumer-security.mjs";
import { png } from "./support/cross-runtime-fixture.mjs";
import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "../packages/application/dist/index.js";
import {
  createNodeRuntime,
  migrateNodeDatabase,
  parseNodeRuntimeSettings,
} from "../packages/platform-node/dist/index.js";
import { createCloudflareWorker } from "../packages/platform-cloudflare/dist/index.js";
import { openLocalCloudflare } from "../packages/platform-cloudflare/src/d1-test-harness.mjs";

const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
const origin = "https://security.lace.test";
const password = "Security-local-password-34B!";

async function open(kind, options = {}) {
  const base = options.origin ?? origin;
  const production = options.production ?? true;
  let runtime, call, rows, query, sql;
  if (kind === "node") {
    vi.stubEnv("NODE_ENV", production ? "production" : "development");
    const directory = await mkdtemp(join(tmpdir(), "lace-34b-auth-"));
    cleanups.push(() => rm(directory, { recursive: true, force: true }));
    const path = join(directory, "lace.sqlite");
    migrateNodeDatabase(path);
    runtime = createNodeRuntime({
      config,
      logger: options.logger ?? { log() {} },
      storage: {
        async put(input) {
          if (options.storageFault) throw new Error(options.storageFault);
          let size = 0;
          for await (const part of input.body) size += part.length;
          return { key: input.key, contentType: input.contentType, size };
        },
        get() {},
        delete() {},
        createReadUrl() {},
      },
      settings: parseNodeRuntimeSettings({
        LACE_DATABASE_PATH: path,
        LACE_AUTH_SECRET: options.secret ?? "local-security-auth-secret-at-least-32-characters",
        LACE_PUBLIC_BASE_URL: base,
        LACE_MINIO_ACCESS_KEY: "local",
        LACE_MINIO_SECRET_KEY: "local",
        LACE_MINIO_BUCKET: "lace-local",
        LACE_MINIO_ENDPOINT: "http://localhost:9000",
        LACE_MINIO_REGION: "us-east-1",
        LACE_MINIO_TIMEOUT_MS: "1000",
        LACE_TRUSTED_PROXY_CIDRS: "10.0.0.0/8",
      }),
    });
    cleanups.push(() => runtime.close());
    call = (request, ip) => {
      runtime.setRequestPeer(request, ip);
      return runtime.app.fetch(request);
    };
    query = (statement) => runtime.database.connection.prepare(statement).all();
    sql = (statement) => runtime.database.connection.prepare(statement).run();
    rows = () => query("select * from rate_limit_buckets");
  } else {
    const local = await openLocalCloudflare();
    cleanups.push(local.dispose);
    const pending = [];
    const worker = createCloudflareWorker({
      config,
      logger: options.logger ?? { log() {} },
      postCommitBuildDelayMs: 0,
    });
    cleanups.push(async () => Promise.all(pending));
    const env = {
      DB: local.database,
      MEDIA: options.storageFault
        ? new Proxy(local.bucket, {
            get(target, key) {
              if (key === "put")
                return async () => {
                  throw new Error(options.storageFault);
                };
              const value = Reflect.get(target, key);
              return typeof value === "function" ? value.bind(target) : value;
            },
          })
        : local.bucket,
      LACE_ENVIRONMENT: production ? "production" : "development",
      LACE_AUTH_SECRET: options.secret ?? "local-security-auth-secret-at-least-32-characters",
      LACE_PUBLIC_BASE_URL: base,
    };
    runtime = worker.runtime(env);
    call = (request, ip) => {
      request.headers.set("cf-connecting-ip", ip);
      return worker.fetch(request, env, {
        waitUntil(promise) {
          pending.push(promise);
        },
      });
    };
    query = async (statement) => (await local.database.prepare(statement).all()).results;
    sql = (statement) => local.database.prepare(statement).run();
    rows = () => query("select * from rate_limit_buckets");
  }
  const prepared = await prepareConfigurationSynchronization({
    models: config.runtime.content,
    state: runtime.repository,
  });
  let id = 0;
  await applyPreparedConfigurationSynchronization({
    clock: { now: () => 100 },
    ids: { next: () => `sync-${++id}` },
    models: config.runtime.content,
    prepared,
    target: runtime.repository,
  });
  return { runtime, call, rows, query, sql };
}

for (const kind of ["node", "cloudflare"]) {
  test(`${kind}: spoofed auth identity cannot reset limits and clients stay independent`, async () => {
    const fixture = await open(kind);
    const invoke = (peer, suffix) =>
      fixture.call(
        new Request(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin,
            "x-forwarded-for": `192.0.2.${suffix}`,
            "x-lace-client-address": `192.0.2.${suffix}`,
          },
          body: JSON.stringify({ email: "absent@lace.test", password }),
        }),
        peer,
      );
    let blocked;
    for (let index = 1; index <= 11; index++) blocked = await invoke("198.51.100.1", index);
    expect(blocked.status).toBe(429);
    expect(
      Number(blocked.headers.get("retry-after") ?? blocked.headers.get("x-retry-after")),
    ).toBeGreaterThan(0);
    expect((await invoke("198.51.100.2", 1)).status).not.toBe(429);
    const persisted = JSON.stringify(await fixture.rows());
    expect(persisted).not.toContain("198.51.100.");
    expect(persisted).not.toContain("absent@lace.test");
  }, 30000);

  test(`${kind}: validated actors have separate token limits despite shared IP`, async () => {
    const fixture = await open(kind);
    const client = kind === "node" ? "198.51.100.3" : "198.51.100.4";
    const setup = await fixture.runtime.security.createSetupToken();
    const first = await fixture.runtime.security.bootstrap({
      email: "first@lace.test",
      password,
      token: setup.token,
    });
    const second = await fixture.runtime.security.createUser({
      email: "second@lace.test",
      password,
      role: "admin",
    });
    async function session(email) {
      const result = await fixture.call(
        new Request(`${origin}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        }),
        client,
      );
      expect(result.status).toBe(200);
      return result.headers.getSetCookie()[0].split(";")[0];
    }
    const cookies = [await session(first.user.email), await session(second.email)];
    async function issue(cookie, index) {
      return fixture.call(
        new Request(`${origin}/api/v1/admin/api-tokens`, {
          method: "POST",
          headers: {
            cookie,
            origin,
            "content-type": "application/json",
            "x-forwarded-for": `192.0.2.${index}`,
          },
          body: JSON.stringify({ name: `local-${index}` }),
        }),
        client,
      );
    }
    for (let index = 1; index <= 20; index++)
      expect((await issue(cookies[0], index)).status).toBe(201);
    expect((await issue(cookies[0], 21)).status).toBe(429);
    expect((await issue(cookies[1], 1)).status).toBe(201);
    async function upload(cookie, index) {
      return fixture.call(
        new Request(`${origin}/api/v1/admin/media`, {
          method: "POST",
          headers: {
            cookie,
            origin,
            "content-type": "application/json",
            "x-forwarded-for": `192.0.2.${index}`,
          },
          body: "{}",
        }),
        client,
      );
    }
    for (let index = 1; index <= 30; index++)
      expect((await upload(cookies[0], index)).status).not.toBe(429);
    expect((await upload(cookies[0], 31)).status).toBe(429);
    expect((await upload(cookies[1], 1)).status).not.toBe(429);
  }, 30000);
}

for (const kind of ["node", "cloudflare"]) {
  test(`${kind}: foreign-origin cookie mutation is denied without changing users`, async () => {
    const fixture = await open(kind);
    const setup = await fixture.runtime.security.createSetupToken();
    await fixture.runtime.security.bootstrap({
      email: "origin-admin@lace.test",
      password,
      token: setup.token,
    });
    const peer = kind === "node" ? "198.51.100.81" : "198.51.100.82";
    const login = await fixture.call(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: "origin-admin@lace.test", password }),
      }),
      peer,
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie()[0].split(";")[0];
    const before = await fixture.runtime.security.listUsers();
    const response = await fixture.call(
      new Request(`${origin}/api/v1/admin/users`, {
        method: "POST",
        headers: {
          origin: "https://foreign.lace.test",
          cookie,
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "forbidden@lace.test", password, role: "admin" }),
      }),
      peer,
    );
    expect(response.status).toBe(403);
    expect(await fixture.runtime.security.listUsers()).toEqual(before);
  }, 30000);
}

const protectedTables = [
  "user",
  "account",
  "api_tokens",
  "setup_tokens",
  "installation_state",
  "content_entries",
  "content_snapshots",
  "content_blocks",
  "media",
  "content_media_references",
  "published_routes",
  "published_state",
  "outbox_events",
];
async function protectedState(fixture) {
  return Promise.all(
    protectedTables.map(async (table) => [
      table,
      await fixture.query(`select * from ${table} order by rowid`),
    ]),
  );
}

for (const kind of ["node", "cloudflare"]) {
  test(`${kind}: session, role, signup and browser negatives preserve all protected state`, async () => {
    const f = await open(kind);
    const peer = kind === "node" ? "198.51.100.101" : "198.51.100.102";
    const invoke = (
      path,
      { cookie, json, method = json === undefined ? "GET" : "POST", headers = {} } = {},
    ) =>
      f.call(
        new Request(origin + path, {
          method,
          headers: {
            origin,
            ...(cookie ? { cookie } : {}),
            ...(json === undefined ? {} : { "content-type": "application/json" }),
            ...headers,
          },
          ...(json === undefined ? {} : { body: JSON.stringify(json) }),
        }),
        peer,
      );
    const setup = await f.runtime.security.createSetupToken();
    const { user: admin } = await f.runtime.security.bootstrap({
      email: "matrix-admin@lace.test",
      password,
      token: setup.token,
    });
    const editor = await f.runtime.security.createUser({
      email: "matrix-editor@lace.test",
      password,
      role: "editor",
    });
    const viewer = await f.runtime.security.createUser({
      email: "matrix-viewer@lace.test",
      password,
      role: "viewer",
    });
    const cookies = {};
    for (const user of [admin, editor, viewer]) {
      const response = await invoke("/api/auth/sign-in/email", {
        json: { email: user.email, password },
      });
      expect(response.status).toBe(200);
      const setCookie = response.headers.getSetCookie()[0];
      expect(setCookie).toMatch(/; Secure/iu);
      expect(setCookie).toMatch(/; HttpOnly/iu);
      expect(setCookie).toMatch(/; SameSite=Lax/iu);
      cookies[user.role] = setCookie.split(";")[0];
    }
    const deny = async (path, options, status = 403) => {
      const before = await protectedState(f);
      expect((await invoke(path, options)).status).toBe(status);
      expect(await protectedState(f)).toEqual(before);
    };
    const create = { email: "denied@lace.test", password, role: "admin" };
    for (const requestOrigin of [
      "https://foreign.lace.test",
      "null",
      origin + "/path",
      "https://security.lace.test:444",
      "malformed",
      origin + ",https://foreign.lace.test",
    ]) {
      await deny("/api/v1/admin/users", {
        cookie: cookies.admin,
        json: create,
        headers: { origin: requestOrigin },
      });
    }
    const before = await protectedState(f);
    const crossSite = await f.call(
      new Request(origin + "/api/v1/admin/users", {
        method: "POST",
        headers: {
          cookie: cookies.admin,
          "content-type": "application/json",
          "sec-fetch-site": "cross-site",
        },
        body: JSON.stringify(create),
      }),
      peer,
    );
    expect(crossSite.status).toBe(403);
    expect(await protectedState(f)).toEqual(before);
    for (const cookie of [undefined, "invalid=session", cookies.editor, cookies.viewer])
      await deny("/api/v1/admin/users", { cookie, json: create });
    for (const role of ["editor", "viewer"]) {
      await deny("/api/v1/admin/api-tokens", { cookie: cookies[role], json: { name: "denied" } });
      await deny("/api/v1/admin/builds", { cookie: cookies[role], json: {} });
    }
    const [home] = await f.query("select id from content_entries where model_key = 'home'");
    await deny(`/api/v1/admin/entries/${home.id}/draft`, {
      cookie: cookies.viewer,
      method: "PUT",
      json: { expectedRevision: 1, title: "denied", fields: {}, blocks: [] },
    });
    await deny(`/api/v1/admin/entries/${home.id}/publish`, {
      cookie: cookies.editor,
      json: { expectedRevision: 1 },
    });
    await deny(`/api/v1/admin/entries/${home.id}/draft`, {
      cookie: cookies.admin,
      method: "PUT",
      headers: { origin: "https://foreign.lace.test" },
      json: { expectedRevision: 1, title: "denied", fields: {}, blocks: [] },
    });
    const upload = new FormData();
    upload.append(
      "file",
      new Blob([new Uint8Array([137, 80, 78, 71])], { type: "image/png" }),
      "denied.png",
    );
    const mediaBefore = await protectedState(f);
    expect(
      (
        await f.call(
          new Request(origin + "/api/v1/admin/media", {
            method: "POST",
            headers: { origin, cookie: cookies.viewer },
            body: upload,
          }),
          peer,
        )
      ).status,
    ).toBe(403);
    expect(await protectedState(f)).toEqual(mediaBefore);
    const issued = await f.runtime.security.createBuildToken({
      name: "matrix-build",
      now: Date.now(),
    });
    await deny("/api/v1/admin/users", {
      json: create,
      headers: { authorization: `Bearer ${issued.token}` },
    });
    await deny(
      `/api/v1/admin/users/${admin.id}`,
      { cookie: cookies.admin, method: "PATCH", json: { disabled: true } },
      409,
    );
    // Closed enrollment must not create even provider sessions or credential rows.
    const sessions = await f.query("select * from session order by rowid");
    await deny(
      "/api/auth/sign-up/email",
      { json: { name: "Public", email: "public@lace.test", password } },
      400,
    );
    expect(await f.query("select * from session order by rowid")).toEqual(sessions);
    await deny("/api/auth/sign-out", {
      cookie: cookies.admin,
      json: {},
      headers: { origin: "https://foreign.lace.test" },
    });
    expect(await f.query("select * from session order by rowid")).toEqual(sessions);
    await f.runtime.security.disableUser({ userId: editor.id });
    await deny("/api/v1/admin/content-models", { cookie: cookies.editor });
    await f.sql(`update session set expires_at = 1 where user_id = '${viewer.id}'`);
    await deny("/api/v1/admin/content-models", { cookie: cookies.viewer });
    await f.sql(`delete from session where user_id = '${admin.id}'`);
    await deny("/api/v1/admin/users", { cookie: cookies.admin, json: create });
    // Origin-less non-browser requests retain their session/role authorization.
    const login = await f.call(
      new Request(origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: admin.email, password }),
      }),
      kind === "node" ? "198.51.100.103" : "198.51.100.104",
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie()[0].split(";")[0];
    const operator = await f.call(
      new Request(origin + "/api/v1/admin/users", {
        method: "POST",
        headers: { cookie, "content-type": "application/json" },
        body: JSON.stringify({ email: "operator@lace.test", password, role: "viewer" }),
      }),
      peer,
    );
    expect(operator.status).toBe(201);
    expect(
      (
        await invoke("/api/v1/admin/content-models", {
          cookie,
          headers: { origin: "https://foreign.lace.test" },
        })
      ).status,
    ).toBe(200);
  }, 30000);

  for (const production of [false, true]) {
    test(`${kind}: loopback alias mutations are trusted only in development (${production})`, async () => {
      const base = "http://127.0.0.1:3456";
      const f = await open(kind, { origin: base, production });
      const peer = `198.51.100.${(kind === "node" ? 110 : 120) + Number(production)}`;
      const setup = await f.runtime.security.createSetupToken();
      await f.runtime.security.bootstrap({
        email: "alias@lace.test",
        password,
        token: setup.token,
      });
      const login = await f.call(
        new Request(base + "/api/auth/sign-in/email", {
          method: "POST",
          headers: { origin: base, "content-type": "application/json" },
          body: JSON.stringify({ email: "alias@lace.test", password }),
        }),
        peer,
      );
      expect(login.status).toBe(200);
      const cookie = login.headers.getSetCookie()[0].split(";")[0];
      const before = await protectedState(f);
      const response = await f.call(
        new Request(base + "/api/v1/admin/users", {
          method: "POST",
          headers: { origin: "http://localhost:3456", cookie, "content-type": "application/json" },
          body: JSON.stringify({ email: "alias-created@lace.test", password, role: "viewer" }),
        }),
        peer,
      );
      expect(response.status).toBe(production ? 403 : 201);
      if (production) expect(await protectedState(f)).toEqual(before);
    }, 30000);
  }
}

for (const kind of ["node", "cloudflare"]) {
  test(`${kind}: hostile media and content preserve published data and tokens stay digest-only`, async () => {
    const f = await open(kind);
    const peer = kind === "node" ? "198.51.100.141" : "198.51.100.142";
    const setup = await f.runtime.security.createSetupToken();
    await f.runtime.security.bootstrap({
      email: "input-admin@lace.test",
      password,
      token: setup.token,
    });
    const login = await f.call(
      new Request(origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: "input-admin@lace.test", password }),
      }),
      peer,
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie()[0].split(";")[0];
    const call = (path, method = "GET", body, headers = {}) =>
      f.call(
        new Request(origin + path, {
          method,
          headers: { cookie, origin, ...headers },
          ...(body === undefined ? {} : { body }),
        }),
        peer,
      );
    const json = (path, method, body) =>
      call(path, method, JSON.stringify(body), { "content-type": "application/json" });
    const [home] = await f.query("select id from content_entries where model_key = 'home'");
    expect(
      (await json(`/api/v1/admin/entries/${home.id}/publish`, "POST", { expectedRevision: 1 }))
        .status,
    ).toBe(200);
    const published = await (await call("/api/v1/public/pages/home")).json();
    for (const [bytes, type, status] of [
      [new Uint8Array(), "image/png", 422],
      [Buffer.from('<svg onload="alert(1)"/>'), "image/png", 422],
      [png.subarray(0, 20), "image/png", 422],
      [Buffer.concat([png, Buffer.from("<script>bad()</script>")]), "image/png", 422],
      [Buffer.alloc(10 * 1024 * 1024 + 1), "image/png", 413],
    ]) {
      const before = await protectedState(f);
      const form = new FormData();
      form.append("file", new Blob([bytes], { type }), "looks-valid.png");
      expect((await call("/api/v1/admin/media", "POST", form)).status).toBe(status);
      expect(await protectedState(f)).toEqual(before);
      expect(await (await call("/api/v1/public/pages/home")).json()).toEqual(published);
    }
    // Declared MIME and extension never establish the binary format.
    const valid = new FormData();
    valid.append("file", new Blob([png], { type: "image/jpeg" }), "../../untrusted\\photo.jpg");
    const uploaded = await call("/api/v1/admin/media", "POST", valid);
    expect(uploaded.status).toBe(201);
    const media = await uploaded.json();
    expect(media.mimeType).toBe("image/png");
    expect(media.filename).not.toMatch(/[\\/\r\n]/u);
    expect(media.storageKey).toBeUndefined();
    expect((await f.query("select storage_key from media"))[0].storage_key).not.toContain("photo");
    expect((await call(`/api/v1/public/media/${media.id}`)).status).toBe(404);
    for (const data of [
      { type: "cta", data: { heading: "X", actionLabel: "X", actionUrl: "javascript:alert(1)" } },
      {
        type: "richText",
        data: {
          content: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "X",
                    marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
                  },
                ],
              },
            ],
          },
        },
      },
      {
        type: "richText",
        data: {
          content: {
            type: "doc",
            content: [{ type: "script", attrs: { src: "https://foreign.test" } }],
          },
        },
      },
    ]) {
      const before = await protectedState(f);
      const response = await json(`/api/v1/admin/entries/${home.id}/draft`, "PUT", {
        expectedRevision: 1,
        title: "unsafe",
        fields: {},
        blocks: [{ ...data, key: "hostile", schemaVersion: 1, position: 1000 }],
      });
      expect(response.status).toBe(422);
      expect(await protectedState(f)).toEqual(before);
      expect(await (await call("/api/v1/public/pages/home")).json()).toEqual(published);
    }
    const issuedResponse = await json("/api/v1/admin/api-tokens", "POST", { name: "one-time" });
    expect(issuedResponse.status).toBe(201);
    const issued = await issuedResponse.json();
    const stored = await f.query("select token_hash from api_tokens");
    expect(stored[0].token_hash).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(stored)).not.toContain(issued.token);
    expect(JSON.stringify(await (await call("/api/v1/admin/api-tokens")).json())).not.toContain(
      issued.token,
    );
    const authorization = { authorization: `Bearer ${issued.token}` };
    expect(
      (await call("/api/v1/public/build-export", "GET", undefined, authorization)).status,
    ).toBe(200);
    expect((await call(`/api/v1/admin/api-tokens/${issued.id}`, "DELETE")).status).toBe(200);
    const before = await protectedState(f);
    expect(
      (await call("/api/v1/public/build-export", "GET", undefined, authorization)).status,
    ).toBe(403);
    expect(await protectedState(f)).toEqual(before);
  }, 30000);
}

for (const kind of ["node", "cloudflare"]) {
  test(`${kind}: credential sentinels never escape runtime or provider diagnostics`, async () => {
    const sentinel = "credential-sentinel-34b-no-disclosure-long-value";
    const diagnostics = [];
    vi.spyOn(console, "error").mockImplementation((...values) => diagnostics.push(values));
    vi.spyOn(console, "warn").mockImplementation((...values) => diagnostics.push(values));
    const f = await open(kind, {
      secret: sentinel,
      storageFault: sentinel,
      logger: {
        log(record) {
          diagnostics.push(record);
        },
      },
    });
    const peer = kind === "node" ? "198.51.100.151" : "198.51.100.152";
    const setup = await f.runtime.security.createSetupToken();
    await f.runtime.security.bootstrap({
      email: "sentinel@lace.test",
      password,
      token: setup.token,
    });
    const login = await f.call(
      new Request(origin + "/api/auth/sign-in/email", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({ email: "sentinel@lace.test", password }),
      }),
      peer,
    );
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie()[0].split(";")[0];
    const secrets = [sentinel, password, setup.token, cookie.split("=")[1]];
    // Auth/session success bodies and one-time setup/token reveals are intentional and not diagnostic surfaces.
    const rejectedProvider = await f.call(
      new Request(origin + "/api/auth/sign-out", {
        method: "POST",
        headers: {
          origin: `https://${sentinel}.foreign.test`,
          cookie,
          "content-type": "application/json",
        },
        body: "{}",
      }),
      peer,
    );
    expect(rejectedProvider.status).toBe(403);
    assertSecretFree(await rejectedProvider.text(), secrets, `${kind} provider error`);
    const form = new FormData();
    form.append("file", new Blob([png], { type: "image/png" }), "error.png");
    const before = await protectedState(f);
    const failure = await f.call(
      new Request(origin + "/api/v1/admin/media", {
        method: "POST",
        headers: { origin, cookie },
        body: form,
      }),
      peer,
    );
    expect(failure.status).toBe(500);
    assertSecretFree(await failure.text(), secrets, `${kind} storage HTTP error`);
    expect(await protectedState(f)).toEqual(before);
    assertSecretFree(JSON.stringify(diagnostics), secrets, `${kind} captured diagnostics`);
    expect(() =>
      assertSecretFree(
        JSON.stringify([...diagnostics, sentinel]),
        secrets,
        `${kind} deliberate leak`,
      ),
    ).toThrow(`${kind} deliberate leak`);
    try {
      assertSecretFree(sentinel, secrets, "deliberate leak");
    } catch (error) {
      expect(error.message).not.toContain(sentinel);
    }
  }, 30000);
}
