import { sql } from "drizzle-orm";
import { oauthIssuances, oauthTokenBindings } from "@lacecms/db";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { afterEach, expect, test } from "vitest";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { probeHandler } from "./mcp-baseline.mjs";
import {
  baselinePlugin,
  baselineAuth,
  providerSchema,
  origin,
  resource,
  scopes,
  guardedFetch,
} from "./baseline.mjs";
import {
  openLocalD1,
  migrationStatements,
  countingD1,
} from "../../../packages/platform-cloudflare/src/d1-test-harness.mjs";

const authRequire = createRequire(new URL("../../../packages/auth/package.json", import.meta.url));
const platformRequire = createRequire(
  new URL("../../../packages/platform-cloudflare/package.json", import.meta.url),
);
const { hashPassword } = authRequire("better-auth/crypto");
const cleanups = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
const password = "compatibility-fixture-password-only";
const digest = (value) => createHash("sha256").update(value).digest("base64url");

async function fixture(runtime, suppliedD1) {
  const plugin = baselinePlugin();
  const { schema } = providerSchema(plugin);
  let database;
  let persistence;
  let security;
  let stats;
  const measurements = [];
  if (runtime === "D1") {
    const d1 = suppliedD1 ?? (await openLocalD1());
    if (!suppliedD1) cleanups.push(d1.dispose);
    const measured = countingD1(d1.database);
    stats = measured.stats;
    database = platformRequire("drizzle-orm/d1").drizzle(measured.binding, { schema });
    persistence = (
      await import("../../../packages/platform-cloudflare/dist/oauth.js")
    ).createD1OAuthPersistence(measured.binding);
    security = new (
      await import("../../../packages/platform-cloudflare/dist/d1-security.js")
    ).D1SecurityService(measured.binding, Date.now);
  } else {
    const Sqlite = authRequire("better-sqlite3");
    const sqlite = new Sqlite(":memory:");
    cleanups.push(() => sqlite.close());
    for (const sql of await migrationStatements()) sqlite.exec(sql);
    database = authRequire("drizzle-orm/better-sqlite3").drizzle(sqlite, { schema });
    persistence = (
      await import("../../../packages/platform-node/dist/oauth.js")
    ).createNodeOAuthPersistence(sqlite);
    security = new (
      await import("../../../packages/platform-node/dist/security.js")
    ).NodeSecurityService(sqlite, Date.now);
  }
  const provider = baselineAuth(database, undefined, "fixture-grant");
  const auth = {
    handler: async (request) => {
      const before = stats?.queries ?? 0;
      const response = await guardedFetch(database, persistence, request);
      if (stats) measurements.push(stats.queries - before);
      return response;
    },
  };
  const context = await provider.$context;
  const adapter = context.adapter;
  const now = new Date();
  await adapter.create({
    model: "user",
    forceAllowId: true,
    data: {
      id: "fixture-user",
      name: "Fixture",
      email: "fixture@lace.test",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    },
  });
  await adapter.create({
    model: "account",
    forceAllowId: true,
    data: {
      id: "fixture-account",
      userId: "fixture-user",
      accountId: "fixture-user",
      providerId: "credential",
      password: await hashPassword(password),
      createdAt: now,
      updatedAt: now,
    },
  });
  await adapter.create({
    model: "oauthClient",
    data: {
      clientId: "fixture-client",
      name: "Fixture",
      tokenEndpointAuthMethod: "none",
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      redirectUris: ["http://127.0.0.1:4011/callback"],
      scopes,
      requirePKCE: true,
      disabled: false,
      skipConsent: false,
      createdAt: now,
    },
  });
  await adapter.create({
    model: "oauthClientResource",
    data: { clientId: "fixture-client", resourceId: resource, createdAt: now },
  });
  expect(
    await persistence.createGrant({
      id: "fixture-grant",
      userId: "fixture-user",
      clientId: "fixture-client",
      resource,
      scopes,
      userGeneration: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + 2592000000,
    }),
  ).toBe(true);
  const refresh = "fixture-only-refresh-credential";
  const priorRefresh = await adapter.create({
    model: "oauthRefreshToken",
    data: {
      token: digest(refresh),
      referenceId: "fixture-grant",
      clientId: "fixture-client",
      userId: "fixture-user",
      scopes,
      resources: [resource],
      createdAt: now,
      expiresAt: new Date(Date.now() + 3600000),
    },
  });
  await database
    .insert(oauthIssuances)
    .values({
      id: "prior-issuance",
      grantId: "fixture-grant",
      kind: "code",
      inputHash: "prior-code-hash",
      familyGeneration: 0,
      userGeneration: 0,
      state: "committed",
      createdAt: now.getTime(),
      pendingExpiresAt: now.getTime() + 60000,
      retainUntil: now.getTime() + 2592000000,
      committedAt: now.getTime(),
    })
    .run();
  await database
    .insert(oauthTokenBindings)
    .values({
      kind: "refresh",
      providerId: priorRefresh.id,
      tokenHash: digest(refresh),
      grantId: "fixture-grant",
      issuanceId: "prior-issuance",
      familyGeneration: 0,
      userGeneration: 0,
      expiresAt: now.getTime() + 3600000,
    })
    .run();
  const requestRefresh = (credential = refresh, overrides = {}) =>
    auth.handler(
      new Request(`${origin}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: "fixture-client",
          refresh_token: credential,
          resource,
          ...overrides,
        }),
      }),
    );
  return {
    auth,
    adapter,
    requestRefresh,
    database,
    schema,
    persistence,
    security,
    measurements,
    rows: (query) => database.all(sql.raw(query)),
    run: (query) => database.run(sql.raw(query)),
  };
}

for (const runtime of ["SQLite", "D1"]) {
  test(`${runtime}: existing password login and ordinary opaque refresh`, async () => {
    const { auth, requestRefresh } = await fixture(runtime);
    const login = await auth.handler(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ email: "fixture@lace.test", password }),
      }),
    );
    expect(login.status).toBe(200);
    expect(login.headers.get("set-cookie")).toContain("session_token");
    const response = await requestRefresh();
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.access_token).toBeTypeOf("string");
    expect(result.refresh_token).toBeTypeOf("string");
    expect(result.expires_in).toBeLessThanOrEqual(900);
  }, 30000);

  test(`${runtime}: replay must prevent an in-flight rotation from rebuilding a revoked family`, async () => {
    const { adapter, requestRefresh, persistence } = await fixture(runtime);
    const claimed = Promise.withResolvers();
    const resume = Promise.withResolvers();
    const original = persistence.claim.bind(persistence);
    // Pause only after the provider commits its real compare-and-swap. This
    // schedules another request between existing provider I/O boundaries; it
    // does not emulate SQL, token verification or protocol code.
    persistence.claim = async (input) => {
      const row = await original(input);
      if (input.kind === "refresh" && row) {
        claimed.resolve();
        await resume.promise;
      }
      return row;
    };
    const rotation = requestRefresh();
    try {
      await Promise.race([
        claimed.promise,
        rotation.then((r) => {
          throw new Error(`Rotation ended before CAS: ${r.status}`);
        }),
      ]);
      const replay = await requestRefresh();
      expect(replay.status).toBe(400);
      expect((await replay.json()).error).toBe("invalid_grant");
    } finally {
      resume.resolve();
    }
    const winner = await rotation;
    expect(winner.status).toBe(400);
    const renewed = await requestRefresh();
    expect(renewed.status, "A child refresh token remained renewable after family revocation").toBe(
      400,
    );
    const remaining = await adapter.findMany({
      model: "oauthRefreshToken",
      where: [{ field: "clientId", value: "fixture-client" }],
    });
    // This is the required gate, deliberately not an expected-failure test.
    // A resumed request must not leave renewable authority after replay revokes.
    expect(remaining.length, "An active child survived family invalidation").toBe(0);
  }, 30000);
}

test("MCP SDK v2: Valibot-derived schema with a pinned 2025-11-25 client", async () => {
  const handler = probeHandler();
  cleanups.push(() => handler.close());
  const client = new Client(
    { name: "lace-compatibility-client", version: "0.0.0" },
    { versionNegotiation: { mode: "legacy" }, supportedProtocolVersions: ["2025-11-25"] },
  );
  cleanups.push(() => client.close());
  let initializedVersion;
  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    fetch: async (input, init) => {
      const request = new Request(input, init);
      if (request.method === "POST") {
        const message = await request.clone().json();
        if (message.method === "initialize") initializedVersion = message.params.protocolVersion;
      }
      return handler.fetch(request);
    },
  });
  await client.connect(transport);
  expect(initializedVersion).toBe("2025-11-25");
  const listed = await client.listTools();
  expect(listed.tools.map((tool) => tool.name)).toEqual(["probe"]);
  expect(listed.tools[0].inputSchema.properties.value.type).toBe("string");
  const result = await client.callTool({ name: "probe", arguments: { value: "portable" } });
  expect(result.structuredContent).toEqual({ value: "portable" });
  expect(JSON.parse(result.content[0].text)).toEqual(result.structuredContent);
});

async function verifyCodeExchange(fetch, adapter, competing = false, exchangeOverride) {
  const login = await fetch(
    new Request(`${origin}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify({ email: "fixture@lace.test", password }),
    }),
  );
  expect(login.status).toBe(200);
  const cookies = login.headers
    .getSetCookie()
    .map((value) => value.split(";")[0])
    .join("; ");
  // This baseline seeds a prior explicit consent. The real consent/login UI is
  // tested later; no production provider skipConsent option is enabled here.
  await adapter.create({
    model: "oauthConsent",
    data: {
      clientId: "fixture-client",
      userId: "fixture-user",
      referenceId: "fixture-grant",
      scopes,
      resources: [resource],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  const verifier = "fixture-code-verifier-0123456789-abcdefghijklmnopqrstuvwxyz";
  const query = new URLSearchParams({
    client_id: "fixture-client",
    response_type: "code",
    redirect_uri: "http://127.0.0.1:4011/callback",
    resource,
    scope: scopes.join(" "),
    state: "fixture-state",
    code_challenge: digest(verifier),
    code_challenge_method: "S256",
  });
  const response = await fetch(
    new Request(`${origin}/api/auth/oauth2/authorize?${query}`, {
      headers: { cookie: cookies, accept: "application/json" },
    }),
  );
  expect(response.status).toBe(200);
  const navigation = await response.json();
  expect(navigation.redirect).toBe(true);
  const redirect = new URL(navigation.url);
  expect(redirect.origin).toBe("http://127.0.0.1:4011");
  expect(redirect.searchParams.has("error")).toBe(false);
  expect(redirect.searchParams.get("state")).toBe("fixture-state");
  const code = redirect.searchParams.get("code");
  expect(typeof code === "string" && code.length > 0).toBe(true);
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: "fixture-client",
    code,
    code_verifier: verifier,
    redirect_uri: "http://127.0.0.1:4011/callback",
    resource,
  });
  if (exchangeOverride) {
    for (const [key, value] of Object.entries(exchangeOverride)) body.set(key, value);
    const response = await fetch(
      new Request(`${origin}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      }),
    );
    expect(response.status).toBe(exchangeOverride.code_verifier ? 401 : 400);
    const error = await response.json();
    expect(error.error).toBeTypeOf("string");
    expect(error.access_token).toBeUndefined();
    return;
  }
  if (competing) {
    const responses = await Promise.all(
      [0, 1].map(() =>
        fetch(
          new Request(`${origin}/api/auth/oauth2/token`, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
          }),
        ),
      ),
    );
    expect(responses.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    expect(responses.every((r) => r.status === 200 || r.status === 400)).toBe(true);
    return;
  }
  const exchanged = await fetch(
    new Request(`${origin}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
  expect(exchanged.status).toBe(200);
  const tokens = await exchanged.json();
  expect(typeof tokens.access_token).toBe("string");
  expect(typeof tokens.refresh_token).toBe("string");
  expect(tokens.expires_in).toBeLessThanOrEqual(900);
  // Worker auth is reconstructed for each request: renewal therefore proves
  // opaque credentials do not depend on one auth instance's signing state.
  const renewal = await fetch(
    new Request(`${origin}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: "fixture-client",
        refresh_token: tokens.refresh_token,
        resource,
      }),
    }),
  );
  expect(renewal.status).toBe(200);
  const reused = await fetch(
    new Request(`${origin}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    }),
  );
  expect(reused.status).toBe(400);
  expect((await reused.json()).error).toBe("invalid_grant");
}

for (const runtime of ["SQLite", "D1"]) {
  test(`${runtime}: S256 authorization code exchange and code reuse rejection`, async () => {
    const { auth, adapter, measurements } = await fixture(runtime);
    await verifyCodeExchange((request) => auth.handler(request), adapter);
    if (runtime === "D1") expect(measurements.every((count) => count <= 50)).toBe(true);
  }, 30000);
}

test("Worker: SDK/OAuth bundle contains no Node HTTP APIs and executes S256 plus MCP", async () => {
  const apiRequire = createRequire(new URL("../../../apps/api/package.json", import.meta.url));
  const wranglerRequire = createRequire(apiRequire.resolve("wrangler/package.json"));
  const { build } = wranglerRequire("esbuild");
  const { Miniflare, convertV4MiniflareOptions } = platformRequire("miniflare");
  const result = await build({
    entryPoints: [new URL("./worker.mjs", import.meta.url).pathname],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
    conditions: ["workerd", "worker", "browser"],
    external: ["node:*"],
    metafile: true,
  });
  const imports = Object.values(result.metafile.outputs).flatMap((output) =>
    output.imports.map((entry) => entry.path),
  );
  expect(imports.filter((path) => /^(?:node:)?(?:http|https|http2)(?:\/|$)/u.test(path))).toEqual(
    [],
  );
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      compatibilityDate: "2026-09-01",
      compatibilityFlags: ["nodejs_compat"],
      d1Databases: ["DB"],
      modules: true,
      script: result.outputFiles[0].text,
    }),
  );
  cleanups.push(() => mf.dispose());
  const binding = await mf.getD1Database("DB");
  await binding.batch((await migrationStatements()).map((sql) => binding.prepare(sql)));
  const { adapter } = await fixture("D1", { database: binding });
  const workerFetch = (input, init) => {
    const request = new Request(input, init);
    return mf.dispatchFetch(request.url, request);
  };
  await verifyCodeExchange(workerFetch, adapter);
  const client = new Client(
    { name: "worker-baseline", version: "0.0.0" },
    { supportedProtocolVersions: ["2025-11-25"], versionNegotiation: { mode: "legacy" } },
  );
  cleanups.push(() => client.close());
  await client.connect(
    new StreamableHTTPClientTransport(new URL(resource), { fetch: workerFetch }),
  );
  expect((await client.listTools()).tools.map((tool) => tool.name)).toEqual(["probe"]);
  const response = await client.callTool({ name: "probe", arguments: { value: "worker" } });
  expect(response.structuredContent).toEqual({ value: "worker" });
}, 30000);

