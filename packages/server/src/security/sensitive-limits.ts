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
  /** `actor` limits count per resolved actor; `client` per trusted client address. */
  readonly scope: "actor" | "client";
}

const INVITE_LIMITED_PATH =
  /^\/api\/v1\/admin\/(?:invitations(?:\/[^/]+(?:\/resend)?)?|users\/[^/]+\/password-reset)$/u;

/**
 * Maps a request to its sensitive fixed-window limit, shared by both runtimes so
 * Node and the Worker count the same routes under the same subjects.
 */
export function sensitiveRequestLimit(
  method: string,
  pathname: string,
): SensitiveRequestLimit | undefined {
  if (pathname === "/mcp") return { operation: "mcp", scope: "actor" };
  if (pathname === "/api/auth/oauth2/register" && method === "POST")
    return { operation: "oauth-register", scope: "client" };
  if (pathname === "/api/auth/oauth2/token" && method === "POST")
    return { operation: "oauth-token", scope: "client" };
  if (/^\/api\/v1\/account\/mcp-connections\/[^/]+\/revoke$/u.test(pathname) && method === "POST")
    return { operation: "oauth-revoke", scope: "actor" };
  if (pathname.startsWith("/api/auth/oauth2/")) return undefined;
  if (pathname.startsWith("/api/auth/") && method !== "GET")
    return { operation: "auth", scope: "client" };
  if (
    method === "POST" &&
    (pathname.startsWith("/api/v1/invitations/") || pathname.startsWith("/api/v1/password-reset/"))
  )
    return { operation: "auth", scope: "client" };
  if (pathname === "/api/v1/account/password" && method === "POST")
    return { operation: "auth", scope: "actor" };
  if (pathname === "/api/v1/setup/admin") return { operation: "setup", scope: "client" };
  if (
    (pathname.startsWith("/api/v1/admin/api-tokens") ||
      pathname.startsWith("/api/v1/admin/import-tokens")) &&
    method !== "GET"
  )
    return { operation: "token", scope: "actor" };
  if (pathname === "/api/v1/admin/media" && method === "POST")
    return { operation: "upload", scope: "actor" };
  if (pathname === "/api/v1/admin/settings/email-test" && method === "POST")
    return { operation: "email", scope: "actor" };
  if ((method === "POST" || method === "DELETE") && INVITE_LIMITED_PATH.test(pathname))
    return { operation: "invite", scope: "actor" };
  return undefined;
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
