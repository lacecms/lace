/**
 * The only admin routes an import token reaches (ADR 0016). Every other route
 * below `/api/v1/admin/` or `/api/v1/account/` denies a request that carries a
 * Bearer credential. Adding a route here is an explicit, tested change.
 */
export const IMPORT_ROUTE_ALLOWLIST: readonly (readonly [method: string, route: string])[] =
  Object.freeze(
    (
      [
        ["GET", "/api/v1/admin/content-models"],
        ["GET", "/api/v1/admin/models/:modelKey/entries"],
        ["POST", "/api/v1/admin/models/:modelKey/entries"],
        ["GET", "/api/v1/admin/entries/:entryId"],
        ["PUT", "/api/v1/admin/entries/:entryId/draft"],
        ["POST", "/api/v1/admin/entries/:entryId/publish"],
        ["GET", "/api/v1/admin/media"],
        ["POST", "/api/v1/admin/media"],
        ["GET", "/api/v1/admin/media/:mediaId"],
        ["PATCH", "/api/v1/admin/media/:mediaId"],
        ["GET", "/api/v1/admin/import-credential"],
      ] satisfies [string, string][]
    ).map((route) => Object.freeze(route)),
  );

// A parameter is one non-empty segment; `media/tags` is its own closed route, not a media ID.
const compiled = IMPORT_ROUTE_ALLOWLIST.map(([method, route]) => ({
  method,
  pattern: new RegExp(
    `^${route.replace(":mediaId", "(?!tags$)[^/]+").replace(/:[A-Za-z]+/gu, "[^/]+")}$`,
    "u",
  ),
}));

/** Matches the raw path: the middleware runs before Hono selects a route. */
export function isImportRoute(method: string, pathname: string): boolean {
  const effective = method === "HEAD" ? "GET" : method;
  return compiled.some((route) => route.method === effective && route.pattern.test(pathname));
}

/** Requests that must authenticate as an import token and never as a browser session. */
export function isBearerManagementRequest(request: Request, pathname: string): boolean {
  if (!pathname.startsWith("/api/v1/admin/") && !pathname.startsWith("/api/v1/account/"))
    return false;
  return (
    request.headers.has("authorization") || new URL(request.url).searchParams.has("access_token")
  );
}