test("pinned provider route and schema inventories stay explicit", () => {
  const plugin = baselinePlugin();
  expect(Object.keys(plugin.schema)).toEqual([
    "oauthClient",
    "oauthResource",
    "oauthClientResource",
    "oauthRefreshToken",
    "oauthAccessToken",
    "oauthConsent",
    "oauthClientAssertion",
  ]);
  const selected = [
    "getOAuthServerConfig",
    "oauth2Authorize",
    "oauth2Consent",
    "oauth2Continue",
    "oauth2Token",
    "registerOAuthClient",
    "oauth2Revoke",
  ];
  expect(
    selected.map((key) => [plugin.endpoints[key].options.method, plugin.endpoints[key].path]),
  ).toEqual([
    ["GET", "/.well-known/oauth-authorization-server"],
    [["GET", "POST"], "/oauth2/authorize"],
    ["POST", "/oauth2/consent"],
    ["POST", "/oauth2/continue"],
    ["POST", "/oauth2/token"],
    ["POST", "/oauth2/register"],
    ["POST", "/oauth2/revoke"],
  ]);
});

for (const runtime of ["SQLite", "D1"]) {
  test(`${runtime}: production auth boundary keeps OAuth routes closed`, async () => {
    const { createBetterAuthBoundary } = await import("../../../packages/auth/dist/index.js");
    const { database, schema } = await fixture(runtime);
    const boundary = createBetterAuthBoundary({
      database,
      schema,
      origin: new URL(origin),
      production: true,
      secret: "fixture-only-secret-not-a-deployment-credential",
    });
    for (const path of [
      "/oauth2/authorize",
      "/oauth2/token",
      "/oauth2/register",
      "/oauth2/consent",
      "/oauth2/continue",
      "/oauth2/revoke",
      "/.well-known/oauth-authorization-server",
    ]) {
      for (const method of ["GET", "POST", "DELETE"]) {
        expect(
          (await boundary.fetch(new Request(`${origin}/api/auth${path}`, { method }))).status,
        ).toBe(404);
      }
    }
  }, 30000);
}

