import { Hono } from "hono";
import type { RouteContext } from "../composition/route-context.js";

export function registerHealthRoutes(app: Hono, routeContext: RouteContext): void {
  const { input } = routeContext;
  app.get("/health/live", (context) => context.json({ status: "live" }));
  app.get("/health/ready", async (context) => {
    const ready = await input.readiness.isReady();
    return context.json({ status: ready ? "ready" : "not_ready" }, ready ? 200 : 503);
  });
}
