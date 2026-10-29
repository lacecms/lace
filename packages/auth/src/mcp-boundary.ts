import { createMcpConsentBoundary, type OAuthBrowserSession } from "./mcp-consent.js";
import type { DBAdapter } from "better-auth";
import type { OAuthIssuancePersistence } from "@lacecms/application";
import {
  createMcpActorResolver,
  isMcpOAuthRoute,
  MCP_DISCOVERY_PATHS,
  type McpActorResolution,
} from "./mcp-actor.js";
import {
  mcpAuthorizationMetadata,
  mcpResourceMetadata,
  mcpOAuthUrls,
  normalizeMcpClientRegistration,
  type McpOAuthProviderInput,
} from "./mcp-oauth.js";
import { createOAuthRequestGuard, oauthCredentialHash } from "./oauth-guard.js";

export type OAuthRequestGuard = ReturnType<typeof createOAuthRequestGuard>;
export interface McpProvider {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly adapter: Pick<DBAdapter, "findOne" | "create" | "consumeOne" | "update" | "deleteMany">;
}
export type McpProviderFactory = (
  guard?: OAuthRequestGuard,
  reference?: McpOAuthProviderInput["consentReferenceId"],
) => Promise<McpProvider>;
export interface McpOAuthHttpBoundary {
  fetch(request: Request): Promise<Response>;
  resolve(
    request: Request,
    requiredScope?: "content:read" | "content:write",
  ): Promise<McpActorResolution>;
}
export const oauthFailure = (error: string, status = 400): Response =>
  Response.json(
    { error },
    {
      status,
      headers: { "cache-control": "no-store", pragma: "no-cache" },
    },
  );
/** Enforce the byte ceiling even without Content-Length. */
export async function readOAuthBody(request: Request, limit = 8192): Promise<string> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new TypeError("OAuth body exceeds limit.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
export async function safeOAuthResponse(response: Response): Promise<Response> {
  if (!response.ok) {
    const safeErrors = [
      "invalid_request",
      "invalid_client",
      "invalid_client_metadata",
      "invalid_redirect_uri",
      "invalid_grant",
      "invalid_scope",
      "invalid_target",
      "unauthorized_client",
      "unsupported_grant_type",
      "access_denied",
      "server_error",
    ];
    let error = "server_error";
    try {
      const body = (await response.clone().json()) as Record<string, unknown>;
      if (typeof body.error === "string" && safeErrors.includes(body.error)) error = body.error;
    } catch {
      /* Provider diagnostics never become protocol error bodies. */
    }
    return oauthFailure(error, response.status);
  }
  const headers = new Headers(response.headers);
  headers.set("cache-control", "no-store");
  headers.set("pragma", "no-cache");
  return new Response(response.body, { status: response.status, headers });
}
export function createMcpOAuthHttpBoundary(input: {
  readonly origin: URL;
  readonly production: boolean;
  readonly persistence: OAuthIssuancePersistence;
  readonly provider: McpProviderFactory;
  readonly session: (request: Request) => Promise<OAuthBrowserSession | null>;
}): McpOAuthHttpBoundary {
  const { resource } = mcpOAuthUrls(input.origin, input.production);
  const consent = createMcpConsentBoundary(input);
  return Object.freeze({
    resolve: async (request: Request, requiredScope?: "content:read" | "content:write") => {
      const provider = await input.provider();
      return createMcpActorResolver({ ...input, adapter: provider.adapter }).resolve(
        request,
        requiredScope,
      );
    },
    fetch: async (request: Request) => {
      const path = new URL(request.url).pathname;
      if (MCP_DISCOVERY_PATHS.includes(path)) {
        if (request.method !== "GET" && request.method !== "HEAD")
          return new Response(null, { status: 404 });
        const body =
          path === "/.well-known/oauth-protected-resource/mcp"
            ? mcpResourceMetadata(input.origin, input.production)
            : mcpAuthorizationMetadata(input.origin, input.production);
        return new Response(request.method === "HEAD" ? null : JSON.stringify(body), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      }
      if (!isMcpOAuthRoute(request)) return new Response(null, { status: 404 });
      if (path.endsWith("/authorize") || path.endsWith("/consent") || path.endsWith("/continue")) {
        try {
          return await consent.fetch(
            request,
            request.method === "POST" ? await readOAuthBody(request) : undefined,
          );
        } catch {
          return oauthFailure("invalid_request");
        }
      }
      try {
        const raw = await readOAuthBody(request);
        const headers = new Headers(request.headers);
        headers.delete("cookie");
        headers.delete("content-length");
        if (path.endsWith("/register")) {
          if (!headers.get("content-type")?.startsWith("application/json"))
            return oauthFailure("invalid_client_metadata");
          const metadata = normalizeMcpClientRegistration(JSON.parse(raw));
          headers.delete("authorization");
          const provider = await input.provider();
          return safeOAuthResponse(
            await provider.fetch(
              new Request(request.url, { method: "POST", headers, body: JSON.stringify(metadata) }),
            ),
          );
        }
        if (!headers.get("content-type")?.startsWith("application/x-www-form-urlencoded"))
          return oauthFailure("invalid_request");
        const body = new URLSearchParams(raw);
        if ([...new Set(body.keys())].some((key) => body.getAll(key).length !== 1))
          return oauthFailure("invalid_request");
        if (path.endsWith("/token")) {
          const kind = body.get("grant_type");
          if (kind !== "authorization_code" && kind !== "refresh_token")
            return oauthFailure("unsupported_grant_type");
          if (body.get("resource") !== null && body.get("resource") !== resource)
            return oauthFailure("invalid_target");
          const guard = createOAuthRequestGuard({
            persistence: input.persistence,
            kind: kind === "authorization_code" ? "code" : "refresh",
            inputHash: await oauthCredentialHash(
              body.get(kind === "authorization_code" ? "code" : "refresh_token") ?? "",
            ),
            clientId: body.get("client_id") ?? "",
            resource,
          });
          try {
            const provider = await input.provider(guard);
            return safeOAuthResponse(
              await guard.finish(
                await provider.fetch(
                  new Request(request.url, { method: "POST", headers, body: raw }),
                ),
              ),
            );
          } catch {
            await guard.fail();
            return oauthFailure("server_error", 503);
          }
        }
        if (path.endsWith("/revoke")) {
          const hash = await oauthCredentialHash(body.get("token") ?? "");
          const clientId = body.get("client_id") ?? "";
          for (const kind of ["access", "refresh"] as const) {
            const authority = await input.persistence.authority(kind, hash, clientId, Date.now());
            if (authority) await input.persistence.revokeFamily(authority.grant.id, Date.now());
          }
          const provider = await input.provider();
          return safeOAuthResponse(
            await provider.fetch(new Request(request.url, { method: "POST", headers, body: raw })),
          );
        }
        return new Response(null, { status: 404 });
      } catch {
        return oauthFailure("invalid_request");
      }
    },
  });
}