for (const runtime of ["SQLite", "D1"]) {
  test(`${runtime}: competing refresh claims have at most one winner and revoke on reuse`, async () => {
    const { requestRefresh, persistence, rows } = await fixture(runtime);
    const results = await Promise.all([requestRefresh(), requestRefresh()]);
    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(1);
    expect(results.every((r) => r.status === 200 || r.status === 400)).toBe(true);
    expect(
      await persistence.authority(
        "refresh",
        digest("fixture-only-refresh-credential"),
        "fixture-client",
        Date.now(),
      ),
    ).toBeNull();
    expect(
      (await rows("select generation,revoked_at from oauth_grants"))[0].revoked_at,
    ).not.toBeNull();
  }, 30000);

  test(`${runtime}: completed issuance loses access immediately after explicit revoke`, async () => {
    const { requestRefresh, persistence } = await fixture(runtime);
    const issued = await requestRefresh();
    expect(issued.status).toBe(200);
    const tokens = await issued.json();
    expect(
      await persistence.authority("access", digest(tokens.access_token), undefined, Date.now()),
    ).not.toBeNull();
    expect(await persistence.revokeConnection("another-user", "fixture-grant", Date.now())).toBe(
      false,
    );
    expect(await persistence.revokeConnection("fixture-user", "fixture-grant", Date.now())).toBe(
      true,
    );
    expect(await persistence.revokeConnection("fixture-user", "fixture-grant", Date.now())).toBe(
      true,
    );
    expect(
      await persistence.authority("access", digest(tokens.access_token), undefined, Date.now()),
    ).toBeNull();
    expect((await requestRefresh(tokens.refresh_token)).status).toBe(400);
  }, 30000);

  test(`${runtime}: a grant revoked after child preparation cannot publish authority`, async () => {
    const { requestRefresh, persistence, rows } = await fixture(runtime);
    const original = persistence.prepare.bind(persistence);
    let first = true;
    persistence.prepare = async (...args) => {
      const result = await original(...args);
      if (first && result) {
        first = false;
        await persistence.revokeFamily("fixture-grant", Date.now());
      }
      return result;
    };
    const response = await requestRefresh();
    expect(response.status).toBe(400);
    expect((await response.json()).access_token).toBeUndefined();
    const bindings = await rows("select kind,token_hash from oauth_token_bindings");
    for (const binding of bindings)
      expect(
        await persistence.authority(binding.kind, binding.token_hash, undefined, Date.now()),
      ).toBeNull();
    if (runtime === "D1") {
      for (const phase of [0, 1, 2]) await persistence.cleanup(Date.now(), 20, phase);
    } else await persistence.cleanup(Date.now(), 20);
    expect(
      await rows(
        "select id from oauth_refresh_tokens where reference_id='fixture-grant' and revoked is null",
      ),
    ).toHaveLength(0);
  }, 30000);

  test(`${runtime}: account-wide invalidation blocks a pending refresh and stale consent generation`, async () => {
    const { requestRefresh, persistence } = await fixture(runtime);
    const original = persistence.claim.bind(persistence);
    persistence.claim = async (...args) => {
      const attempt = await original(...args);
      if (attempt) await persistence.invalidateUser("fixture-user", Date.now());
      return attempt;
    };
    expect((await requestRefresh()).status).toBe(400);
    expect(await persistence.userGeneration("fixture-user")).toBe(1);
    expect(
      await persistence.createGrant({
        id: "stale-consent",
        userId: "fixture-user",
        clientId: "fixture-client",
        resource,
        scopes,
        userGeneration: 0,
        createdAt: Date.now(),
        expiresAt: Date.now() + 10000,
      }),
    ).toBe(false);
    expect((await requestRefresh()).status).toBe(400);
  }, 30000);

  test(`${runtime}: a lost committed refresh response requires reconnection on retry`, async () => {
    const { requestRefresh, persistence, rows } = await fixture(runtime);
    const original = persistence.commit.bind(persistence);
    persistence.commit = async (...args) => {
      await original(...args);
      throw new Error("Fixture: response lost after commit");
    };
    const response = await requestRefresh();
    expect(response.status).toBe(400);
    expect((await response.json()).access_token).toBeUndefined();
    expect((await requestRefresh()).status).toBe(400);
    for (const row of await rows("select kind,token_hash from oauth_token_bindings"))
      expect(
        await persistence.authority(row.kind, row.token_hash, undefined, Date.now()),
      ).toBeNull();
  }, 30000);

  test(`${runtime}: wrong client/resource leave a valid grant intact`, async () => {
    const { requestRefresh, persistence } = await fixture(runtime);
    expect((await requestRefresh(undefined, { client_id: "different-client" })).status).toBe(400);
    expect(
      (await requestRefresh(undefined, { resource: "https://different.lace.test/mcp" })).status,
    ).toBe(400);
    expect(await persistence.grant("fixture-grant", Date.now())).not.toBeNull();
    expect((await requestRefresh()).status).toBe(200);
  }, 30000);

  test(`${runtime}: child expiry is bounded by the original grant and credentials stay hashed`, async () => {
    const { requestRefresh, persistence, rows, run } = await fixture(runtime);
    const expiry = Date.now() + 10000;
    await run(`update oauth_grants set expires_at=${expiry} where id='fixture-grant'`);
    const issued = await requestRefresh();
    expect(issued.status).toBe(200);
    const tokens = await issued.json();
    for (const row of await rows(
      "select token,expires_at from oauth_access_tokens union all select token,expires_at from oauth_refresh_tokens where revoked is null",
    )) {
      expect(row.expires_at).toBeLessThanOrEqual(expiry);
      expect([
        tokens.access_token,
        tokens.refresh_token,
        "fixture-only-refresh-credential",
      ]).not.toContain(row.token);
    }
    expect(
      await persistence.authority("access", digest(tokens.access_token), undefined, expiry),
    ).toBeNull();
    expect(tokens.expires_at * 1000).toBeLessThanOrEqual(expiry);
  }, 30000);
}

