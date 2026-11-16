import type { Context } from "hono";
import { matchedRoutes } from "hono/route";
import type { RoutePolicy } from "./route-policy.js";

const routePolicies = new WeakMap<object, RoutePolicy>();

/** The original handler identity preserves Hono OpenAPI's own metadata. */
export function withRoutePolicy<Handler extends object>(
  policy: RoutePolicy,
  handler: Handler,
): Handler {
  routePolicies.set(handler, policy);
  return handler;
}

/** The first declared route in Hono's dispatch order owns the request policy. */
export function matchedRoutePolicy(context: Context): RoutePolicy | undefined {
  for (const route of matchedRoutes(context)) {
    const policy = routePolicies.get(route.handler);
    if (policy !== undefined) return policy;
  }
  return undefined;
}
