// Directory dependencies: shared ← runtime, security ← composition ← routes ← app.
export const packageName = "@lacecms/server";

// Runtime
export { parseBuildSiteIdentity } from "./runtime/build-site.js";
export * from "./runtime/email.js";
export * from "./runtime/mcp-settings.js";

// Security
export { IMPORT_ROUTE_ALLOWLIST, isImportRoute } from "./security/import-routes.js";
export * from "./security/sensitive-limits.js";

// Composition
export type {
  ActorResolver,
  AuthRouteHandler,
  RequestIdGenerator,
  RequestRateLimiter,
  ServerLogger,
  ReadinessProbe,
  ServerEnvironmentMetadata,
  BuiltAdminResponder,
  LaceAppInput,
} from "./composition/input.js";

// Application
export { createLaceApp } from "./app/create-app.js";