for (const runtime of ["SQLite", "D1"]) {
  test(`${runtime}: concurrent code exchanges cannot publish a second issuance`, async () => {
    const { auth, adapter, rows } = await fixture(runtime);
    await verifyCodeExchange((request) => auth.handler(request), adapter, true);
    expect(
      (await rows("select id from oauth_issuances where kind='code' and id<>'prior-issuance'"))
        .length,
    ).toBeLessThanOrEqual(1);
  }, 30000);

  test(`${runtime}: refresh replay still revokes after provider parent cleanup`, async () => {
    const { requestRefresh, rows, run, persistence } = await fixture(runtime);
    const parent = (await rows("select id from oauth_refresh_tokens"))[0].id;
    const response = await requestRefresh();
    expect(response.status).toBe(200);
    const tokens = await response.json();
    // The parent no longer has access-token children; durable bindings and the
    // consumed-input journal remain after provider-only cleanup.
    await run(`delete from oauth_refresh_tokens where id='${parent}'`);
    expect((await requestRefresh()).status).toBe(400);
    expect(
      await persistence.authority("access", digest(tokens.access_token), undefined, Date.now()),
    ).toBeNull();
    expect((await requestRefresh(tokens.refresh_token)).status).toBe(400);
  }, 30000);

  test(`${runtime}: expired pending attempts cannot resume after maintenance`, async () => {
    const { requestRefresh, persistence, run, rows } = await fixture(runtime);
    const original = persistence.claim.bind(persistence);
    persistence.claim = async (...args) => {
      const attempt = await original(...args);
      if (attempt) {
        await run(`update oauth_issuances set pending_expires_at=0 where id='${attempt.id}'`);
        await persistence.cleanup(Date.now(), 20, runtime === "D1" ? 0 : undefined);
      }
      return attempt;
    };
    expect((await requestRefresh()).status).toBe(400);
    expect((await rows("select state from oauth_issuances where kind='refresh'"))[0].state).toBe(
      "aborted",
    );
    expect((await requestRefresh()).status).toBe(400);
  }, 30000);

  test(`${runtime}: child-plus-binding failure rolls back its SQL batch and never leaks a driver error`, async () => {
    const { requestRefresh, persistence, run, rows } = await fixture(runtime);
    const original = persistence.prepare.bind(persistence);
    persistence.prepare = async (attempt, token, now) => {
      if (token.kind === "refresh") {
        // Force a real unique-binding failure in statement two after statement
        // one inserts a new provider row. The batch must roll back both.
        await run(
          "delete from oauth_refresh_tokens where token='" +
            digest("fixture-only-refresh-credential") +
            "'",
        );
        return original(
          attempt,
          { ...token, hash: digest("fixture-only-refresh-credential") },
          now,
        );
      }
      return original(attempt, token, now);
    };
    const response = await requestRefresh();
    expect(response.status).not.toBe(200);
    const body = await response.text();
    expect(body).not.toMatch(/SQLITE|D1_ERROR|oauth_token_bindings|constraint|select |insert /iu);
    expect(body).not.toContain("fixture-only-refresh-credential");
    expect(await rows("select id from oauth_refresh_tokens")).toHaveLength(0);
    expect((await rows("select state from oauth_issuances where kind='refresh'"))[0].state).toBe(
      "aborted",
    );
  }, 30000);
}

test("D1: guarded refresh remains inside the per-invocation SQL budget", async () => {
  const { requestRefresh, measurements } = await fixture("D1");
  expect((await requestRefresh()).status).toBe(200);
  expect(measurements).toHaveLength(1);
  expect(measurements[0]).toBeGreaterThan(0);
  expect(measurements[0]).toBeLessThanOrEqual(50);
}, 30000);

for (const runtime of ["SQLite", "D1"]) {
  test(`${runtime}: provider discovery advertises the tested authorization/token/registration paths`, async () => {
    const { auth } = await fixture(runtime);
    const response = await auth.handler(
      new Request(`${origin}/api/auth/.well-known/oauth-authorization-server`),
    );
    expect(response.status).toBe(200);
    const metadata = await response.json();
    expect(metadata.issuer).toBe(`${origin}/api/auth`);
    expect(metadata.authorization_endpoint).toBe(`${origin}/api/auth/oauth2/authorize`);
    expect(metadata.token_endpoint).toBe(`${origin}/api/auth/oauth2/token`);
    expect(metadata.registration_endpoint).toBe(`${origin}/api/auth/oauth2/register`);
    expect(metadata.revocation_endpoint).toBe(`${origin}/api/auth/oauth2/revoke`);
    expect(metadata.code_challenge_methods_supported).toEqual(["S256"]);
    expect(metadata.grant_types_supported.sort()).toEqual(["authorization_code", "refresh_token"]);
  }, 30000);
}

test("MCP argument JSON Schemas derive from canonical contracts including complete-draft envelopes", async () => {
  const { mcpToolArgumentSchemas, contractJsonSchemaOverride } =
    await import("../../../packages/contracts/dist/index.js");
  const { toJsonSchema } = await import("@valibot/to-json-schema");
  for (const [name, schema] of Object.entries(mcpToolArgumentSchemas)) {
    const json = toJsonSchema(schema, {
      errorMode: "ignore",
      overrideSchema: ({ valibotSchema }) => contractJsonSchemaOverride(valibotSchema),
    });
    expect(json.type).toBe("object");
    expect(json.additionalProperties).toBe(false);
    if (name === "save_draft") expect(json.required).toContain("expectedRevision");
    if (name === "create_entry" || name === "save_draft")
      expect(json.properties.fields.type).toBe("object");
    if (name === "list_entries") expect(json.properties.filters.type).toBe("array");
  }
});

for (const runtime of ["SQLite", "D1"]) {
  test(`${runtime}: owned connection management is session-only and excludes provider secrets`, async () => {
    const { OAuthConnectionUseCases } = await import("../../../packages/application/dist/index.js");
    const { attenuateActor } = await import("../../../packages/domain/dist/index.js");
    const { persistence } = await fixture(runtime);
    const useCases = new OAuthConnectionUseCases({
      connections: persistence,
      clock: { now: () => Date.now() },
    });
    for (const role of ["viewer", "editor", "admin"]) {
      const actor = { id: "fixture-user", role };
      const list = await useCases.list(actor, { limit: 50 });
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({ clientName: "Fixture", scopes, resource });
      expect(JSON.stringify(list)).not.toMatch(
        /tokenHash|inputHash|sessionId|clientSecret|fixture-only-refresh-credential/u,
      );
    }
    expect(await useCases.list({ id: "another-user", role: "admin" }, { limit: 50 })).toEqual([]);
    expect(await useCases.revoke({ id: "another-user", role: "admin" }, "fixture-grant")).toBe(
      false,
    );
    const delegated = attenuateActor(
      { id: "fixture-user", role: "admin" },
      { permissions: ["content:read"], operations: ["load"] },
    );
    expect(() => useCases.list(delegated, { limit: 50 })).toThrow(
      expect.objectContaining({ code: "AUTHORIZATION_DENIED" }),
    );
    expect(() => useCases.revoke(delegated, "fixture-grant")).toThrow(
      expect.objectContaining({ code: "AUTHORIZATION_DENIED" }),
    );
    expect(await useCases.revoke({ id: "fixture-user", role: "viewer" }, "fixture-grant")).toBe(
      true,
    );
    expect(await useCases.revoke({ id: "fixture-user", role: "viewer" }, "fixture-grant")).toBe(
      true,
    );
  }, 30000);
}

