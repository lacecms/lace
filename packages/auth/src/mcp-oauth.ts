import { oauthProvider, type OAuthOptions } from "@better-auth/oauth-provider";
import { APIError } from "better-auth/api";

export const MCP_OAUTH_SCOPES = Object.freeze(["content:read", "content:write", "offline_access"]);
export const MCP_REGISTRATION_MAX_BYTES = 8192;
const invalidMetadata = (): never => {
  throw new APIError("BAD_REQUEST", {
    error: "invalid_client_metadata",
    error_description: "Unsupported or invalid client metadata.",
  });
};

export function mcpOAuthUrls(
  origin: URL,
  production: boolean,
): { readonly issuer: string; readonly resource: string } {
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
  if (
    origin.username ||
    origin.password ||
    origin.search ||
    origin.hash ||
    !["", "/"].includes(origin.pathname) ||
    (origin.protocol !== "https:" && !(origin.protocol === "http:" && loopback && !production))
  )
    throw new TypeError("Invalid LACE_PUBLIC_BASE_URL.");
  return Object.freeze({
    issuer: new URL("/api/auth", origin.origin).href,
    resource: new URL("/mcp", origin.origin).href,
  });
}

export function normalizeMcpScopes(value: string): string[] {
  const scopes = [...new Set(value.split(/\s+/u).filter(Boolean))];
  if (
    (!scopes.includes("content:read") && !scopes.includes("content:write")) ||
    scopes.some((scope) => !MCP_OAUTH_SCOPES.includes(scope))
  )
    throw new APIError("BAD_REQUEST", {
      error: "invalid_scope",
      error_description: "Unsupported scope.",
    });
  if (scopes.includes("content:write") && !scopes.includes("content:read"))
    scopes.push("content:read");
  return MCP_OAUTH_SCOPES.filter((scope) => scopes.includes(scope));
}

/** Closed public-client policy before the provider's native/web URI validation. */
export function normalizeMcpClientRegistration(value: unknown): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  )
    return invalidMetadata();
  const data = value as Record<string, unknown>;
  const allowed = [
    "client_name",
    "redirect_uris",
    "grant_types",
    "response_types",
    "token_endpoint_auth_method",
    "application_type",
    "scope",
  ];
  if (Object.keys(data).some((key) => !allowed.includes(key))) return invalidMetadata();
  try {
    if (new TextEncoder().encode(JSON.stringify(data)).byteLength > MCP_REGISTRATION_MAX_BYTES)
      return invalidMetadata();
  } catch {
    return invalidMetadata();
  }
  if (data.token_endpoint_auth_method !== undefined && data.token_endpoint_auth_method !== "none")
    return invalidMetadata();
  const redirects = data.redirect_uris;
  if (
    !Array.isArray(redirects) ||
    redirects.length < 1 ||
    redirects.length > 5 ||
    new Set(redirects).size !== redirects.length
  )
    return invalidMetadata();
  let native = false;
  for (const redirect of redirects) {
    if (typeof redirect !== "string" || redirect.length > 2048 || redirect.includes("*"))
      return invalidMetadata();
    let url: URL;
    try {
      url = new URL(redirect);
    } catch {
      return invalidMetadata();
    }
    if (
      url.username ||
      url.password ||
      url.hash ||
      redirect.includes("#") ||
      ["javascript:", "data:", "file:", "ftp:", "mailto:", "vbscript:"].includes(url.protocol)
    )
      return invalidMetadata();
    if (url.protocol === "http:" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      return invalidMetadata();
    if (url.protocol !== "https:") native = true;
  }
  const name = data.client_name ?? "MCP client";
  if (
    typeof name !== "string" ||
    name.trim().length === 0 ||
    name.length > 120 ||
    /[\u0000-\u001f\u007f]/u.test(name)
  )
    return invalidMetadata();
  const grants = data.grant_types ?? ["authorization_code", "refresh_token"];
  if (
    !Array.isArray(grants) ||
    grants.length < 1 ||
    grants.length > 2 ||
    !grants.includes("authorization_code") ||
    new Set(grants).size !== grants.length ||
    grants.some((grant) => grant !== "authorization_code" && grant !== "refresh_token")
  )
    return invalidMetadata();
  const responseTypes = data.response_types ?? ["code"];
  if (!Array.isArray(responseTypes) || responseTypes.length !== 1 || responseTypes[0] !== "code")
    return invalidMetadata();
  const applicationType = data.application_type ?? (native ? "native" : "web");
  if (applicationType !== "native" && applicationType !== "web") return invalidMetadata();
  if (data.scope !== undefined && typeof data.scope !== "string") return invalidMetadata();
  return {
    client_name: name.trim(),
    redirect_uris: redirects,
    grant_types: grants,
    response_types: responseTypes,
    token_endpoint_auth_method: "none",
    application_type: applicationType,
    ...(typeof data.scope === "string" ? { scope: normalizeMcpScopes(data.scope).join(" ") } : {}),
  };
}

