import type { Context, Hono, Next } from "hono";
import type { LaceAppInput } from "../composition/input.js";
import {
  previewHandoffRoutes,
  previewResponse,
  privatePreviewHeaders,
} from "../preview/handoff.js";
import { previewArtifact } from "../preview/artifact.js";
import { previewViewer } from "../preview/viewer.js";
import { withRoutePolicy } from "../routing/route-matching.js";
import { previewRoutes } from "../routing/preview-routes.js";
import { API_V1 } from "../routing/v1-routes.js";

/** Preview ingress never falls through to CMS routes, even for unknown methods and paths. */
export function previewIngress(
  app: Hono,
  input: Pick<
    LaceAppInput,
    | "preview"
    | "previewArtifacts"
    | "previewRunner"
    | "previewRawPath"
    | "clientAddress"
    | "rateLimiter"
    | "requestIds"
  >,
) {
  if (!input.preview) return () => {};
  const access = input.preview;
  const { adminOrigin, previewOrigin } = access;
  const previewHost = new URL(previewOrigin).host;
  const adminHost = new URL(adminOrigin).host;
  const handoff = previewHandoffRoutes(access);
  const { start, callback, redeem } = previewRoutes.host;
  const hostRoutes = [
    { policy: start, handler: handoff.start },
    { policy: callback, handler: handoff.callback },
    { policy: redeem, handler: handoff.redeem },
  ];
  app.use(async (context: Context, next: Next) => {
    const request = context.req.raw;
    const { host, pathname } = new URL(request.url);
    const header = request.headers.get("host");
    const rawPath =
      input.previewRawPath?.(request) ??
      request.url.replace(/^https?:\/\/[^/]+/u, "").split("?", 1)[0];
    if (pathname.startsWith(`${API_V1}/preview-runner/`)) {
      if (
        !input.previewRunner ||
        host !== input.previewRunner.origin.host ||
        (header !== null && header !== host) ||
        rawPath !== pathname
      )
        return previewResponse(404);
      try {
        return await input.previewRunner.fetch(request);
      } catch {
        return previewResponse(503);
      }
    }
    if (
      input.previewRunner &&
      request.method === "GET" &&
      (header === null || header === host) &&
      (host === input.previewRunner.origin.host || new URL(request.url).hostname === "127.0.0.1") &&
      (pathname === "/health/live" || pathname === "/health/ready")
    )
      return next();
    if (
      input.previewRunner &&
      host === input.previewRunner.origin.host &&
      (header === null || header === host) &&
      (request.method === "GET" || request.method === "HEAD") &&
      (pathname === `${API_V1}/public/build-export` ||
        pathname.startsWith(`${API_V1}/public/media/`))
    )
      return next();
    if ((header !== null && header !== host) || (host !== adminHost && host !== previewHost))
      return previewResponse(404);
    if (host === adminHost) return next();
    if (
      request.headers.has("service-worker") ||
      request.headers.get("sec-fetch-dest") === "serviceworker"
    )
      return previewResponse(404);
    // Neither a rewritten path nor an encoded path is accepted as an alias.
    if (rawPath !== pathname) return previewResponse(404);
    const route = hostRoutes.find(
      ({ policy }) => policy.method === request.method && policy.path === pathname,
    );
    const file =
      input.previewArtifacts &&
      (request.method === previewRoutes.host.artifact.method ||
        request.method === previewRoutes.host.artifactHead.method) &&
      pathname.startsWith("/p/");
    const view =
      input.previewArtifacts &&
      request.method === previewRoutes.host.view.method &&
      pathname.startsWith("/view/");
    if (!route && !file && !view) return previewResponse(404);
    const origin = request.headers.get("origin");
    if (origin !== null && origin !== adminOrigin && origin !== previewOrigin)
      return previewResponse(403);
    if (request.headers.has("authorization")) return previewResponse(401);
    if (view) return previewViewer(request, pathname, access);
    if (!route) return previewArtifact(request, pathname, access, input.previewArtifacts!);
    if (typeof route.policy.rateLimit === "object") {
      const decision = await input.rateLimiter.check({
        request,
        requestId: input.requestIds.next(),
        clientAddress: input.clientAddress?.(request) ?? "0.0.0.0",
        limit: route.policy.rateLimit,
      });
      if (decision === false || (typeof decision !== "boolean" && !decision.allowed)) {
        const headers = privatePreviewHeaders();
        headers.set(
          "retry-after",
          String(typeof decision === "boolean" ? 60 : decision.retryAfterSeconds),
        );
        return new Response(null, { status: 429, headers });
      }
    }
    return route.handler(request);
  });
  return () => {
    const authorize = previewRoutes.admin.authorize;
    app.get(
      API_V1 + authorize.path,
      withRoutePolicy(authorize, (context: Context) => handoff.authorize(context.req.raw)),
    );
  };
}
