import { expect, test } from "vitest";
import { openMcpRuntime } from "./runtime.mjs";
for (const kind of ["SQLite", "D1"]) {
  test(`${kind}: enabled production SDK authority follows roles, rotation, owned revoke and account lifecycle`, async () => {
    const f = await openMcpRuntime(kind);
    const clients = [];
    const connect = async (tokens) => {
      const client = await f.connect(tokens);
      clients.push(client);
      return client;
    };
    const refresh = (tokens) =>
      f.fetch(
        new Request(`${f.origin}/api/auth/oauth2/token`, {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "refresh_token",
            client_id: f.clientId,
            refresh_token: tokens.refresh_token,
            resource: `${f.origin}/mcp`,
          }),
        }),
      );
    let stage = "initial";
    try {
      await f.login();
      const tokens = await f.authorize();
      const writer = await connect(tokens);
      expect((await writer.listTools()).tools).toHaveLength(5);
      expect(
        (await f.fetch(new Request(`${f.origin}/mcp`, { headers: { cookie: f.cookie } }))).status,
      ).toBe(401);
      expect(
        (
          await f.fetch(
            new Request(`${f.origin}/api/v1/admin/content-models`, {
              headers: { authorization: `Bearer ${tokens.access_token}` },
            }),
          )
        ).status,
      ).toBe(403);
      const build = await f.rest("/api/v1/admin/api-tokens", {
        method: "POST",
        json: { name: "Fixture build" },
      });
      expect(build.response.status).toBe(201);
      expect(
        (
          await f.fetch(
            new Request(`${f.origin}/mcp`, {
              headers: { authorization: `Bearer ${build.body.token}` },
            }),
          )
        ).status,
      ).toBe(401);
      // Keep another administrator so role/disable orchestration retains its existing last-admin guard.
      await f.run(
        "insert into user(id,name,email,email_verified,role,disabled,created_at,updated_at) values ('other-admin','Other','other@lace.test',1,'admin',0,1,1)",
      );
      await f.runtime.security.updateUser({ userId: f.admin.id, role: "viewer" });
      expect((await writer.listTools()).tools).toHaveLength(3);
      await expect(
        writer.callTool({
          name: "save_draft",
          arguments: {
            entryId: "missing",
            title: "x",
            fields: {},
            blocks: [],
            expectedRevision: 1,
          },
        }),
      ).rejects.toThrow();
      stage = "read-consent";
      const readTokens = await f.authorize(false);
      const reader = await connect(readTokens);
      await f.runtime.security.updateUser({ userId: f.admin.id, role: "admin" });
      expect((await reader.listTools()).tools).toHaveLength(3);
      const scopeFailure = await f.fetch(
        new Request(`${f.origin}/mcp`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${readTokens.access_token}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name: "create_entry", arguments: {} },
          }),
        }),
      );
      expect(scopeFailure.status).toBe(403);
      expect(scopeFailure.headers.get("www-authenticate")).toContain('error="insufficient_scope"');
      stage = "rotation";
      const rotated = await refresh(tokens);
      expect(rotated.status).toBe(200);
      const renewed = await connect(await rotated.json());
      expect((await renewed.listTools()).tools).toHaveLength(5);
      expect((await refresh(tokens)).status).toBe(400);
      await expect(renewed.listTools()).rejects.toThrow(/invalid_token/);
      expect((await reader.listTools()).tools).toHaveLength(3);
      stage = "owned-revoke";
      const before = new Set(
        (await f.rest("/api/v1/account/mcp-connections")).body.items.map((item) => item.id),
      );
      stage = "new-grant";
      const revokeTokens = await f.authorize();
      const revokeClient = await connect(revokeTokens);
      const connections = await f.rest("/api/v1/account/mcp-connections");
      const owned = connections.body.items.find((item) => !before.has(item.id));
      expect(owned).toBeDefined();
      const revoked = await f.rest(`/api/v1/account/mcp-connections/${owned.id}/revoke`, {
        method: "POST",
        json: {},
      });
      expect(revoked.response.status).toBe(204);
      await expect(revokeClient.listTools()).rejects.toThrow(/invalid_token/);
      expect((await refresh(revokeTokens)).status).toBe(400);
      stage = "ordinary-sign-out";
      // Ordinary browser sign-out does not revoke an independent read grant.
      expect(
        (await f.rest("/api/auth/sign-out", { method: "POST", json: {} })).response.status,
      ).toBe(200);
      expect((await reader.listTools()).tools).toHaveLength(3);
      await f.login();
      stage = "disable-grant";
      const disabledTokens = await f.authorize();
      const disabledClient = await connect(disabledTokens);
      await f.runtime.security.updateUser({ userId: f.admin.id, disabled: true });
      await expect(disabledClient.listTools()).rejects.toThrow(/invalid_token/);
      expect((await refresh(disabledTokens)).status).toBe(400);
      await f.runtime.security.updateUser({ userId: f.admin.id, disabled: false });
      await expect(disabledClient.listTools()).rejects.toThrow(/invalid_token/);
      expect(JSON.stringify(f.logs)).not.toMatch(
        /access_token|refresh_token|code_verifier|Fixture build/,
      );
    } catch (error) {
      throw new Error(`${kind} lifecycle stage: ${stage}`, { cause: error });
    } finally {
      for (const client of clients) {
        try {
          await client.close();
        } catch {
          /* Revoked credentials cannot send the SDK close request. */
        }
      }
      await f.close();
    }
  }, 30000);
  test(`${kind}: disabled production runtime closes all MCP methods while browser REST still works`, async () => {
    const f = await openMcpRuntime(kind, { enabled: false });
    try {
      await f.login();
      expect((await f.rest("/api/v1/admin/content-models")).response.status).toBe(200);
      expect((await f.rest("/api/v1/account/capabilities")).body).toEqual({ mcpEnabled: false });
      for (const path of [
        "/mcp",
        "/.well-known/oauth-protected-resource/mcp",
        "/.well-known/oauth-authorization-server/api/auth",
        "/api/auth/oauth2/token",
        "/api/auth/oauth2/register",
        "/api/v1/account/mcp-connections",
        "/admin/mcp/consent",
      ]) {
        for (const method of ["GET", "POST", "DELETE", "HEAD", "OPTIONS"])
          expect((await f.fetch(new Request(`${f.origin}${path}`, { method }))).status).toBe(404);
      }
    } finally {
      await f.close();
    }
  }, 30000);
}
