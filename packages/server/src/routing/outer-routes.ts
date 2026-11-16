import { defineRoute } from "./route-policy.js";

export const outerRoutes = {
  healthLive: defineRoute("GET", "/health/live", "public"),
  healthReady: defineRoute("GET", "/health/ready", "public"),
  reference: defineRoute("GET", "/api/docs", "public"),
  mcp: defineRoute("ALL", "/mcp", "mcp", {
    rateLimit: { operation: "mcp", scope: "actor" },
  }),
  protectedResource: defineRoute("ALL", "/.well-known/oauth-protected-resource/mcp", "provider"),
  authorizationServer: defineRoute(
    "ALL",
    "/.well-known/oauth-authorization-server/api/auth",
    "provider",
  ),
  oauthRegistration: defineRoute("POST", "/api/auth/oauth2/register", "provider", {
    rateLimit: { operation: "oauth-register", scope: "client" },
  }),
  oauthToken: defineRoute("POST", "/api/auth/oauth2/token", "provider", {
    rateLimit: { operation: "oauth-token", scope: "client" },
  }),
  authProvider: defineRoute("ALL", "/api/auth/*", "provider", { rateLimit: "namespace" }),
} as const;
