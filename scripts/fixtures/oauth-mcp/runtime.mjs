// Real runtime composition fixtures. All accounts and credentials are disposable.
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { defineConfig, defineCollection, definePage, defineGlobal } from "@lacecms/config";
import { field } from "@lacecms/content";
import {
  prepareConfigurationSynchronization,
  applyPreparedConfigurationSynchronization,
} from "../../../packages/application/dist/index.js";
import { unixMilliseconds } from "../../../packages/domain/dist/index.js";
import {
  createNodeRuntime,
  migrateNodeDatabase,
  parseNodeRuntimeSettings,
} from "../../../packages/platform-node/dist/index.js";
import { createCloudflareWorker } from "../../../packages/platform-cloudflare/dist/index.js";
import {
  openLocalCloudflare,
  countingD1,
} from "../../../packages/platform-cloudflare/src/d1-test-harness.mjs";
import { InMemoryObjectStorage } from "../../../packages/test-utils/dist/index.js";

export const fixturePassword = "oauth-runtime-fixture-password-only";
const digest = (input) => createHash("sha256").update(input).digest("base64url");
let addressCounter = 1;
export async function openMcpRuntime(
  kind,
  { origin = "https://cms.lace.test", enabled = true, assets } = {},
) {
  const config = await defineConfig({
    content: [
      defineGlobal({ key: "settings", version: 1, fields: {} }),
      definePage({ key: "home", path: "/", version: 1 }),
      defineCollection({
        key: "posts",
        route: "/blog/:slug",
        version: 1,
        fields: {
          author: field.text({ defaultValue: "Unknown" }),
          score: field.number(),
          image: field.media(),
          link: field.url(),
        },
        listOptions: {
          filterableFields: ["author", "score"],
          sortableFields: ["author", "score"],
          searchableFields: ["author"],
        },
      }),
    ],
  });
  const logs = [];
  const pending = [];
  const secret = "runtime-oauth-fixture-secret-at-least-32-characters";
  const address = `192.0.2.${addressCounter++}`;
  let runtime, execute, close, stats;
  if (kind === "SQLite") {
    const directory = await mkdtemp(join(tmpdir(), "lace-mcp-runtime-"));
    const databasePath = join(directory, "db.sqlite");
    migrateNodeDatabase(databasePath);
    runtime = createNodeRuntime({
      config,
      storage: new InMemoryObjectStorage(),
      logger: { log: (entry) => logs.push(entry) },
      ...(assets ? { adminAssets: assets } : {}),
      settings: parseNodeRuntimeSettings({
        LACE_MCP_ENABLED: enabled ? "true" : "false",
        LACE_AUTH_SECRET: secret,
        LACE_DATABASE_PATH: databasePath,
        LACE_PUBLIC_BASE_URL: `${origin}/`,
        LACE_MINIO_ACCESS_KEY: "fixture",
        LACE_MINIO_SECRET_KEY: "fixture",
        LACE_MINIO_ENDPOINT: "http://127.0.0.1:9000",
        LACE_MINIO_REGION: "fixture",
        LACE_MINIO_TIMEOUT_MS: "1000",
        LACE_MINIO_BUCKET: "fixture",
      }),
    });
    execute = async (request) => {
      runtime.setRequestPeer(request, address);
      return runtime.app.fetch(request);
    };
    close = async () => {
      runtime.close();
      await rm(directory, { recursive: true, force: true });
    };
  } else {
    const local = await openLocalCloudflare();
    const measured = countingD1(local.database);
    stats = measured.stats;
    const worker = createCloudflareWorker({
      config,
      logger: { log: (entry) => logs.push(entry) },
      operationalLogger: { error: (entry) => logs.push(entry) },
      postCommitBuildDelayMs: 0,
    });
    const env = {
      DB: measured.binding,
      MEDIA: local.bucket,
      LACE_MCP_ENABLED: enabled ? "true" : "false",
      LACE_AUTH_SECRET: secret,
      LACE_PUBLIC_BASE_URL: `${origin}/`,
      ...(origin.startsWith("http:") ? { LACE_ENVIRONMENT: "development" } : {}),
      ...(assets
        ? {
            ASSETS: {
              fetch: (request) =>
                assets.fetch(
                  new Request(new URL(`/admin${new URL(request.url).pathname}`, origin)),
                ),
            },
          }
        : {}),
    };
    runtime = worker.runtime(env);
    execute = async (request) => {
      const headers = new Headers(request.headers);
      headers.set("cf-connecting-ip", address);
      return worker.fetch(new Request(request, { headers }), env, {
        waitUntil: (task) => pending.push(task),
      });
    };
    close = async () => {
      await Promise.all(pending);
      await local.dispose();
    };
  }
  const prepared = await prepareConfigurationSynchronization({
    models: config.runtime.content,
    state: runtime.repository,
  });
  let nextId = 0;
  await applyPreparedConfigurationSynchronization({
    clock: { now: () => unixMilliseconds(Date.now()) },
    ids: { next: () => `sync-${++nextId}` },
    models: config.runtime.content,
    prepared,
    target: runtime.repository,
  });
  const setup = await runtime.security.createSetupToken();
  const admin = await runtime.security.bootstrap({
    email: "admin@lace.test",
    password: fixturePassword,
    token: setup.token,
  });
  const measurements = [];
  const fetch = async (request) => {
    const start = stats?.queries ?? 0;
    const response = await execute(request);
    measurements.push((stats?.queries ?? 0) - start);
    return response;
  };
  let cookie = "";
  const login = async () => {
    const response = await fetch(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ email: "admin@lace.test", password: fixturePassword }),
      }),
    );
    if (!response.ok) throw new Error(`Fixture login failed (${response.status}).`);
    cookie = response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    return cookie;
  };
  const rest = async (path, { method = "GET", json, headers: custom } = {}) => {
    const headers = new Headers(custom);
    headers.set("cookie", cookie);
    headers.set("origin", origin);
    if (json !== undefined) headers.set("content-type", "application/json");
    const response = await fetch(
      new Request(`${origin}${path}`, {
        method,
        headers,
        ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      }),
    );
    const text = await response.text();
    return { response, body: text ? JSON.parse(text) : undefined };
  };
  const register = async () => {
    const response = await fetch(
      new Request(`${origin}/api/auth/oauth2/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Fixture assistant",
          redirect_uris: [`${origin}/fixture/callback`],
          scope: "content:read content:write offline_access",
          ...(origin.startsWith("http:") ? { application_type: "native" } : {}),
        }),
      }),
    );
    if (!response.ok) throw new Error(`Fixture registration failed (${response.status}).`);
    return (await response.json()).client_id;
  };
  const clientId = enabled ? await register() : undefined;
  const verifier = "runtime-fixture-verifier-0123456789-abcdefghijklmnopqrstuvwxyz";
  const authorizationUrl = () =>
    `${origin}/api/auth/oauth2/authorize?${new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: `${origin}/fixture/callback`,
      resource: `${origin}/mcp`,
      scope: "content:read content:write offline_access",
      state: "runtime-state",
      code_challenge: digest(verifier),
      code_challenge_method: "S256",
    })}`;
  const exchange = async (code) => {
    const response = await fetch(
      new Request(`${origin}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          redirect_uri: `${origin}/fixture/callback`,
          code,
          code_verifier: verifier,
          resource: `${origin}/mcp`,
        }),
      }),
    );
    if (!response.ok) throw new Error(`Fixture code exchange failed (${response.status}).`);
    return response.json();
  };
  const connect = async (tokens) => {
    const client = new Client({ name: "runtime-client", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
        fetch: async (url, init) => {
          const headers = new Headers(init?.headers);
          headers.set("authorization", `Bearer ${tokens.access_token}`);
          let body = init?.body;
          if (typeof body === "string") {
            const message = JSON.parse(body);
            if (message.method === "initialize") {
              message.params.protocolVersion = "2025-11-25";
              body = JSON.stringify(message);
            }
          }
          return fetch(new Request(url, { ...init, headers, body }));
        },
      }),
    );
    return client;
  };
  const authorize = async (write = true) => {
    const start = await fetch(
      new Request(authorizationUrl(), { headers: { cookie, accept: "application/json" } }),
    );
    if (!start.ok) throw new Error(`Fixture authorization failed (${start.status}).`);
    const target = new URL((await start.json()).url);
    const result = await rest("/api/auth/oauth2/consent", {
      method: "POST",
      headers: { accept: "application/json" },
      json: {
        transaction: target.searchParams.get("mcpTransaction"),
        accept: true,
        scope: `content:read ${write ? "content:write " : ""}offline_access`,
      },
    });
    if (!result.response.ok) throw new Error(`Fixture consent failed (${result.response.status}).`);
    return exchange(new URL(result.body.url).searchParams.get("code"));
  };
  return {
    runtime,
    config,
    admin: admin.user,
    close,
    fetch,
    rest,
    login,
    authorizationUrl,
    exchange,
    connect,
    authorize,
    clientId,
    origin,
    logs,
    measurements,
    settle: async () => {
      while (pending.length) await Promise.all(pending.splice(0));
    },
    run: async (sql) =>
      kind === "SQLite"
        ? runtime.database.connection.prepare(sql).run()
        : runtime.settings.database.prepare(sql).run(),
    rows: async (sql) =>
      kind === "SQLite"
        ? runtime.database.connection.prepare(sql).all()
        : (await runtime.settings.database.prepare(sql).all()).results,
    get cookie() {
      return cookie;
    },
  };
}
