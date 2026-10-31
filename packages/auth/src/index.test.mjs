import { expect, test } from "vitest";
import { packageName } from "../dist/index.js";

test("exports its package identity", () => expect(packageName).toBe("@lacecms/auth"));

test("publication scopes normalize in canonical order and both metadata documents advertise them", async () => {
  const { normalizeMcpScopes, mcpAuthorizationMetadata, mcpResourceMetadata } =
    await import("../dist/index.js");
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
  const { createMcpActorResolver } = await import("../dist/index.js");
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