export interface McpOAuthProviderInput {
  readonly origin: URL;
  readonly production: boolean;
  readonly consentReferenceId: NonNullable<
    OAuthOptions<string[]>["postLogin"]
  >["consentReferenceId"];
}
export function createMcpOAuthProvider(
  input: McpOAuthProviderInput,
): ReturnType<typeof oauthProvider> {
  const { resource } = mcpOAuthUrls(input.origin, input.production);
  return oauthProvider({
    loginPage: "/admin/sign-in",
    consentPage: "/admin/mcp/consent",
    postLogin: {
      page: "/admin/mcp/consent",
      shouldRedirect: async () => false,
      consentReferenceId: input.consentReferenceId,
    },
    disableJwtPlugin: true,
    storeTokens: "hashed",
    scopes: [...MCP_OAUTH_SCOPES],
    grantTypes: ["authorization_code", "refresh_token"],
    codeExpiresIn: 300,
    accessTokenExpiresIn: 900,
    refreshTokenExpiresIn: 2592000,
    refreshTokenReuseInterval: 0,
    allowDynamicClientRegistration: true,
    allowUnauthenticatedClientRegistration: true,
    clientRegistrationDefaultScopes: ["content:read"],
    clientRegistrationAllowedScopes: ["content:write", "offline_access"],
    clientRegistrationRequirePKCE: true,
    resources: [
      { identifier: resource, name: "Lace content", allowedScopes: [...MCP_OAUTH_SCOPES] },
    ],
    clientRegistrationDefaultResources: [resource],
    clientRegistrationAllowedResources: [resource],
    enforcePerClientResources: true,
    extensions: [],
    resourcePrivileges: async () => false,
    clientPrivileges: async () => false,
    // Lace's durable limiter owns the exact client/address/user windows.
    rateLimit: {
      token: false,
      authorize: false,
      register: false,
      revoke: false,
      introspect: false,
      userinfo: false,
    },
  });
}

/** Advertise only the supported profile; provider-internal endpoints stay private. */
export function mcpAuthorizationMetadata(
  origin: URL,
  production: boolean,
): Record<string, unknown> {
  const { issuer } = mcpOAuthUrls(origin, production);
  return {
    issuer,
    authorization_endpoint: `${issuer}/oauth2/authorize`,
    token_endpoint: `${issuer}/oauth2/token`,
    registration_endpoint: `${issuer}/oauth2/register`,
    revocation_endpoint: `${issuer}/oauth2/revoke`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...MCP_OAUTH_SCOPES],
  };
}
export function mcpResourceMetadata(origin: URL, production: boolean): Record<string, unknown> {
  const { issuer, resource } = mcpOAuthUrls(origin, production);
  return {
    resource,
    authorization_servers: [issuer],
    scopes_supported: [...MCP_OAUTH_SCOPES],
    bearer_methods_supported: ["header"],
  };
}
