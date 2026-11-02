import { expect, test } from "vitest";

test("packaged entry point keeps its public exports", async () => {
  expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([
    "MCP_DISCOVERY_PATHS",
    "MCP_OAUTH_ROUTE_ALLOWLIST",
    "MCP_OAUTH_SCOPES",
    "MCP_REGISTRATION_MAX_BYTES",
    "PROVIDER_ROUTE_ALLOWLIST",
    "TrustedClientAddresses",
    "createBetterAuthBoundary",
    "createImportActorResolver",
    "createMcpActorResolver",
    "createMcpOAuthHttpBoundary",
    "createMcpOAuthProvider",
    "createOAuthRequestGuard",
    "importTokenAuthority",
    "isMcpOAuthRoute",
    "mcpAuthorizationMetadata",
    "mcpOAuthUrls",
    "mcpResourceMetadata",
    "normalizeClientAddress",
    "normalizeMcpClientRegistration",
    "normalizeMcpScopes",
    "oauthCredentialHash",
    "oauthFailure",
    "packageName",
    "readOAuthBody",
    "safeOAuthResponse",
  ]);
});
