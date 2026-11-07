import type { DBAdapter } from "better-auth";
import type { createOAuthRequestGuard } from "./guard.js";
import type { McpOAuthProviderInput } from "./oauth.js";

export type OAuthRequestGuard = ReturnType<typeof createOAuthRequestGuard>;
export interface McpProvider {
  readonly fetch: (request: Request) => Promise<Response>;
  readonly adapter: Pick<DBAdapter, "findOne" | "create" | "consumeOne" | "update" | "deleteMany">;
}
export type McpProviderFactory = (
  guard?: OAuthRequestGuard,
  reference?: McpOAuthProviderInput["consentReferenceId"],
) => Promise<McpProvider>;
