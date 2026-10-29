// Compatibility baseline only: never imported by production packages.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/d1";
import { betterAuthSchema } from "@lacecms/db";
import {
  createOAuthRequestGuard,
  oauthCredentialHash,
  createMcpOAuthProvider,
  mcpAuthorizationMetadata,
  normalizeMcpClientRegistration,
} from "../../../packages/auth/dist/index.js";
import { createD1OAuthPersistence } from "../../../packages/platform-cloudflare/dist/oauth.js";
export const origin = "https://cms.lace.test";
export const resource = `${origin}/mcp`;
export const scopes = ["content:read", "offline_access"];
// Public checked-in schema plus reviewed migrations are used by every fixture.
export function providerSchema() {
  return { schema: betterAuthSchema, statements: [] };
}

export function baselinePlugin(referenceId) {
  return createMcpOAuthProvider({
    origin: new URL(origin),
    production: true,
    consentReferenceId: async () => referenceId,
  });
}

export function baselineAuth(database, guard, referenceId) {
  const factory = drizzleAdapter(database, { provider: "sqlite", schema: betterAuthSchema });
  return betterAuth({
    database: guard ? (options) => guard.wrap(factory(options)) : factory,
    baseURL: origin,
    basePath: "/api/auth",
    secret: "fixture-only-secret-not-a-deployment-credential",
    emailAndPassword: { enabled: true, disableSignUp: true },
    trustedOrigins: [origin],
    plugins: [baselinePlugin(referenceId)],
    logger: { disabled: true },
  });
}
export function workerAuth(binding) {
  const { schema } = providerSchema(baselinePlugin());
  return baselineAuth(drizzle(binding, { schema }));
}

export async function guardedFetch(database, persistence, request) {
  const grantId = "fixture-grant";
  const path = new URL(request.url).pathname;
  if (path === "/api/auth/.well-known/oauth-authorization-server")
    return Response.json(mcpAuthorizationMetadata(new URL(origin), true));
  if (path === "/api/auth/oauth2/register") {
    try {
      const metadata = normalizeMcpClientRegistration(await request.clone().json());
      const headers = new Headers(request.headers);
      headers.delete("cookie");
      headers.delete("authorization");
      headers.set("content-type", "application/json");
      return baselineAuth(database, undefined, grantId).handler(
        new Request(request.url, { method: "POST", headers, body: JSON.stringify(metadata) }),
      );
    } catch {
      return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
    }
  }
  if (path !== "/api/auth/oauth2/token")
    return baselineAuth(database, undefined, grantId).handler(request);
  const body = await request.clone().formData();
  const kind = body.get("grant_type") === "authorization_code" ? "code" : "refresh";
  const guard = createOAuthRequestGuard({
    persistence,
    kind,
    inputHash: await oauthCredentialHash(
      String(body.get(kind === "code" ? "code" : "refresh_token") ?? ""),
    ),
    clientId: String(body.get("client_id") ?? ""),
    resource: String(body.get("resource") ?? resource),
  });
  try {
    return await guard.finish(await baselineAuth(database, guard, grantId).handler(request));
  } catch (error) {
    await guard.fail();
    throw error;
  }
}
export function guardedWorkerFetch(binding, request) {
  return guardedFetch(
    drizzle(binding, { schema: betterAuthSchema }),
    createD1OAuthPersistence(binding),
    request,
  );
}
