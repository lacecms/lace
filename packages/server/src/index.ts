// Directory dependencies: routing ← shared, security, preview. shared ← runtime, preview.
// routing, runtime, security, shared ← composition ← routes ← app; preview ← app.
export const packageName = "@lacecms/server";

// Runtime
export { parseBuildSiteIdentity } from "./runtime/build-site.js";
export * from "./runtime/email.js";
export * from "./runtime/mcp-settings.js";
export * from "./runtime/feature-flags.js";

// Security
export { IMPORT_ROUTE_ALLOWLIST, isImportRoute } from "./security/import-routes.js";
export {
  sensitiveRequestLimit,
  sensitiveRequestSubject,
  type SensitiveRequestLimit,
  type SensitiveRequestOperation,
} from "./security/sensitive-limits.js";
export { SensitiveRequestRateLimiter } from "./security/request-rate-limiter.js";

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

export { contentModelResolver, type RuntimeContentConfig } from "./composition/model-resolver.js";

export {
  composeLaceServices,
  jsonRequestLogger,
  type LaceAuthBoundary,
  type LaceRepository,
  type LaceServices,
  type LaceServicesInput,
  type OperationalLogger,
} from "./composition/services.js";

// Application
export { createLaceApp } from "./app/create-app.js";
