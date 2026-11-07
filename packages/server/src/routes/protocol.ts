import { Hono } from "hono";
import type { RouteContext } from "../composition/route-context.js";

export function registerProtocolRoutes(app: Hono, routeContext: RouteContext): void {
  const { input, actor } = routeContext;
  app.all("/mcp", async (context) => {
    if (!input.mcp) return new Response(null, { status: 503 });
    return input.mcp.fetch(context.req.raw, await actor(context), (event) =>
      context.set("lace.mcpCompletion", event),
    );
  });
  app.all(
    "/.well-known/oauth-protected-resource/mcp",
    (context) => input.auth?.fetch(context.req.raw) ?? new Response(null, { status: 404 }),
  );
  app.all(
    "/.well-known/oauth-authorization-server/api/auth",
    (context) => input.auth?.fetch(context.req.raw) ?? new Response(null, { status: 404 }),
  );
  if (input.auth !== undefined) {
    const auth = input.auth;
    app.all("/api/auth/*", (context) => auth.fetch(context.req.raw));
  }
}
