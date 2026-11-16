import { Hono } from "hono";
import type { RouteContext } from "../composition/route-context.js";
import { outerRoutes } from "../routing/outer-routes.js";
import { withRoutePolicy } from "../routing/route-matching.js";

export function registerHealthRoutes(app: Hono, routeContext: RouteContext): void {
  const { capabilities } = routeContext;
  const { healthLive, healthReady } = outerRoutes;
  app.on(
    healthLive.method,
    healthLive.path,
    withRoutePolicy(healthLive, (context) => context.json({ status: "live" })),
  );
  app.on(
    healthReady.method,
    healthReady.path,
    withRoutePolicy(healthReady, async (context) => {
      const ready = await capabilities.readiness.isReady();
      return context.json({ status: ready ? "ready" : "not_ready" }, ready ? 200 : 503);
    }),
  );
}
