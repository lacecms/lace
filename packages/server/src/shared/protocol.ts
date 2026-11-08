/** The MCP and OAuth surface the gate and body limits apply to. */

export const isMcpSurfacePath = (path: string) =>
  path === "/mcp" ||
  path.startsWith("/mcp/") ||
  path.startsWith("/api/auth/oauth2/") ||
  path.startsWith("/.well-known/oauth-protected-resource/mcp") ||
  path.startsWith("/.well-known/oauth-authorization-server/api/auth") ||
  path.startsWith("/api/auth/.well-known/oauth-authorization-server") ||
  path.startsWith("/api/v1/account/mcp-connections") ||
  path === "/admin/mcp/consent";

/** Paths whose clients read OAuth-style error bodies for failures. */
export function isProtocolErrorPath(path: string): boolean {
  return path === "/mcp" || path.startsWith("/api/auth/oauth2/");
}

// `HeadersInit` is a DOM name; Node-only consumers type-check this source too.
type ResponseHeaders = ConstructorParameters<typeof Headers>[0];

export function protocolErrorResponse(
  error: "invalid_request" | "server_error" | "temporarily_unavailable",
  status: number,
  headers?: ResponseHeaders,
): Response {
  return Response.json({ error }, { status, ...(headers === undefined ? {} : { headers }) });
}