for (const runtime of ["SQLite", "D1"]) {
  for (const operation of [
    "disable",
    "password-reset",
    "sign-out-everywhere",
    "password-revoke-others",
    "session-revoke-others",
  ]) {
    test(`${runtime}: ${operation} invalidates OAuth with no feature flag dependency`, async () => {
      const { security, requestRefresh, persistence } = await fixture(runtime);
      const issued = await requestRefresh();
      expect(issued.status).toBe(200);
      const tokens = await issued.json();
      if (operation === "disable") {
        await security.updateUser({ userId: "fixture-user", disabled: true });
        await security.updateUser({ userId: "fixture-user", disabled: false });
      } else if (operation === "password-reset") {
        const reset = await security.issuePasswordReset({
          target: { userId: "fixture-user" },
          now: Date.now(),
        });
        expect(reset.status).toBe("issued");
        expect(
          (
            await security.confirmPasswordReset({
              token: reset.token,
              password: "replacement-password-for-fixture",
              now: Date.now(),
            })
          ).status,
        ).toBe("reset");
      } else if (operation === "sign-out-everywhere")
        await security.deleteUserSessions({ userId: "fixture-user" });
      else if (operation === "session-revoke-others")
        await security.deleteOtherSessions({
          userId: "fixture-user",
          keepSessionId: "current-session",
        });
      else
        expect(
          (
            await security.changePassword({
              userId: "fixture-user",
              currentPassword: password,
              newPassword: "replacement-password-for-fixture",
              now: Date.now(),
              keepSessionId: "current-session",
            })
          ).status,
        ).toBe("changed");
      expect(await persistence.userGeneration("fixture-user")).toBe(1);
      expect(
        await persistence.authority("access", digest(tokens.access_token), undefined, Date.now()),
      ).toBeNull();
      expect((await requestRefresh(tokens.refresh_token)).status).toBe(400);
    }, 30000);
  }

  test(`${runtime}: ordinary sign-out, non-revoking password changes and failed credentials preserve independent grants`, async () => {
    const { security, persistence, requestRefresh, run } = await fixture(runtime);
    const issued = await requestRefresh();
    const tokens = await issued.json();
    await run(
      "insert into session(id,token,user_id,expires_at,created_at,updated_at) values('browser','browser-session-verifier','fixture-user',9999999999999,1,1)",
    );
    expect(await security.deleteSession({ userId: "fixture-user", sessionId: "browser" })).toBe(
      true,
    );
    expect(
      (
        await security.changePassword({
          userId: "fixture-user",
          currentPassword: "wrong-password",
          newPassword: "new-password-value",
          keepSessionId: "current-session",
          now: Date.now(),
        })
      ).status,
    ).toBe("invalid_credentials");
    expect(
      (
        await security.changePassword({
          userId: "fixture-user",
          currentPassword: password,
          newPassword: "new-password-value",
          now: Date.now(),
        })
      ).status,
    ).toBe("changed");
    expect(await persistence.userGeneration("fixture-user")).toBe(0);
    expect(
      await persistence.authority("access", digest(tokens.access_token), undefined, Date.now()),
    ).not.toBeNull();
    expect((await requestRefresh(tokens.refresh_token)).status).toBe(200);
  }, 30000);
}

