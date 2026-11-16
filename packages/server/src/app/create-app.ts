import { AuthenticationRequiredError } from "@lacecms/contracts";
import { registerDocsRoutes, registerOpenApiRoute } from "../routes/docs.js";
import { registerPublicRoutes } from "../routes/public.js";
import { registerContentRoutes } from "../routes/content.js";
import { registerMediaRoutes } from "../routes/media.js";
import { registerProtocolRoutes } from "../routes/protocol.js";
import { registerHealthRoutes } from "../routes/health.js";
import { registerSetupSessionRoutes } from "../routes/setup-session.js";
import { registerAccountRoutes } from "../routes/accounts.js";
import { registerAdminUserRoutes } from "../routes/admin-users.js";
import { registerCredentialRoutes } from "../routes/credentials.js";
import { registerBuildRoutes } from "../routes/builds.js";
import { createActorContext } from "../composition/actor-context.js";
import { createCapabilities } from "../composition/capabilities.js";
import type { RouteContext } from "../composition/route-context.js";
import type { Actor, LaceAppInput } from "../composition/input.js";
import { routeSensitiveLimit } from "../security/sensitive-limits.js";
import {
  isMcpSurfacePath,
  isProtocolErrorPath,
  protocolErrorResponse,
} from "../shared/protocol.js";
import { AuthorizationError, errorResponse, noStore, notFound } from "../shared/http.js";
import { isBearerManagementRequest, isReservedImportPath } from "../security/import-routes.js";
import { mcpToolScope, RateLimitExceededError } from "@lacecms/application";
import type { ImportTokenMetadata } from "@lacecms/application";
import { classifyError, transportError } from "@lacecms/contracts";
import { bodyLimit } from "hono/body-limit";
import { Hono } from "hono";
import { API_V1 } from "../routing/v1-routes.js";
import { matchedRoutePolicy } from "../routing/route-matching.js";
import {
  acceptsImport,
  authenticationChallenge,
  type RoutePolicy,
} from "../routing/route-policy.js";

declare module "hono" {
  interface ContextVariableMap {
    "lace.actor": Actor | undefined;
    "lace.clientAddress": string;
    "lace.requestId": string;
    "lace.routePolicy": RoutePolicy | undefined;
    "lace.sessionId": string | null | undefined;
    "lace.mcpCompletion": { readonly tool: string; readonly outcome: "success" | "error" };
    /** Set only when an import token authenticated the request (ADR 0016). */
    "lace.importToken": ImportTokenMetadata | undefined;
  }
}

