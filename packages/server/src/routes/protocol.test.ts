// @ts-nocheck
// TODO(rf2): Type partial OAuth/MCP adapters, attenuated actors and protocol completion event fixtures.
import { expect, test } from "vitest";
import { sensitiveRequestLimit } from "../index.js";
import { OAuthConnectionUseCases } from "@lacecms/application";
import { actorId, unixMilliseconds } from "@lacecms/domain";

import { admin, fixture, json } from "../test-support/app-harness.js";

test("unexpected MCP and OAuth failures keep the protocol server_error body", async () => {
  const fail = async () => {
    throw new Error("unexpected failure");
  };
  const { app } = await fixture({
    mcpEnabled: true,
    mcp: { resolve: async () => ({ actor: admin }), fetch: fail },
    auth: { fetch: fail },
  });
  for (const path of ["/mcp", "/api/auth/oauth2/token"]) {
    const response = await app.request(`https://lace.test${path}`);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "server_error" });
  }
  const response = await app.request("https://lace.test/api/auth/session");
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
  });
});

test("account MCP connection routes keep ownership, CSRF, strict bodies and safe projections", async () => {
  const now = 1800000000000;
  const calls = [];
  const records = ["admin", "viewer"].map((userId) => ({
    id: `connection-${userId}`,
    userId,
    clientId: "private-client-id",
    clientName: "Assistant",
    resource: "https://lace.test/mcp",
    scopes: ["content:read", "offline_access"],
    generation: 0,
    userGeneration: 0,
    createdAt: now,
    expiresAt: now + 100000,
    revokedAt: null,
  }));
  const connections = new OAuthConnectionUseCases({
    clock: { now: () => unixMilliseconds(now) },
    connections: {
      listConnections: async (userId, after, limit) => {
        calls.push({ userId, after, limit });
        return records.filter((r) => r.userId === userId);
      },
      revokeConnection: async (userId, id) => {
        const row = records.find((r) => r.userId === userId && r.id === id);
        if (!row) return false;
        row.revokedAt = now;
        return true;
      },
      invalidateUser: async () => {},
    },
  });
  for (const role of ["admin", "editor", "viewer"]) {
    const { app } = await fixture({
      actor: { id: actorId(role), role },
      oauthConnections: connections,
    });
    const capabilities = await app.request("/api/v1/account/capabilities");
    expect(await capabilities.json()).toEqual({ mcpEnabled: true });
    const list = await app.request("https://lace.test/api/v1/account/mcp-connections?limit=20");
    expect(list.status).toBe(200);
    expect(list.headers.get("cache-control")).toBe("no-store");
    const dto = await list.json();
    expect(dto.items).toHaveLength(role === "editor" ? 0 : 1);
    expect(JSON.stringify(dto)).not.toMatch(
      /private-client-id|userGeneration|generation|userId|token|secret/,
    );
    expect(calls.at(-1)).toEqual({ userId: role, limit: 20 });
  }
  const { app } = await fixture({
    actor: { id: actorId("viewer"), role: "viewer" },
    oauthConnections: connections,
  });
  const revoke = (id, origin = "https://lace.test", body = {}) =>
    app.request(`https://lace.test/api/v1/account/mcp-connections/${id}/revoke`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  expect((await revoke("connection-admin")).status).toBe(404);
  expect(records[0].revokedAt).toBeNull();
  expect((await revoke("connection-viewer", "https://attacker.test")).status).toBe(403);
  expect((await revoke("connection-viewer", "https://lace.test", { accept: true })).status).toBe(
    422,
  );
  expect(records[1].revokedAt).toBeNull();
  expect((await revoke("connection-viewer")).status).toBe(204);
  expect((await revoke("connection-viewer")).status).toBe(204);
  expect(records[1].revokedAt).toBe(now);
  for (const query of ["limit=51", "limit=0", "limit=1&unknown=x"])
    expect(
      (await app.request(`https://lace.test/api/v1/account/mcp-connections?${query}`)).status,
    ).toBe(422);
});

test("disabled and anonymous MCP account routes do not disclose connections", async () => {
  const disabled = await fixture();
  expect(await (await disabled.app.request("/api/v1/account/capabilities")).json()).toEqual({
    mcpEnabled: false,
  });
  for (const method of ["GET", "POST", "HEAD", "DELETE"]) {
    expect(
      (await disabled.app.request("https://lace.test/api/v1/account/mcp-connections", { method }))
        .status,
    ).toBe(404);
    expect(
      (
        await disabled.app.request(
          "https://lace.test/api/v1/account/mcp-connections/connection/revoke",
          { method },
        )
      ).status,
    ).toBe(404);
  }
  const anonymous = await fixture({ resolveActor: async () => null });
  expect((await anonymous.app.request("/api/v1/account/capabilities")).status).toBe(403);
});

test("MCP routing preserves protocol responses, actor rate context and one safe completion log", async () => {
  const requests = [];
  const scopes = [];
  const { app, logs } = await fixture({
    mcpEnabled: true,
    mcp: {
      resolve: async (_request, scope) => {
        scopes.push(scope);
        return { actor: admin };
      },
      fetch: async (_request, actor, completed) => {
        expect(actor.id).toBe("admin");
        completed({ tool: "save_draft", outcome: "success" });
        return new Response('{"jsonrpc":"2.0","result":{}}', {
          headers: { "content-type": "application/json" },
        });
      },
    },
    rateLimiter: {
      check: async (input) => {
        requests.push(input);
        return true;
      },
    },
  });
  const response = await app.request("https://lace.test/mcp?private-query=must-not-log", {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://lace.test" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "save_draft", arguments: { secret: "must-not-log" } },
    }),
  });
  expect(response.status).toBe(200);
  expect(response.headers.get("x-request-id")).toBeTypeOf("string");
  expect(response.headers.get("content-type")).toBe("application/json");
  expect(scopes).toEqual(["content:write"]);
  expect(requests[0].actor.id).toBe("admin");
  expect(logs).toHaveLength(1);
  expect(logs[0]).toMatchObject({
    actorId: "admin",
    tool: "save_draft",
    outcome: "success",
    path: "/mcp",
    status: 200,
  });
  expect(JSON.stringify(logs)).not.toContain("must-not-log");
});