for (const runtime of ["SQLite", "D1"]) {
  test(`${runtime}: closed public registration profile and no client metadata fetch`, async () => {
    const { auth, adapter } = await fixture(runtime);
    const register = (metadata) =>
      auth.handler(
        new Request(`${origin}/api/auth/oauth2/register`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(metadata),
        }),
      );
    const valid = {
      client_name: "Local assistant",
      redirect_uris: ["http://127.0.0.1:4011/callback"],
    };
    for (const redirect of [
      "https://client.test/callback",
      "http://127.0.0.1:4011/callback",
      "org.example.client:/callback",
    ]) {
      const response = await register({
        ...valid,
        redirect_uris: [redirect],
        scope: "content:write offline_access",
      });
      expect(response.status).toBe(201);
      const client = await response.json();
      expect(client.client_id).toBeTypeOf("string");
      expect(client.client_secret).toBeUndefined();
      expect(client.token_endpoint_auth_method).toBe("none");
      expect(client.grant_types).toEqual(["authorization_code", "refresh_token"]);
      expect(client.resources).toEqual([resource]);
      const stored = await adapter.findOne({
        model: "oauthClient",
        where: [{ field: "clientId", value: client.client_id }],
      });
      expect(stored.skipConsent).not.toBe(true);
      expect(stored.requirePKCE).not.toBe(false);
    }
    for (const metadata of [
      { redirect_uris: ["https://*.client.test/cb"] },
      { redirect_uris: ["https://u:p@client.test/cb"] },
      { redirect_uris: ["https://client.test/cb#"] },
      { redirect_uris: ["http://client.test/cb"] },
      { redirect_uris: ["http://127.1/cb"] },
      { redirect_uris: ["javascript:alert(1)"] },
      { redirect_uris: Array(6).fill("https://client.test/cb") },
      { client_name: "x".repeat(121) },
      { grant_types: ["client_credentials"] },
      { response_types: ["token"] },
      { token_endpoint_auth_method: "client_secret_basic" },
      { scope: "openid" },
      { scope: "content:publish" },
      { resources: ["https://other.test/mcp"] },
      { logo_uri: "http://169.254.169.254/latest/meta-data" },
      { client_uri: "http://127.0.0.1/private" },
      { jwks_uri: "http://127.0.0.1/private" },
      { software_statement: "unsupported" },
      { skip_consent: true },
    ]) {
      const response = await register({ ...valid, ...metadata });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBeTypeOf("string");
    }
    // URL-shaped unknown client IDs cannot activate CIMD without an extension.
    const originalFetch = globalThis.fetch;
    let outbound = 0;
    globalThis.fetch = async () => {
      outbound += 1;
      throw new Error("Unexpected outbound fetch");
    };
    try {
      const result = await auth.handler(
        new Request(
          `${origin}/api/auth/oauth2/authorize?${new URLSearchParams({
            client_id: "http://127.0.0.1/private-metadata.json",
            response_type: "code",
            redirect_uri: valid.redirect_uris[0],
            resource,
            scope: "content:read",
            code_challenge: digest("verifier"),
            code_challenge_method: "S256",
          })}`,
          { headers: { accept: "application/json" } },
        ),
      );
      expect(result.status).toBe(200);
      const navigation = await result.json();
      expect(navigation.redirect).toBe(true);
      const destination = new URL(navigation.url);
      expect(destination.origin).toBe(origin);
      expect(destination.searchParams.get("error")).toBe("invalid_client");
      expect(outbound).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 30000);

  test(`${runtime}: OAuth profile rejects unsupported grants and expanded refresh scope`, async () => {
    const { auth, requestRefresh } = await fixture(runtime);
    for (const grant_type of [
      "client_credentials",
      "password",
      "implicit",
      "urn:ietf:params:oauth:grant-type:device_code",
    ]) {
      const response = await auth.handler(
        new Request(`${origin}/api/auth/oauth2/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ grant_type, client_id: "fixture-client" }),
        }),
      );
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("unsupported_grant_type");
    }
    const expanded = await requestRefresh(undefined, {
      scope: "content:read content:write offline_access",
    });
    expect(expanded.status).toBe(400);
    expect((await expanded.json()).error).toBe("invalid_scope");
  }, 30000);
}

test("OAuth metadata and canonical URLs cannot inherit request authority", async () => {
  const { mcpOAuthUrls, mcpAuthorizationMetadata, mcpResourceMetadata, normalizeMcpScopes } =
    await import("../../../packages/auth/dist/index.js");
  expect(mcpOAuthUrls(new URL(origin), true)).toEqual({ issuer: `${origin}/api/auth`, resource });
  expect(mcpOAuthUrls(new URL("http://localhost:3000"), false).resource).toBe(
    "http://localhost:3000/mcp",
  );
  for (const base of [
    "http://cms.test",
    "https://u:p@cms.test",
    "https://cms.test/path",
    "https://cms.test/?secret=x",
    "https://cms.test/#x",
  ]) {
    expect(() => mcpOAuthUrls(new URL(base), true)).toThrow("Invalid LACE_PUBLIC_BASE_URL");
  }
  expect(() => mcpOAuthUrls(new URL("http://localhost:3000"), true)).toThrow();
  expect(normalizeMcpScopes("content:write offline_access content:write")).toEqual([
    "content:read",
    "content:write",
    "offline_access",
  ]);
  expect(mcpAuthorizationMetadata(new URL(origin), true)).toMatchObject({
    issuer: `${origin}/api/auth`,
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["content:read", "content:write", "offline_access"],
  });
  expect(mcpResourceMetadata(new URL(origin), true)).toEqual({
    resource,
    authorization_servers: [`${origin}/api/auth`],
    scopes_supported: ["content:read", "content:write", "offline_access"],
    bearer_methods_supported: ["header"],
  });
});

for (const runtime of ["SQLite", "D1"]) {
  for (const override of [
    { client_id: "wrong-client" },
    { resource: "https://other.test/mcp" },
    { redirect_uri: "https://other.test/callback" },
    { code_verifier: "wrong-verifier" },
  ]) {
    test(`${runtime}: S256 code exchange rejects ${Object.keys(override)[0]} substitution`, async () => {
      const { auth, adapter } = await fixture(runtime);
      await verifyCodeExchange(auth.handler, adapter, false, override);
    }, 30000);
  }
  test(`${runtime}: authorization rejects callback, resource, scope and PKCE substitution`, async () => {
    const { auth } = await fixture(runtime);
    for (const [override, error] of [
      [{ redirect_uri: "https://attacker.test/cb" }, "invalid_redirect"],
      [{ resource: "https://other.test/mcp" }, "invalid_target"],
      [{ scope: "content:publish" }, "invalid_scope"],
      [{ code_challenge_method: "plain" }, "invalid_request"],
    ]) {
      const query = new URLSearchParams({
        client_id: "fixture-client",
        response_type: "code",
        redirect_uri: "http://127.0.0.1:4011/callback",
        resource,
        scope: "content:read",
        code_challenge: digest("verifier"),
        code_challenge_method: "S256",
        ...override,
      });
      const response = await auth.handler(
        new Request(`${origin}/api/auth/oauth2/authorize?${query}`, {
          headers: { accept: "application/json" },
        }),
      );
      if (response.status === 400) {
        expect((await response.json()).error).toBe(error);
      } else {
        expect(response.status).toBe(200);
        const navigation = await response.json();
        const destination = new URL(navigation.url);
        expect(destination.searchParams.get("error")).toBe(error);
        expect(destination.searchParams.has("code")).toBe(false);
        expect(destination.origin).not.toBe("https://attacker.test");
      }
    }
  }, 30000);
}

for (const runtime of ["SQLite", "D1"]) {
  test(`${runtime}: MCP bearer authority checks current account and consent/token ceilings`, async () => {
    const { createMcpActorResolver } = await import("../../../packages/auth/dist/index.js");
    const { canContentOperation } = await import("../../../packages/application/dist/index.js");
    const { adapter, persistence, requestRefresh, run } = await fixture(runtime);
    const resolver = createMcpActorResolver({
      origin: new URL(origin),
      production: true,
      adapter,
      persistence,
    });
    const resolve = (authorization, path = resource, scope) =>
      resolver.resolve(
        new Request(path, {
          headers: authorization ? { authorization } : {},
        }),
        scope,
      );
    const missing = await resolve();
    expect(missing.response.status).toBe(401);
    expect(missing.response.headers.get("www-authenticate")).toContain(
      `resource_metadata="${origin}/.well-known/oauth-protected-resource/mcp"`,
    );
    for (const credential of [
      "Bearer invalid",
      "Basic invalid",
      "Bearer one two",
      "Bearer fixture-only-refresh-credential",
    ]) {
      expect((await resolve(credential)).response.status).toBe(401);
    }
    const response = await requestRefresh();
    const tokens = await response.json();
    expect(response.status).toBe(200);
    const header = `Bearer ${tokens.access_token}`;
    expect((await resolve(header, `${resource}?access_token=invalid`)).response.status).toBe(401);
    for (const role of ["viewer", "editor", "admin"]) {
      await run(`update user set role='${role}' where id='fixture-user'`);
      const resolved = await resolve(header);
      expect(resolved.actor.role).toBe(role);
      expect(canContentOperation(resolved.actor, "load")).toBe(true);
      expect(canContentOperation(resolved.actor, "save")).toBe(false);
      expect(canContentOperation(resolved.actor, "publish")).toBe(false);
      expect(canContentOperation(resolved.actor, "delete")).toBe(false);
    }
    const insufficient = await resolve(header, resource, "content:write");
    expect(insufficient.response.status).toBe(403);
    expect(insufficient.response.headers.get("www-authenticate")).toContain(
      'error="insufficient_scope", scope="content:write"',
    );
    const validAuthority = await persistence.authority(
      "access",
      digest(tokens.access_token),
      undefined,
      Date.now(),
    );
    const invalidRoleResolver = createMcpActorResolver({
      origin: new URL(origin),
      production: true,
      adapter,
      persistence: { authority: async () => ({ ...validAuthority, role: "invalid" }) },
    });
    expect(
      (
        await invalidRoleResolver.resolve(
          new Request(resource, { headers: { authorization: header } }),
        )
      ).response.status,
    ).toBe(401);
    await run("update user set role='editor',disabled=1 where id='fixture-user'");
    expect((await resolve(header)).response.status).toBe(401);
    await run("update user set disabled=0 where id='fixture-user'");
    for (const [column, value] of [
      ["revoked", "1"],
      ["expires_at", "0"],
      ["resources", `'["https://other.test/mcp"]'`],
      ["user_id", "null"],
      ["reference_id", "'other-grant'"],
    ]) {
      const before = await adapter.findOne({
        model: "oauthAccessToken",
        where: [{ field: "token", value: digest(tokens.access_token) }],
      });
      await run(`update oauth_access_tokens set ${column}=${value}`);
      expect((await resolve(header)).response.status).toBe(401);
      await adapter.update({
        model: "oauthAccessToken",
        where: [{ field: "id", value: before.id }],
        update: before,
      });
    }
    expect((await resolve(header)).actor.id).toBe("fixture-user");
    await persistence.revokeConnection("fixture-user", "fixture-grant", Date.now());
    expect((await resolve(header)).response.status).toBe(401);
  }, 30000);

  test(`${runtime}: MCP write authority attenuates demoted roles and token downscoping`, async () => {
    const { createMcpActorResolver, createBetterAuthBoundary } =
      await import("../../../packages/auth/dist/index.js");
    const { canContentOperation } = await import("../../../packages/application/dist/index.js");
    const { adapter, persistence, requestRefresh, run, database, schema } = await fixture(runtime);
    await run(
      `update oauth_grants set scopes_json='["content:read","content:write","offline_access"]'`,
    );
    await run(
      `update oauth_refresh_tokens set scopes='["content:read","content:write","offline_access"]'`,
    );
    await run(
      `update oauth_clients set scopes='["content:read","content:write","offline_access"]'`,
    );
    await run("update user set role='admin' where id='fixture-user'");
    const response = await requestRefresh();
    expect(response.status).toBe(200);
    const tokens = await response.json();
    const resolver = createMcpActorResolver({
      origin: new URL(origin),
      production: true,
      adapter,
      persistence,
    });
    const request = () =>
      new Request(resource, { headers: { authorization: `Bearer ${tokens.access_token}` } });
    expect(canContentOperation((await resolver.resolve(request())).actor, "save")).toBe(true);
    expect(canContentOperation((await resolver.resolve(request())).actor, "publish")).toBe(false);
    await run("update user set role='viewer' where id='fixture-user'");
    expect(canContentOperation((await resolver.resolve(request())).actor, "save")).toBe(false);
    expect(canContentOperation((await resolver.resolve(request())).actor, "load")).toBe(true);
    // Provider token scopes can narrow a wider original consent ceiling.
    await run(`update oauth_access_tokens set scopes='["content:read"]'`);
    await run("update user set role='admin' where id='fixture-user'");
    expect(canContentOperation((await resolver.resolve(request())).actor, "save")).toBe(false);
    const browser = createBetterAuthBoundary({
      database,
      schema,
      origin: new URL(origin),
      production: true,
      secret: "fixture-only-secret-not-a-deployment-credential",
    });
    expect(await browser.actors.resolve(request())).toBeNull();
    expect(await browser.actors.sessionId(request())).toBeNull();
    expect(
      (
        await resolver.resolve(
          new Request(resource, { headers: { cookie: "better-auth.session_token=invalid" } }),
        )
      ).response.status,
    ).toBe(401);
    expect(
      (
        await resolver.resolve(
          new Request(resource, { headers: { authorization: "Bearer build-token" } }),
        )
      ).response.status,
    ).toBe(401);
  }, 30000);
}

test("MCP OAuth routes are a literal method/path allowlist", async () => {
  const { MCP_OAUTH_ROUTE_ALLOWLIST, isMcpOAuthRoute, MCP_DISCOVERY_PATHS } =
    await import("../../../packages/auth/dist/index.js");
  expect(MCP_OAUTH_ROUTE_ALLOWLIST).toHaveLength(7);
  expect(MCP_DISCOVERY_PATHS).toEqual([
    "/.well-known/oauth-authorization-server/api/auth",
    "/api/auth/.well-known/oauth-authorization-server",
    "/.well-known/oauth-protected-resource/mcp",
  ]);
  for (const [method, path] of MCP_OAUTH_ROUTE_ALLOWLIST) {
    expect(isMcpOAuthRoute(new Request(`${origin}${path}`, { method }))).toBe(true);
    expect(isMcpOAuthRoute(new Request(`${origin}${path}/`, { method }))).toBe(false);
    expect(isMcpOAuthRoute(new Request(`${origin}${path}`, { method: "DELETE" }))).toBe(false);
  }
  for (const path of [
    "/oauth2/introspect",
    "/oauth2/userinfo",
    "/oauth2/clients",
    "/oauth2/resources",
    "/update-user",
    "/change-password",
    "/sign-up/email",
  ]) {
    for (const method of ["GET", "POST"])
      expect(isMcpOAuthRoute(new Request(`${origin}/api/auth${path}`, { method }))).toBe(false);
  }
});

for (const runtime of ["SQLite", "D1"]) {
  test(`${runtime}: optional production OAuth boundary closes routes and resolves guarded credentials`, async () => {
    const { createBetterAuthBoundary, MCP_DISCOVERY_PATHS } =
      await import("../../../packages/auth/dist/index.js");
    const { database, schema, persistence } = await fixture(runtime);
    const settings = {
      database,
      schema,
      origin: new URL(origin),
      production: true,
      secret: "fixture-only-secret-not-a-deployment-credential",
    };
    const enabled = createBetterAuthBoundary({ ...settings, oauth: { persistence } });
    const disabled = createBetterAuthBoundary(settings);
    expect(disabled.mcp).toBeUndefined();
    for (const path of [
      ...MCP_DISCOVERY_PATHS,
      "/api/auth/oauth2/register",
      "/api/auth/oauth2/token",
      "/api/auth/oauth2/authorize",
      "/api/auth/oauth2/consent",
      "/api/auth/oauth2/continue",
      "/api/auth/oauth2/revoke",
    ]) {
      for (const method of ["GET", "POST", "HEAD", "DELETE"]) {
        expect((await disabled.fetch(new Request(`${origin}${path}`, { method }))).status).toBe(
          404,
        );
      }
    }
    for (const path of MCP_DISCOVERY_PATHS) {
      const response = await enabled.fetch(new Request(`${origin}${path}`));
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      const document = await response.json();
      expect(document.issuer ?? document.resource).toBe(
        path.includes("protected-resource") ? resource : `${origin}/api/auth`,
      );
      expect(
        (await enabled.fetch(new Request(`${origin}${path}`, { method: "POST" }))).status,
      ).toBe(404);
    }
    for (const path of [
      "/oauth2/introspect",
      "/oauth2/userinfo",
      "/oauth2/clients",
      "/oauth2/get-client",
      "/oauth2/resources",
      "/oauth2/consents",
      "/sign-up/email",
      "/change-password",
      "/list-sessions",
    ]) {
      for (const method of ["GET", "POST", "HEAD", "DELETE"])
        expect(
          (await enabled.fetch(new Request(`${origin}/api/auth${path}`, { method }))).status,
        ).toBe(404);
    }
    const registered = await enabled.fetch(
      new Request(`${origin}/api/auth/oauth2/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Public client",
          redirect_uris: ["http://127.0.0.1:4011/callback"],
        }),
      }),
    );
    expect(registered.status).toBe(201);
    expect((await registered.json()).client_secret).toBeUndefined();
    const token = await enabled.fetch(
      new Request(`${origin}/api/auth/oauth2/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: "fixture-client",
          refresh_token: "fixture-only-refresh-credential",
          resource,
        }),
      }),
    );
    expect(token.status).toBe(200);
    expect(token.headers.get("cache-control")).toBe("no-store");
    const tokens = await token.json();
    const bearer = new Request(resource, {
      headers: { authorization: `Bearer ${tokens.access_token}` },
    });
    expect((await enabled.mcp.resolve(bearer)).actor.id).toBe("fixture-user");
    expect(await enabled.actors.resolve(bearer)).toBeNull();
    const revoked = await enabled.fetch(
      new Request(`${origin}/api/auth/oauth2/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          token: tokens.access_token,
          client_id: "fixture-client",
          token_type_hint: "access_token",
        }),
      }),
    );
    expect(revoked.status).toBe(200);
    expect((await enabled.mcp.resolve(bearer)).response.status).toBe(401);
  }, 30000);

  test(`${runtime}: production OAuth boundary bounds streamed bodies and sanitizes failures`, async () => {
    const { createBetterAuthBoundary } = await import("../../../packages/auth/dist/index.js");
    const { database, schema, persistence } = await fixture(runtime);
    const boundary = createBetterAuthBoundary({
      database,
      schema,
      origin: new URL(origin),
      production: true,
      secret: "fixture-only-secret-not-a-deployment-credential",
      oauth: { persistence },
    });
    for (const [path, body, contentType] of [
      ["register", '{"redirect_uris":["https://user:secret@client.test/cb"]}', "application/json"],
      [
        "token",
        "grant_type=password&password=never-return-this",
        "application/x-www-form-urlencoded",
      ],
      [
        "token",
        "grant_type=refresh_token&client_id=one&client_id=two&refresh_token=never-return-this",
        "application/x-www-form-urlencoded",
      ],
      ["register", "x".repeat(8193), "application/json"],
    ]) {
      const response = await boundary.fetch(
        new Request(`${origin}/api/auth/oauth2/${path}`, {
          method: "POST",
          headers: { "content-type": contentType },
          body,
        }),
      );
      expect(response.status).toBe(400);
      const result = await response.text();
      expect(result).not.toMatch(/never-return-this|user:secret|stack|SQLITE|D1_ERROR/);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
  }, 30000);
}

