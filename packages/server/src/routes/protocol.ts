import type { Context, Hono } from "hono";
import type { RouteContext } from "../composition/route-context.js";
import { outerRoutes } from "../routing/outer-routes.js";
import { withRoutePolicy } from "../routing/route-matching.js";

export function registerProtocolRoutes(app: Hono, routeContext: RouteContext): void {
  const { actor } = routeContext.actors;
  const { capabilities } = routeContext;
  const {
    mcp,
    protectedResource,
    authorizationServer,
    oauthRegistration,
    oauthToken,
    authProvider,
  } = outerRoutes;
  app.on(
    mcp.method,
    mcp.path,
    withRoutePolicy(mcp, async (context: Context) => {
      if (!capabilities.mcp) return new Response(null, { status: 503 });
      return capabilities.mcp.fetch(context.req.raw, await actor(context), (event) =>
        context.set("lace.mcpCompletion", event),
      );
    }),
  );
  for (const route of [protectedResource, authorizationServer])
    app.on(
      route.method,
      route.path,
      withRoutePolicy(
        route,
        (context: Context) =>
          capabilities.auth?.fetch(context.req.raw) ?? new Response(null, { status: 404 }),
      ),
    );
  if (capabilities.auth !== undefined) {
    const auth = capabilities.auth;
    for (const route of [oauthRegistration, oauthToken, authProvider])
      app.on(
        route.method,
        route.path,
        withRoutePolicy(route, (context: Context) =>
          auth.fetch(context.req.raw, context.get("lace.clientAddress")),
        ),
      );
  }
}
