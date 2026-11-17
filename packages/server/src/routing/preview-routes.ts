import { defineRoute } from "./route-policy.js";

/** Separate mounts: these policies are dormant until preview composition is enabled. */
export const previewRoutes = {
  admin: {
    config: defineRoute("GET", "/admin/preview/config", "session"),
    status: defineRoute("GET", "/admin/entries/:entryId/preview", "session"),
    create: defineRoute("POST", "/admin/entries/:entryId/preview", "session"),
    authorize: defineRoute("GET", "/admin/preview/authorize", "session"),
  },
  host: {
    start: defineRoute("GET", "/access/start", "preview-handoff"),
    callback: defineRoute("GET", "/access/callback", "preview-handoff"),
    view: defineRoute("GET", "/view/:generationId", "preview-session"),
    artifact: defineRoute("GET", "/p/:generationId/*", "preview-session"),
    artifactHead: defineRoute("HEAD", "/p/:generationId/*", "preview-session"),
  },
  runner: {
    claim: defineRoute("POST", "/preview-runner/:generationId/claim", "preview-bootstrap"),
    input: defineRoute("GET", "/preview-runner/:generationId/input", "preview-claim"),
    upload: defineRoute("PUT", "/preview-runner/:generationId/artifacts/*", "preview-claim"),
    complete: defineRoute("POST", "/preview-runner/:generationId/complete", "preview-claim"),
  },
  builder: {
    dispatch: defineRoute("POST", "/preview", "preview-builder"),
  },
} as const;