let productionClientAddress = 1;
async function productionConsent(
  runtime,
  {
    role = "editor",
    scopes: requestedScopes = "content:read offline_access",
    signedIn = false,
  } = {},
) {
  const f = await fixture(runtime);
  await f.run(`update user set role='${role}' where id='fixture-user'`);
  await f.run(
    `update oauth_clients set scopes='["content:read","content:write","offline_access"]'`,
  );
  const { createBetterAuthBoundary } = await import("../../../packages/auth/dist/index.js");
  const clientAddress = `192.0.2.${productionClientAddress}`;
  const boundary = createBetterAuthBoundary({
    database: f.database,
    schema: f.schema,
    origin: new URL(origin),
    production: true,
    secret: "fixture-only-secret-not-a-deployment-credential",
    oauth: { persistence: f.persistence },
    clientAddress: () => clientAddress,
  });
  productionClientAddress += 1;
  const login = async () => {
    const response = await boundary.fetch(
      new Request(`${origin}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify({ email: "fixture@lace.test", password }),
      }),
    );
    expect(response.status).toBe(200);
    return response.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
  };
  let cookie = signedIn ? await login() : "";
  const verifier = "fixture-code-verifier-0123456789-abcdefghijklmnopqrstuvwxyz";
  const query = new URLSearchParams({
    client_id: "fixture-client",
    response_type: "code",
    redirect_uri: "http://127.0.0.1:4011/callback",
    resource,
    scope: requestedScopes,
    state: "production-state",
    code_challenge: digest(verifier),
    code_challenge_method: "S256",
  });
  let response = await boundary.fetch(
    new Request(`${origin}/api/auth/oauth2/authorize?${query}`, {
      headers: { cookie, accept: "application/json" },
    }),
  );
  expect(response.status).toBe(200);
  let target = new URL((await response.json()).url);
  expect([...target.searchParams.keys()]).toEqual(["mcpTransaction"]);
  if (!signedIn) {
    expect(target.pathname).toBe("/admin/sign-in");
    cookie = await login();
    response = await boundary.fetch(
      new Request(
        `${origin}/api/auth/oauth2/authorize?transaction=${target.searchParams.get("mcpTransaction")}`,
        {
          headers: { cookie, accept: "application/json" },
        },
      ),
    );
    expect(response.status).toBe(200);
    target = new URL((await response.json()).url);
  }
  expect(target.pathname).toBe("/admin/mcp/consent");
  const transaction = target.searchParams.get("mcpTransaction");
  const consent = (body, requestOrigin = origin, requestCookie = cookie) =>
    boundary.fetch(
      new Request(`${origin}/api/auth/oauth2/consent`, {
        method: "POST",
        headers: {
          cookie: requestCookie,
          origin: requestOrigin,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({ transaction, ...body }),
      }),
    );
  return { ...f, boundary, cookie, transaction, consent, verifier, login };
}

for (const runtime of ["SQLite", "D1"]) {
  for (const signedIn of [false, true]) {
    test(`${runtime}: production ${signedIn ? "session" : "login"} requires first consent before guarded code exchange`, async () => {
      const f = await productionConsent(runtime, { signedIn });
      expect(await f.rows("select id from oauth_grants where id<>'fixture-grant'")).toHaveLength(0);
      const details = await f.boundary.fetch(
        new Request(`${origin}/api/auth/oauth2/authorize?transaction=${f.transaction}`, {
          headers: { cookie: f.cookie, accept: "application/json" },
        }),
      );
      expect(details.status).toBe(200);
      expect(await details.json()).toEqual({
        transaction: f.transaction,
        clientName: "Fixture",
        callbackHostname: "127.0.0.1",
        scopes: ["content:read", "offline_access"],
        canWrite: true,
      });
      const approved = await f.consent({ accept: true });
      expect(approved.status).toBe(200);
      const callback = new URL((await approved.json()).url);
      expect(callback.origin).toBe("http://127.0.0.1:4011");
      expect(callback.searchParams.get("state")).toBe("production-state");
      const code = callback.searchParams.get("code");
      expect(code).toBeTypeOf("string");
      const exchanged = await f.boundary.fetch(
        new Request(`${origin}/api/auth/oauth2/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: "fixture-client",
            code,
            code_verifier: f.verifier,
            redirect_uri: "http://127.0.0.1:4011/callback",
            resource,
          }),
        }),
      );
      expect(exchanged.status).toBe(200);
      const tokens = await exchanged.json();
      expect(
        (
          await f.boundary.mcp.resolve(
            new Request(resource, { headers: { authorization: `Bearer ${tokens.access_token}` } }),
          )
        ).actor.id,
      ).toBe("fixture-user");
      expect((await f.consent({ accept: true })).status).toBe(400);
    }, 30000);
  }
  test(`${runtime}: production consent denial and cross-origin forgery issue no grants`, async () => {
    const f = await productionConsent(runtime);
    expect((await f.consent({ accept: true }, "https://attacker.test")).status).toBe(403);
    expect((await f.consent({ accept: true }, origin, "")).status).toBe(400);
    const denied = await f.consent({ accept: false });
    expect(denied.status).toBe(200);
    const callback = new URL((await denied.json()).url);
    expect(callback.searchParams.get("error")).toBe("access_denied");
    expect(callback.searchParams.has("code")).toBe(false);
    expect(await f.rows("select id from oauth_grants where id<>'fixture-grant'")).toHaveLength(0);
  }, 30000);
  test(`${runtime}: production consent rejects expanded scopes and viewer writes`, async () => {
    const f = await productionConsent(runtime, {
      role: "viewer",
      scopes: "content:write offline_access",
    });
    expect((await f.consent({ accept: true })).status).toBe(403);
    expect((await f.consent({ accept: true, scope: "content:read content:publish" })).status).toBe(
      400,
    );
    const readOnly = await f.consent({ accept: true, scope: "content:read offline_access" });
    expect(readOnly.status).toBe(200);
    const grant = (
      await f.rows("select scopes_json from oauth_grants where id<>'fixture-grant'")
    )[0];
    expect(JSON.parse(grant.scopes_json)).toEqual(["content:read", "offline_access"]);
  }, 30000);
  test(`${runtime}: production consent retains account generation and session binding`, async () => {
    const f = await productionConsent(runtime, { signedIn: true });
    // A new session for the same account cannot take over an existing transaction.
    expect((await f.consent({ accept: true }, origin, await f.login())).status).toBe(400);
    await f.persistence.invalidateUser("fixture-user", Date.now());
    expect((await f.consent({ accept: true })).status).toBe(400);
    expect(await f.rows("select id from oauth_grants where id<>'fixture-grant'")).toHaveLength(0);
  }, 30000);
}

