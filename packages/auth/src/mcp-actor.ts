import type { DBAdapter } from "better-auth";
import type { OAuthIssuancePersistence } from "@lacecms/application";
import { actorId, attenuateActor, type Actor, type Permission } from "@lacecms/domain";
import { mcpOAuthUrls } from "./mcp-oauth.js";
import { oauthCredentialHash } from "./oauth-guard.js";

export const MCP_OAUTH_ROUTE_ALLOWLIST: readonly (readonly [string, string])[] = Object.freeze(
  (
    [
      ["GET", "/api/auth/oauth2/authorize"],
      ["POST", "/api/auth/oauth2/authorize"],
      ["POST", "/api/auth/oauth2/consent"],
      ["POST", "/api/auth/oauth2/continue"],
      ["POST", "/api/auth/oauth2/token"],
      ["POST", "/api/auth/oauth2/register"],
      ["POST", "/api/auth/oauth2/revoke"],
    ] satisfies [string, string][]
  ).map((route) => Object.freeze(route)),
);

export function isMcpOAuthRoute(request: Request): boolean {
  const path = new URL(request.url).pathname;
  return MCP_OAUTH_ROUTE_ALLOWLIST.some(
    ([method, pathname]) => method === request.method && path === pathname,
  );
}

export const MCP_DISCOVERY_PATHS = Object.freeze([
  "/.well-known/oauth-authorization-server/api/auth",
  "/api/auth/.well-known/oauth-authorization-server",
  "/.well-known/oauth-protected-resource/mcp",
]);

export type McpActorResolution =
  | { readonly actor: Actor; readonly response?: never }
  | { readonly response: Response; readonly actor?: never };

/** A separate bearer-only resolver; never participates in browser authentication. */
export function createMcpActorResolver(input: {
  readonly origin: URL;
  readonly production: boolean;
  readonly persistence: OAuthIssuancePersistence;
  readonly adapter: Pick<DBAdapter, "findOne">;
  readonly now?: () => number;
}): {
  resolve(
    request: Request,
    requiredScope?: "content:read" | "content:write",
  ): Promise<McpActorResolution>;
} {
  const { resource } = mcpOAuthUrls(input.origin, input.production);
  const metadata = new URL("/.well-known/oauth-protected-resource/mcp", input.origin).href;
  const failure = (status: 401 | 403, error?: string, scope?: string): McpActorResolution => ({
    response: Response.json(
      { error: error ?? "invalid_token" },
      {
        status,
        headers: {
          "cache-control": "no-store",
          "www-authenticate": `Bearer resource_metadata="${metadata}"${error ? `, error="${error}"` : ""}${scope ? `, scope="${scope}"` : ""}`,
        },
      },
    ),
  });
  return Object.freeze({
    resolve: async (
      request: Request,
      requiredScope: "content:read" | "content:write" = "content:read",
    ) => {
      const url = new URL(request.url);
      if (url.searchParams.has("access_token")) return failure(401, "invalid_token");
      const authorization = request.headers.get("authorization");
      if (!authorization) return failure(401);
      const match = /^Bearer ([A-Za-z0-9._~+\/-]+=*)$/iu.exec(authorization);
      if (!match || match[1]!.length > 4096) return failure(401, "invalid_token");
      const hash = await oauthCredentialHash(match[1]!);
      const now = (input.now ?? Date.now)();
      const authority = await input.persistence.authority("access", hash, undefined, now);
      if (!authority || authority.grant.resource !== resource) return failure(401, "invalid_token");
      const role = authority.role;
      if (role !== "admin" && role !== "editor" && role !== "viewer")
        return failure(401, "invalid_token");
      const token = await input.adapter.findOne<Record<string, unknown>>({
        model: "oauthAccessToken",
        where: [{ field: "token", value: hash }],
      });
      if (
        !token ||
        token.id !== authority.providerId ||
        token.referenceId !== authority.grant.id ||
        token.userId !== authority.grant.userId ||
        token.clientId !== authority.grant.clientId ||
        token.revoked != null ||
        !(token.expiresAt instanceof Date) ||
        token.expiresAt.getTime() <= now ||
        !Array.isArray(token.resources) ||
        token.resources.length !== 1 ||
        token.resources[0] !== resource ||
        !Array.isArray(token.scopes) ||
        !token.scopes.every((scope) => typeof scope === "string")
      )
        return failure(401, "invalid_token");
      const scopes = token.scopes.filter((scope) => authority.grant.scopes.includes(scope));
      if (!scopes.includes("content:read") || !scopes.includes(requiredScope))
        return failure(403, "insufficient_scope", requiredScope);
      const permissions: Permission[] = ["content:read"];
      const operations = ["discoverModels", "list", "load"];
      if (scopes.includes("content:write")) {
        permissions.push("content:write");
        operations.push("create", "save");
      }
      return {
        actor: attenuateActor(
          { id: actorId(authority.grant.userId), role },
          { permissions, operations },
        ),
      };
    },
  });
}
