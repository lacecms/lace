import type { mcpContentOperations } from "@lacecms/application";

export type SensitiveRequestOperation =
  | "auth"
  | "email"
  | "invite"
  | "setup"
  | "token"
  | "upload"
  | "mcp"
  | "oauth-register"
  | "oauth-token"
  | "oauth-revoke";

export interface SensitiveRequestLimit {
  readonly operation: SensitiveRequestOperation;
  readonly scope: "actor" | "client";
}

export type RestCredentialMode =
  | "public"
  | "session"
  | "session-or-import"
  | "import-only"
  | "build";

type CredentialMode = RestCredentialMode | "provider" | "mcp";
type RouteMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "ALL";

export interface RoutePolicy<
  Path extends string = string,
  Auth extends CredentialMode = CredentialMode,
> {
  readonly method: RouteMethod;
  readonly path: Path;
  readonly auth: Auth;
  readonly bodyLimit: "default" | "media-upload";
  readonly rateLimit: SensitiveRequestLimit | "namespace" | undefined;
  readonly mcpOperation?: (typeof mcpContentOperations)[keyof typeof mcpContentOperations];
}

export function defineRoute<const Path extends string, const Auth extends CredentialMode>(
  method: RouteMethod,
  path: Path,
  auth: Auth,
  options: Partial<Pick<RoutePolicy, "bodyLimit" | "rateLimit" | "mcpOperation">> = {},
): RoutePolicy<Path, Auth> {
  return Object.freeze({
    method,
    path,
    auth,
    bodyLimit: "default",
    rateLimit: undefined,
    ...options,
  });
}

export function acceptsImport(auth: RoutePolicy["auth"] | undefined): boolean {
  return auth === "session-or-import" || auth === "import-only";
}

/** Literal compatibility matching for callers outside Hono. */
export function routePathPattern(path: string): RegExp {
  const pattern = path.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&").replace(/:[A-Za-z]+/gu, "[^/]+");
  return new RegExp(`^${pattern}$`, "u");
}

export function authenticationChallenge(auth: RoutePolicy["auth"] | undefined) {
  if (auth === "build") return "bearer";
  if (acceptsImport(auth)) return "session-or-bearer";
  return "session";
}
