import {
  routePathPattern,
  type RoutePolicy,
  type SensitiveRequestLimit,
} from "../routing/route-policy.js";
import { outerRoutes } from "../routing/outer-routes.js";
import { API_V1, v1RoutePolicies, v1Routes } from "../routing/v1-routes.js";

export type { SensitiveRequestLimit, SensitiveRequestOperation } from "../routing/route-policy.js";

const limitedRoutes = [
  ...Object.values(outerRoutes).map((route) => ({ route, path: route.path })),
  ...v1RoutePolicies.map((route) => ({ route, path: API_V1 + route.path })),
].flatMap(({ route, path }) => {
  const limit = route.rateLimit;
  return limit === undefined || limit === "namespace"
    ? []
    : [{ method: route.method, path: routePathPattern(path), limit }];
});

const LEGACY_INVITE_PATH =
  /^\/api\/v1\/admin\/(?:invitations(?:\/[^/]+(?:\/resend)?)?|users\/[^/]+\/password-reset)$/u;

/** Broad controls remain in force even if the request never reaches an operation. */
function namespaceLimit(method: string, pathname: string): SensitiveRequestLimit | undefined {
  if (pathname.startsWith("/api/auth/oauth2/")) return undefined;
  if (pathname.startsWith("/api/auth/") && method !== "GET")
    return { operation: "auth", scope: "client" };
  if (
    method === "POST" &&
    (pathname.startsWith(`${API_V1}/invitations/`) ||
      pathname.startsWith(`${API_V1}/password-reset/`))
  )
    return { operation: "auth", scope: "client" };
  const setup = v1Routes.setupSession.setupAdmin;
  if (pathname === API_V1 + setup.path && typeof setup.rateLimit === "object")
    return setup.rateLimit;
  if (
    (pathname.startsWith(API_V1 + v1Routes.credentials.listBuild.path) ||
      pathname.startsWith(API_V1 + v1Routes.credentials.listImport.path)) &&
    method !== "GET"
  )
    return { operation: "token", scope: "actor" };
  if ((method === "POST" || method === "DELETE") && LEGACY_INVITE_PATH.test(pathname))
    return { operation: "invite", scope: "actor" };
  return undefined;
}

/** Compatibility view for standalone limiters and requests outside the registered routes. */
export function sensitiveRequestLimit(
  method: string,
  pathname: string,
): SensitiveRequestLimit | undefined {
  const declared = limitedRoutes.find(
    (route) => (route.method === "ALL" || route.method === method) && route.path.test(pathname),
  );
  return declared?.limit ?? namespaceLimit(method, pathname);
}

export function routeSensitiveLimit(
  policy: RoutePolicy | undefined,
  method: string,
  pathname: string,
): SensitiveRequestLimit | undefined {
  if (policy === undefined) return sensitiveRequestLimit(method, pathname);
  // Hono matches HEAD as GET. The broad namespace controls use the original method.
  if (policy.rateLimit === "namespace" || (policy.method !== "ALL" && policy.method !== method))
    return namespaceLimit(method, pathname);
  return policy.rateLimit;
}

/** Same token/client-address subject on Node and Worker, using trusted address input. */
export async function sensitiveRequestSubject(
  limit: SensitiveRequestLimit,
  request: Request,
  address: string,
  actorId?: string,
): Promise<string | undefined> {
  if (limit.scope === "actor") return actorId === undefined ? undefined : `actor:${actorId}`;
  if (limit.operation !== "oauth-token") return address;
  try {
    const body = await request.clone().formData();
    const client = body.get("client_id");
    return JSON.stringify([address, typeof client === "string" ? client : ""]);
  } catch {
    return JSON.stringify([address, ""]);
  }
}
