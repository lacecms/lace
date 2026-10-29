import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import config from "../../../lace.config.ts";
import { checkedInMigrations } from "@lacecms/db";
import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
  contentModelRoute,
} from "../../../packages/application/dist/index.js";
import { unixMilliseconds } from "../../../packages/domain/dist/index.js";
import {
  D1ContentRepository,
  D1SecurityService,
} from "../../../packages/platform-cloudflare/dist/index.js";
import { migrationStatements } from "../../../packages/platform-cloudflare/src/d1-test-harness.mjs";
const apiRequire = createRequire(new URL("../../../apps/api/package.json", import.meta.url));
const platformRequire = createRequire(
  new URL("../../../packages/platform-cloudflare/package.json", import.meta.url),
);
const { build } = createRequire(apiRequire.resolve("wrangler/package.json"))("esbuild");
const { Miniflare, convertV4MiniflareOptions } = platformRequire("miniflare");

test("production Worker isolate executes OAuth consent, guarded code exchange and real SDK content tools", async () => {
  const origin = "https://cms.lace.test";
  const secret = "worker-isolate-fixture-secret-at-least-32-characters";
  const compiled = await build({
    // Miniflare dispatchFetch restores the URL but replaces Host with its socket.
    // Restore the edge Host at the harness boundary, before the production entry.
    stdin: {
      contents: `import worker from ${JSON.stringify(new URL("../../../apps/api/worker/index.ts", import.meta.url).pathname)};
        export default { ...worker, fetch(request, ...args) {
          const headers = new Headers(request.headers);
          headers.set("host", new URL(request.url).host);
          return worker.fetch(new Request(request, { headers }), ...args);
        }};`,
      resolveDir: new URL("../../../", import.meta.url).pathname,
      loader: "ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    conditions: ["workerd", "worker", "browser"],
    external: ["node:*"],
    metafile: true,
  });
  expect(
    Object.values(compiled.metafile.outputs)
      .flatMap((item) => item.imports)
      .some((item) => /^(?:node:)?(?:http|https|http2)(?:\/|$)/u.test(item.path)),
  ).toBe(false);
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat"],
      modules: true,
      script: compiled.outputFiles[0].text,
      d1Databases: ["DB"],
      r2Buckets: ["MEDIA"],
      bindings: {
        LACE_PUBLIC_BASE_URL: `${origin}/`,
        LACE_AUTH_SECRET: secret,
        LACE_MCP_ENABLED: "true",
      },
    }),
  );
  let client;
  try {
    const database = await mf.getD1Database("DB");
    const statements = await migrationStatements();
    await database.batch(statements.map((sql) => database.prepare(sql)));
    await database
      .prepare("create table d1_migrations(id integer primary key,name text not null)")
      .run();
    await database.batch(
      checkedInMigrations.map((migration) =>
        database.prepare("insert into d1_migrations(name) values (?)").bind(migration.name),
      ),
    );
    const repository = new D1ContentRepository(database, (key) => {
      const model = config.runtime.content.find((model) => model.key === key);
      return model ? contentModelRoute(model) : undefined;
    });
    const prepared = await prepareConfigurationSynchronization({
      models: config.runtime.content,
      state: repository,
    });
    let sequence = 0;
    await applyPreparedConfigurationSynchronization({
      models: config.runtime.content,
      prepared,
      target: repository,
      clock: { now: () => unixMilliseconds(Date.now()) },
      ids: { next: () => `worker-sync-${++sequence}` },
    });
    const security = new D1SecurityService(database, Date.now);
    const setup = await security.createSetupToken();
    const password = "worker-isolate-fixture-password";
    await security.bootstrap({ email: "worker@lace.test", password, token: setup.token });
    const fetch = async (path, { method = "GET", json, cookie, form, auth } = {}) => {
      const headers = new Headers({ host: new URL(origin).host, "cf-connecting-ip": "192.0.2.44" });
      if (cookie) headers.set("cookie", cookie);
      if (auth) headers.set("authorization", `Bearer ${auth}`);
      if (json) {
        headers.set("content-type", "application/json");
        headers.set("origin", origin);
        headers.set("accept", "application/json");
      }
      if (form) headers.set("content-type", "application/x-www-form-urlencoded");
      return mf.dispatchFetch(`${origin}${path}`, {
        method,
        headers,
        body: json ? JSON.stringify(json) : form?.toString(),
      });
    };
    const registered = await fetch("/api/auth/oauth2/register", {
      method: "POST",
      json: {
        client_name: "Isolate client",
        redirect_uris: ["https://client.test/callback"],
        scope: "content:read content:write offline_access",
      },
    });
    expect(
      registered.status,
      registered.status === 201 ? "registered" : await registered.text(),
    ).toBe(201);
    const clientId = (await registered.json()).client_id;
    const login = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      json: { email: "worker@lace.test", password },
    });
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; ");
    const verifier = "isolate-verifier-0123456789-abcdefghijklmnopqrstuvwxyz";
    const query = new URLSearchParams({
      client_id: clientId,
      redirect_uri: "https://client.test/callback",
      response_type: "code",
      resource: `${origin}/mcp`,
      scope: "content:read content:write offline_access",
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    });
    const authorize = await mf.dispatchFetch(`${origin}/api/auth/oauth2/authorize?${query}`, {
      headers: {
        cookie,
        accept: "application/json",
        host: new URL(origin).host,
        "cf-connecting-ip": "192.0.2.44",
      },
    });
    expect(authorize.status).toBe(200);
    const target = new URL((await authorize.json()).url);
    const consent = await fetch("/api/auth/oauth2/consent", {
      method: "POST",
      cookie,
      json: { transaction: target.searchParams.get("mcpTransaction"), accept: true },
    });
    expect(consent.status).toBe(200);
    const code = new URL((await consent.json()).url).searchParams.get("code");
    const token = await fetch("/api/auth/oauth2/token", {
      method: "POST",
      form: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        redirect_uri: "https://client.test/callback",
        resource: `${origin}/mcp`,
        code,
        code_verifier: verifier,
      }),
    });
    expect(token.status).toBe(200);
    const tokens = await token.json();
    client = new Client({ name: "production-isolate-test", version: "0.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(`${origin}/mcp`), {
        fetch: async (url, init) => {
          const headers = new Headers(init.headers);
          headers.set("authorization", `Bearer ${tokens.access_token}`);
          headers.set("host", new URL(origin).host);
          headers.set("cf-connecting-ip", "192.0.2.44");
          let body = init.body;
          if (typeof body === "string") {
            const message = JSON.parse(body);
            if (message.method === "initialize") {
              message.params.protocolVersion = "2025-11-25";
              body = JSON.stringify(message);
            }
          }
          return mf.dispatchFetch(String(url), { ...init, headers, body });
        },
      }),
    );
    expect((await client.listTools()).tools).toHaveLength(5);
    const model = config.runtime.content.find((model) => model.kind === "collection");
    const created = await client.callTool({
      name: "create_entry",
      arguments: { modelKey: model.key, title: "Worker isolate draft", fields: {}, blocks: [] },
    });
    expect(created.isError).not.toBe(true);
    const loaded = await client.callTool({
      name: "get_entry",
      arguments: { entryId: created.structuredContent.id },
    });
    expect(loaded.structuredContent).toEqual(created.structuredContent);
  } finally {
    await client?.close();
    await mf.dispose();
  }
}, 30000);
