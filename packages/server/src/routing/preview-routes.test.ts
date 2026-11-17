import { expect, it } from "vitest";
import { previewRoutes } from "./preview-routes.js";
import { acceptsImport, type RoutePolicy } from "./route-policy.js";
import { v1RoutePolicies } from "./v1-routes.js";

it("defines preview credential boundaries without activating any preview routes", () => {
  const routes = Object.values(previewRoutes).flatMap((family) =>
    Object.values<RoutePolicy>(family),
  );
  expect(routes.every(({ auth }) => !acceptsImport(auth) && auth !== "build")).toBe(true);
  expect(Object.values(previewRoutes.admin).every(({ auth }) => auth === "session")).toBe(true);
  expect(previewRoutes.host.artifactHead.auth).toBe("preview-session");
  expect(previewRoutes.runner.claim.auth).toBe("preview-bootstrap");
  expect(previewRoutes.runner.upload.auth).toBe("preview-claim");
  expect(previewRoutes.builder.dispatch.auth).toBe("preview-builder");
  expect(routes.some((route) => v1RoutePolicies.includes(route))).toBe(false);
});
