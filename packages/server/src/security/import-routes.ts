import { acceptsImport, routePathPattern } from "../routing/route-policy.js";
import { API_V1, v1RoutePolicies, v1Routes } from "../routing/v1-routes.js";

const reservedMediaPath = `${API_V1}${v1Routes.media.tags.path}`;

export function isReservedImportPath(path: string): boolean {
  // The literal tag catalog stays reserved even on PATCH, which can match :mediaId.
  return path === reservedMediaPath;
}

/** Public compatibility view of the fixed ADR 0016 import surface. */
export const IMPORT_ROUTE_ALLOWLIST: readonly (readonly [method: string, route: string])[] =
  Object.freeze(
    v1RoutePolicies
      .filter((route) => acceptsImport(route.auth))
      .map((route) => Object.freeze([route.method, `${API_V1}${route.path}`] as const)),
  );

const compiled = IMPORT_ROUTE_ALLOWLIST.map(([method, route]) => ({
  method,
  pattern: routePathPattern(route),
}));

/** Compatibility matcher for callers without a Hono context. */
export function isImportRoute(method: string, pathname: string): boolean {
  if (isReservedImportPath(pathname)) return false;
  const effective = method === "HEAD" ? "GET" : method;
  return compiled.some((route) => route.method === effective && route.pattern.test(pathname));
}

/** Requests that must authenticate as an import token and never as a browser session. */
export function isBearerManagementRequest(request: Request, pathname: string): boolean {
  if (!pathname.startsWith(`${API_V1}/admin/`) && !pathname.startsWith(`${API_V1}/account/`))
    return false;
  return (
    request.headers.has("authorization") || new URL(request.url).searchParams.has("access_token")
  );
}
