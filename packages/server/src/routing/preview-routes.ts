import { defineRoute } from "./route-policy.js";

const rateLimit = { operation: "preview-access", scope: "client" } as const;

/** Separate mounts: these policies are dormant until preview composition is enabled. */
export const previewRoutes = {
  admin: {
    config: defineRoute("GET", "/admin/preview/config", "session"),
    status: defineRoute("GET", "/admin/entries/:entryId/preview", "session"),
    create: defineRoute("POST", "/admin/entries/:entryId/preview", "session"),
    authorize: defineRoute("GET", "/admin/preview/authorize", "session", { rateLimit }),
  },
  host: {
    start: defineRoute("GET", "/access/start", "preview-handoff", { rateLimit }),
    callback: defineRoute("GET", "/access/callback", "preview-handoff"),
    redeem: defineRoute("POST", "/access/callback", "preview-handoff", { rateLimit }),
    view: defineRoute("GET", "/view/:generationId", "preview-session"),
    artifact: defineRoute("GET", "/p/:generationId/*", "preview-session"),
    artifactHead: defineRoute("HEAD", "/p/:generationId/*", "preview-session"),
  },
  runner: {
    claim: defineRoute("POST", "/preview-runner/:generationId/claim", "preview-bootstrap"),
    input: defineRoute("GET", "/preview-runner/:generationId/input", "preview-claim"),
    manifest: defineRoute(
      "POST",
      "/preview-runner/:generationId/artifacts/manifest",
      "preview-claim",
    ),
    upload: defineRoute("PUT", "/preview-runner/:generationId/artifacts/*", "preview-claim"),
    complete: defineRoute("POST", "/preview-runner/:generationId/complete", "preview-claim"),
  },
  builder: {
    reserve: defineRoute("PUT", "/preview", "preview-builder"),
    dispatch: defineRoute("POST", "/preview", "preview-builder"),
    stop: defineRoute("DELETE", "/preview", "preview-builder"),
  },
} as const;