test("MCP disabled variants, host/origin, size, OAuth challenge and rate failures stay outside SPA", async () => {
  const disabled = await fixture();
  for (const path of [
    "/mcp",
    "/mcp/",
    "/.well-known/oauth-protected-resource/mcp",
    "/.well-known/oauth-authorization-server/api/auth",
    "/api/auth/oauth2/token",
    "/admin/mcp/consent",
  ]) {
    for (const method of ["GET", "POST", "HEAD", "DELETE", "OPTIONS"])
      expect((await disabled.app.request(`https://lace.test${path}`, { method })).status).toBe(404);
  }
  let calls = 0;
  const mcp = {
    resolve: async () => {
      calls += 1;
      return {
        response: new Response(null, {
          status: 401,
          headers: {
            "www-authenticate":
              'Bearer resource_metadata="https://lace.test/.well-known/oauth-protected-resource/mcp"',
          },
        }),
      };
    },
    fetch: async () => {
      throw new Error("must not run");
    },
  };
  const enabled = await fixture({ mcpEnabled: true, mcp, maxBodyBytes: 128 });
  expect((await enabled.app.request("https://attacker.test/mcp")).status).toBe(403);
  expect(
    (
      await enabled.app.request("https://lace.test/mcp", {
        headers: { origin: "https://attacker.test" },
      })
    ).status,
  ).toBe(403);
  expect(
    (await enabled.app.request("https://lace.test/mcp", { headers: { host: "attacker.test" } }))
      .status,
  ).toBe(403);
  expect(
    (await enabled.app.request("https://lace.test/mcp", { method: "POST", body: "x".repeat(129) }))
      .status,
  ).toBe(413);
  expect(calls).toBe(0);
  const missing = await enabled.app.request("https://lace.test/mcp");
  expect(missing.status).toBe(401);
  expect(missing.headers.get("www-authenticate")).toContain("resource_metadata");
  const limited = await fixture({
    mcpEnabled: true,
    mcp: { ...mcp, resolve: async () => ({ actor: admin }) },
    rateLimiter: { check: async () => ({ allowed: false, retryAfterSeconds: 17 }) },
  });
  const rate = await limited.app.request("https://lace.test/mcp");
  expect(rate.status).toBe(429);
  expect(rate.headers.get("retry-after")).toBe("17");
  expect(await rate.json()).toEqual({ error: "temporarily_unavailable" });
});

