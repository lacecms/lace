import { Hono } from "hono";
import type { RouteContext } from "../composition/route-context.js";

export function registerProtocolRoutes(app: Hono, routeContext: RouteContext): void {
  const { actor } = routeContext.actors;
  const { capabilities } = routeContext;
  app.all("/mcp", async (context) => {
    if (!capabilities.mcp) return new Response(null, { status: 503 });
    return capabilities.mcp.fetch(context.req.raw, await actor(context), (event) =>
      context.set("lace.mcpCompletion", event),
    );
  });
  app.all(
    "/.well-known/oauth-protected-resource/mcp",
    (context) => capabilities.auth?.fetch(context.req.raw) ?? new Response(null, { status: 404 }),
  );
  app.all(
    "/.well-known/oauth-authorization-server/api/auth",
    (context) => capabilities.auth?.fetch(context.req.raw) ?? new Response(null, { status: 404 }),
  );
  if (capabilities.auth !== undefined) {
    const auth = capabilities.auth;
    app.all("/api/auth/*", (context) => auth.fetch(context.req.raw));
  }
}