/** Creates a portable Hono API app; runtime adapters supply every infrastructure capability. */
export function createLaceApp(input: LaceAppInput): Hono {
  if (!Number.isSafeInteger(input.maxBodyBytes) || input.maxBodyBytes < 1)
    throw new TypeError("maxBodyBytes must be a positive safe integer.");
  const app = new Hono();
  const actors = createActorContext(input.actors);
  const routeContext: RouteContext = Object.freeze({
    actors,
    capabilities: createCapabilities(input),
  });
  const { actor } = actors;

  app.onError((error, context) =>
    isProtocolErrorPath(context.req.path)
      ? protocolErrorResponse("server_error", 503, noStore)
      : errorResponse(classifyError(error)),
  );

  app.use(async (context, next) => {
    context.set("lace.clientAddress", input.clientAddress?.(context.req.raw) ?? "0.0.0.0");
    context.set("lace.routePolicy", matchedRoutePolicy(context));
    const requestId = input.requestIds.next();
    context.set("lace.requestId", requestId);
    const startedAt = performance.now();
    try {
      await next();
    } finally {
      context.res.headers.set("x-request-id", requestId);
      const actor = context.get("lace.actor") as Actor | undefined;
      const completion = context.get("lace.mcpCompletion") as
        | { readonly tool: string; readonly outcome: "success" | "error" }
        | undefined;
      input.logger.log({
        ...completion,
        ...(actor === undefined ? {} : { actorId: actor.id }),
        durationMs: performance.now() - startedAt,
        method: context.req.method,
        path: context.req.path,
        requestId,
        status: context.res.status,
      });
    }
  });

  app.use(async (context, next) => {
    if (!isMcpSurfacePath(context.req.path)) return next();
    if (!input.mcpEnabled) return new Response(null, { status: 404 });
    if (!input.publicBaseUrl) return new Response(null, { status: 503 });
    const canonical = new URL(input.publicBaseUrl);
    const request = context.req.raw;
    const suppliedOrigin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (
      new URL(request.url).host !== canonical.host ||
      (host !== null && host !== canonical.host) ||
      (suppliedOrigin !== null && suppliedOrigin !== canonical.origin)
    )
      return new Response(null, { status: 403 });
    return next();
  });
  const payloadTooLarge = (path: string) =>
    isMcpSurfacePath(path)
      ? protocolErrorResponse("invalid_request", 413)
      : errorResponse(transportError("PAYLOAD_TOO_LARGE"));
  const jsonBodyLimit = bodyLimit({
    maxSize: input.maxBodyBytes,
    onError: (context) => payloadTooLarge(context.req.path),
  });
  app.use((context, next) => {
    const request = context.req.raw;
    const hasBodyHeaders =
      request.headers.has("content-length") || request.headers.has("transfer-encoding");
    if (context.get("lace.routePolicy")?.bodyLimit === "media-upload") return next();
    if (request.headers.get("content-length") === "0" && !request.headers.has("transfer-encoding"))
      return next();
    if (!hasBodyHeaders) {
      return (async () => {
        const reader = request.clone().body?.getReader();
        if (reader === undefined) return next();
        let size = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > input.maxBodyBytes) return payloadTooLarge(context.req.path);
        }
        return next();
      })();
    }
    return jsonBodyLimit(context, next);
  });
  // A Bearer credential on a management route is an import token or nothing:
  // it never falls back to the session cookie (ADR 0016). This runs before the
  // rate limiter so upload limits count the import actor.
  app.use(async (context, next) => {
    const request = context.req.raw;
    if (!isBearerManagementRequest(request, context.req.path)) return next();
    // A Bearer credential is not accepted on this route or without an import resolver.
    const auth = context.get("lace.routePolicy")?.auth;
    if (
      input.importActors === undefined ||
      !acceptsImport(auth) ||
      isReservedImportPath(context.req.path)
    )
      throw new AuthorizationError();
    const resolved = await input.importActors.resolve(request);
    // A foreign origin is refused independently of the credential.
    if (resolved === "request-denied") throw new AuthorizationError();
    if (resolved === null) throw new AuthenticationRequiredError(authenticationChallenge(auth));
    context.set("lace.actor", resolved.actor);
    context.set("lace.importToken", resolved.token);
    context.set("lace.sessionId", null);
    return next();
  });
  app.use(async (context, next) => {
    if (context.get("lace.routePolicy")?.auth === "mcp") {
      if (!input.mcp) return new Response(null, { status: 503 });
      let scope: "content:read" | "content:write" | "content:publish" = "content:read";
      if (context.req.method === "POST") {
        try {
          const value: unknown = await context.req.raw.clone().json();
          if (
            typeof value === "object" &&
            value !== null &&
            "method" in value &&
            value.method === "tools/call" &&
            "params" in value &&
            typeof value.params === "object" &&
            value.params !== null &&
            "name" in value.params
          )
            scope = mcpToolScope(value.params.name) ?? scope;
        } catch {
          /* Protocol syntax remains SDK-owned. */
        }
      }
      const resolved = await input.mcp.resolve(context.req.raw, scope);
      if (resolved.response) return resolved.response;
      context.set("lace.actor", resolved.actor);
    }
    const limit = routeSensitiveLimit(
      context.get("lace.routePolicy"),
      context.req.method,
      context.req.path,
    );
    const resolvedActor = limit?.scope === "actor" ? await actor(context) : undefined;
    const decision = await input.rateLimiter.check({
      ...(resolvedActor === undefined ? {} : { actor: resolvedActor }),
      clientAddress: context.get("lace.clientAddress"),
      limit: limit ?? null,
      request: context.req.raw,
      requestId: context.get("lace.requestId") as string,
    });
    const allowed = typeof decision === "boolean" ? decision : decision.allowed;
    if (!allowed) {
      const retryAfterSeconds = typeof decision === "boolean" ? 60 : decision.retryAfterSeconds;
      if (isProtocolErrorPath(context.req.path))
        return protocolErrorResponse("temporarily_unavailable", 429, {
          "retry-after": String(retryAfterSeconds),
          ...noStore,
        });
      // The classifier owns the 429 envelope and its whole-second Retry-After.
      throw new RateLimitExceededError(retryAfterSeconds);
    }
    await next();
  });

  registerProtocolRoutes(app, routeContext);
  registerHealthRoutes(app, routeContext);
  const v1 = new Hono();
  registerSetupSessionRoutes(v1, routeContext);
  registerAccountRoutes(v1, routeContext);
  registerAdminUserRoutes(v1, routeContext);
  registerCredentialRoutes(v1, routeContext);
  registerBuildRoutes(v1, routeContext);
  registerMediaRoutes(v1, routeContext);
  registerContentRoutes(v1, routeContext);
  registerPublicRoutes(v1, routeContext);
  registerOpenApiRoute(v1, app, routeContext);
  app.route(API_V1, v1);
  registerDocsRoutes(app, routeContext);

  app.notFound(async (context) => {
    if (
      input.adminAssets !== undefined &&
      !context.req.path.startsWith("/api/") &&
      context.req.path !== "/health/live" &&
      context.req.path !== "/health/ready"
    )
      return input.adminAssets.fetch(context.req.raw);
    return notFound();
  });

  return app;
}