test("OAuth rate routing separates registration, token/client address, MCP user and owned revoke", async () => {
  const { sensitiveRequestSubject } = await import("../index.js");
  expect(sensitiveRequestLimit("POST", "/api/auth/oauth2/register")).toEqual({
    operation: "oauth-register",
    scope: "client",
  });
  expect(sensitiveRequestLimit("POST", "/api/auth/oauth2/token")).toEqual({
    operation: "oauth-token",
    scope: "client",
  });
  expect(sensitiveRequestLimit("POST", "/api/v1/account/mcp-connections/id/revoke")).toEqual({
    operation: "oauth-revoke",
    scope: "actor",
  });
  expect(sensitiveRequestLimit("POST", "/mcp")).toEqual({ operation: "mcp", scope: "actor" });
  const limit = sensitiveRequestLimit("POST", "/api/auth/oauth2/token");
  const request = new Request("https://lace.test/api/auth/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: "client-a" }),
  });
  expect(await sensitiveRequestSubject(limit, request, "192.0.2.1")).toBe(
    '["192.0.2.1","client-a"]',
  );
});

test("MCP flag parser accepts only absent and exact string booleans", async () => {
  const { parseMcpEnabled } = await import("../index.js");
  expect(parseMcpEnabled(undefined)).toBe(false);
  expect(parseMcpEnabled("false")).toBe(false);
  expect(parseMcpEnabled("true")).toBe(true);
  for (const value of [null, true, false, 1, "1", "TRUE", "", " private-value "]) {
    expect(() => parseMcpEnabled(value)).toThrow("Invalid LACE_MCP_ENABLED.");
  }
});

test("settings MCP summary follows configuration, not request forwarding headers", async () => {
  for (const mcpEnabled of [true, false]) {
    const { app } = await fixture({ mcpEnabled, publicBaseUrl: "http://127.0.0.1:54321/base/" });
    const result = await json(app, "/api/v1/admin/settings/status", {
      headers: {
        forwarded: "host=attacker.test;proto=https",
        "x-forwarded-host": "attacker.test",
        "x-forwarded-proto": "https",
      },
    });
    expect(result.response.status).toBe(200);
    expect(result.body.mcp).toEqual({
      enabled: mcpEnabled,
      endpoint: "http://127.0.0.1:54321/mcp",
    });
  }
  for (const token of ["mcp-token", "build-token"]) {
    const { app } = await fixture({ actor: null });
    const result = await json(app, "/api/v1/admin/settings/status", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(result.response.status).toBe(403);
    expect(result.body).not.toHaveProperty("mcp");
  }
  const { app } = await fixture({ publicBaseUrl: null });
  const missing = await json(app, "/api/v1/admin/settings/status");
  expect(missing.response.status).toBe(500);
  expect(missing.body).not.toHaveProperty("mcp");
  expect(JSON.stringify(missing.body)).not.toContain("Canonical public URL");
});

test("MCP publish calls require the publication scope before handler work and logs omit bearer credentials", async () => {
  let calls = 0;
  const scopes = [];
  const f = await fixture({
    mcpEnabled: true,
    maxBodyBytes: 1024,
    mcp: {
      resolve: async (_request, scope) => {
        scopes.push(scope);
        return {
          response: new Response(null, {
            status: 403,
            headers: { "www-authenticate": `Bearer error="insufficient_scope", scope="${scope}"` },
          }),
        };
      },
      fetch: async () => {
        calls++;
        throw new Error("must not reach MCP");
      },
    },
  });
  const response = await f.app.request("https://lace.test/mcp", {
    method: "POST",
    headers: { authorization: "Bearer private-publish-token", "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "publish_entry", arguments: { entryId: "missing", expectedRevision: 1 } },
    }),
  });
  expect(response.status).toBe(403);
  expect(response.headers.get("www-authenticate")).toContain('scope="content:publish"');
  expect(scopes).toEqual(["content:publish"]);
  expect(calls).toBe(0);
  expect(JSON.stringify(f.logs)).not.toContain("private-publish-token");
});
