// @ts-nocheck
// TODO(rf2): Type partial OAuth/import security adapters, role matrices and resolver result narrowing.
import { expect, test } from "vitest";
import { packageName } from "./index.js";

test("exports its package identity", () => expect(packageName).toBe("@lacecms/auth"));

test("publication scopes normalize in canonical order and both metadata documents advertise them", async () => {
  const { normalizeMcpScopes, mcpAuthorizationMetadata, mcpResourceMetadata } =
    await import("./index.js");
  expect(normalizeMcpScopes("content:publish offline_access content:publish")).toEqual([
    "content:read",
    "content:write",
    "content:publish",
    "offline_access",
  ]);
  expect(normalizeMcpScopes("content:write")).toEqual(["content:read", "content:write"]);
  expect(normalizeMcpScopes("content:read")).toEqual(["content:read"]);
  for (const scope of ["offline_access", "content:delete", "content:publish unknown", ""])
    expect(() => normalizeMcpScopes(scope)).toThrow();
  for (const metadata of [mcpAuthorizationMetadata, mcpResourceMetadata])
    expect(metadata(new URL("https://cms.test"), true).scopes_supported).toEqual([
      "content:read",
      "content:write",
      "content:publish",
      "offline_access",
    ]);
});

test("publication tokens intersect the consent ceiling and current role", async () => {
  const { createMcpActorResolver } = await import("./index.js");
  const { hasPermission } = await import("@lacecms/domain");
  for (const role of ["admin", "editor", "viewer"]) {
    for (const scopes of [
      ["content:read"],
      ["content:read", "content:write"],
      ["content:read", "content:write", "content:publish"],
    ]) {
      const grant = {
        id: "grant",
        userId: "user",
        clientId: "client",
        resource: "https://cms.test/mcp",
        scopes,
      };
      const resolver = createMcpActorResolver({
        origin: new URL("https://cms.test"),
        production: true,
        persistence: { authority: async () => ({ role, grant, providerId: "token" }) },
        adapter: {
          findOne: async () => ({
            id: "token",
            referenceId: "grant",
            userId: "user",
            clientId: "client",
            expiresAt: new Date(Date.now() + 60000),
            resources: [grant.resource],
            scopes: [...scopes, "content:publish"],
          }),
        },
      });
      const request = new Request(grant.resource, {
        headers: { authorization: "Bearer fixture-token" },
      });
      const resolved = await resolver.resolve(request, "content:publish");
      if (!scopes.includes("content:publish")) {
        expect(resolved.response.status).toBe(403);
        expect(resolved.response.headers.get("www-authenticate")).toContain(
          'scope="content:publish"',
        );
      } else {
        expect(hasPermission(resolved.actor, "content:publish")).toBe(role === "admin");
        expect(resolved.actor.authority.operations).toContain("publish");
        expect(resolved.actor.authority.operations).not.toContain("unpublish");
      }
    }
  }
});

test("import tokens resolve the creator's current role under a write-only ceiling", async () => {
  const { createImportActorResolver } = await import("./index.js");
  const { hasPermission } = await import("@lacecms/domain");
  const { canContentOperation } = await import("@lacecms/application");
  const tokens = new Map([
    ["import-token", { role: "admin", capabilities: ["content:import"] }],
    ["publish-token", { role: "admin", capabilities: ["content:import", "content:publish"] }],
    ["demoted-token", { role: "editor", capabilities: ["content:import", "content:publish"] }],
    ["broken-role", { role: "owner", capabilities: ["content:import"] }],
  ]);
  const presented = [];
  const resolver = createImportActorResolver({
    now: () => 42,
    origin: new URL("https://cms.test"),
    production: true,
    security: {
      async resolveImportToken({ now, token }) {
        presented.push([now, token]);
        const value = tokens.get(token);
        return value === undefined
          ? null
          : {
              creator: { id: "admin-1", role: value.role },
              token: { capabilities: value.capabilities, id: token },
            };
      },
    },
  });
  const request = (authorization, query = "") =>
    new Request(`https://cms.test/api/v1/admin/media${query}`, {
      headers: authorization === undefined ? {} : { authorization, cookie: "session=valid" },
    });

  const plain = await resolver.resolve(request("Bearer import-token"));
  expect(plain.actor).toMatchObject({ id: "admin-1", role: "admin" });
  expect(plain.token.id).toBe("import-token");
  for (const permission of ["content:read", "content:write", "media:write"])
    expect(hasPermission(plain.actor, permission)).toBe(true);
  for (const permission of ["content:publish", "users:manage", "settings:manage"])
    expect(hasPermission(plain.actor, permission)).toBe(false);
  for (const operation of ["discoverModels", "list", "load", "create", "save"])
    expect(canContentOperation(plain.actor, operation)).toBe(true);
  for (const operation of ["publish", "unpublish", "delete", "revertDraft", "duplicate"])
    expect(canContentOperation(plain.actor, operation)).toBe(false);

  const publisher = await resolver.resolve(request("Bearer publish-token"));
  expect(hasPermission(publisher.actor, "content:publish")).toBe(true);
  expect(canContentOperation(publisher.actor, "publish")).toBe(true);
  expect(canContentOperation(publisher.actor, "unpublish")).toBe(false);

  // A demoted creator keeps writing but loses publication through the role.
  const demoted = await resolver.resolve(request("Bearer demoted-token"));
  expect(hasPermission(demoted.actor, "content:write")).toBe(true);
  expect(canContentOperation(demoted.actor, "publish")).toBe(false);

  presented.length = 0;
  for (const value of [
    undefined,
    "Basic import-token",
    "Bearer",
    "Bearer  import-token",
    "Bearer import-token extra",
    `Bearer ${"a".repeat(4097)}`,
    "Bearer unknown",
    "Bearer broken-role",
  ])
    expect(await resolver.resolve(request(value))).toBeNull();
  expect(
    await resolver.resolve(request("Bearer import-token", "?access_token=import-token")),
  ).toBeNull();
  expect(presented).toEqual([
    [42, "unknown"],
    [42, "broken-role"],
  ]);

  // Unsafe methods refuse an explicit foreign Origin; reads and origin-less calls proceed.
  const unsafe = (origin) =>
    new Request("https://cms.test/api/v1/admin/entries/e/draft", {
      method: "PUT",
      headers: { authorization: "Bearer import-token", ...(origin ? { origin } : {}) },
    });
  expect(await resolver.resolve(unsafe("https://evil.example"))).toBeNull();
  expect(await resolver.resolve(unsafe("null"))).toBeNull();
  expect(await resolver.resolve(unsafe("https://cms.test"))).not.toBeNull();
  expect(await resolver.resolve(unsafe())).not.toBeNull();
  const crossSiteRead = new Request("https://cms.test/api/v1/admin/media", {
    headers: { authorization: "Bearer import-token", origin: "https://evil.example" },
  });
  expect(await resolver.resolve(crossSiteRead)).not.toBeNull();
});
