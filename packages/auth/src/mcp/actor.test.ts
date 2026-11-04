import type { OAuthAuthority, OAuthGrant, OAuthIssuancePersistence } from "@lacecms/application";
import { hasPermission } from "@lacecms/domain";
import type { Role } from "@lacecms/domain";
import { expect, test } from "vitest";
import { present } from "../test-support/assertions.js";
import { createMcpActorResolver } from "./actor.js";

/** The resolver reads only `authority`, so the fake implements that member alone. */
function authorityPersistence(authority: OAuthAuthority): OAuthIssuancePersistence {
  const persistence: Pick<OAuthIssuancePersistence, "authority"> = {
    authority: async () => authority,
  };
  return persistence as OAuthIssuancePersistence;
}

test("publication tokens intersect the consent ceiling and current role", async () => {
  const roles: readonly Role[] = ["admin", "editor", "viewer"];
  for (const role of roles) {
    for (const scopes of [
      ["content:read"],
      ["content:read", "content:write"],
      ["content:read", "content:write", "content:publish"],
    ]) {
      const expiresAt = Date.now() + 60000;
      const grant: OAuthGrant = {
        id: "grant",
        userId: "user",
        clientId: "client",
        resource: "https://cms.test/mcp",
        scopes,
        generation: 1,
        userGeneration: 1,
        createdAt: 0,
        expiresAt,
        revokedAt: null,
      };
      const token = {
        id: "token",
        referenceId: "grant",
        userId: "user",
        clientId: "client",
        expiresAt: new Date(expiresAt),
        resources: [grant.resource],
        scopes: [...scopes, "content:publish"],
      };
      const resolver = createMcpActorResolver({
        origin: new URL("https://cms.test"),
        production: true,
        persistence: authorityPersistence({ role, grant, providerId: "token", expiresAt }),
        adapter: { findOne: async <T>() => token as T },
      });
      const request = new Request(grant.resource, {
        headers: { authorization: "Bearer fixture-token" },
      });
      const resolved = await resolver.resolve(request, "content:publish");
      if (!scopes.includes("content:publish")) {
        const response = present(resolved.response);
        expect(response.status).toBe(403);
        expect(response.headers.get("www-authenticate")).toContain('scope="content:publish"');
      } else {
        const actor = present(resolved.actor);
        expect(hasPermission(actor, "content:publish")).toBe(role === "admin");
        expect(present(actor.authority).operations).toContain("publish");
        expect(present(actor.authority).operations).not.toContain("unpublish");
      }
    }
  }
});