for (const runtime of ["SQLite", "D1"]) {
  test(`${runtime}: consent transactions cannot be changed, expired or redirected externally`, async () => {
    const f = await productionConsent(runtime, { signedIn: true });
    for (const extra of [
      { redirect_uri: "https://attacker.test/cb" },
      { oauth_query: "redirect_uri=https://attacker.test" },
      { userId: "other" },
    ]) {
      expect((await f.consent({ accept: true, ...extra })).status).toBe(400);
    }
    const continuation = await f.boundary.fetch(
      new Request(`${origin}/api/auth/oauth2/continue`, {
        method: "POST",
        headers: {
          cookie: f.cookie,
          origin,
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({ transaction: f.transaction }),
      }),
    );
    expect(continuation.status).toBe(200);
    expect(new URL((await continuation.json()).url).origin).toBe(origin);
    const forged = await f.boundary.fetch(
      new Request(`${origin}/api/auth/oauth2/authorize?transaction=https://attacker.test`, {
        headers: { cookie: f.cookie },
      }),
    );
    expect(forged.status).toBe(400);
    await f.run("update verification set expires_at=0 where identifier like 'lace-mcp:%'");
    expect((await f.consent({ accept: true })).status).toBe(400);
    expect(await f.rows("select id from oauth_grants where id<>'fixture-grant'")).toHaveLength(0);
  }, 30000);
}
