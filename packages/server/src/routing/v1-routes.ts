import { mcpContentOperations } from "@lacecms/application";
import { defineRoute, type RoutePolicy } from "./route-policy.js";

import { previewRoutes } from "./preview-routes.js";

export const API_V1 = "/api/v1";

export const v1Routes = {
  content: {
    models: defineRoute("GET", "/admin/content-models", "session-or-import", {
      mcpOperation: mcpContentOperations.list_content_models,
    }),
    listEntries: defineRoute("GET", "/admin/models/:modelKey/entries", "session-or-import", {
      mcpOperation: mcpContentOperations.list_entries,
    }),
    createEntry: defineRoute("POST", "/admin/models/:modelKey/entries", "session-or-import", {
      mcpOperation: mcpContentOperations.create_entry,
    }),
    referenceTargets: defineRoute("GET", "/admin/reference-targets", "session"),
    resolveReferenceTargets: defineRoute("POST", "/admin/reference-targets/resolve", "session"),
    linkTargets: defineRoute("GET", "/admin/link-targets", "session"),
    resolveLinkTargets: defineRoute("POST", "/admin/link-targets/resolve", "session"),
    referenceImpact: defineRoute("GET", "/admin/entries/:entryId/reference-impact", "session"),
    linkImpact: defineRoute("GET", "/admin/entries/:entryId/link-impact", "session"),
    getEntry: defineRoute("GET", "/admin/entries/:entryId", "session-or-import", {
      mcpOperation: mcpContentOperations.get_entry,
    }),
    saveDraft: defineRoute("PUT", "/admin/entries/:entryId/draft", "session-or-import", {
      mcpOperation: mcpContentOperations.save_draft,
    }),
    publishEntry: defineRoute("POST", "/admin/entries/:entryId/publish", "session-or-import", {
      mcpOperation: mcpContentOperations.publish_entry,
    }),
    unpublishEntry: defineRoute("POST", "/admin/entries/:entryId/unpublish", "session"),
    revertDraft: defineRoute("POST", "/admin/entries/:entryId/revert", "session"),
    duplicateEntry: defineRoute("POST", "/admin/entries/:entryId/duplicate", "session"),
    deleteEntry: defineRoute("DELETE", "/admin/entries/:entryId", "session"),
  },
  media: {
    list: defineRoute("GET", "/admin/media", "session-or-import"),
    tags: defineRoute("GET", "/admin/media/tags", "session"),
    upload: defineRoute("POST", "/admin/media", "session-or-import", {
      bodyLimit: "media-upload",
      rateLimit: { operation: "upload", scope: "actor" },
    }),
    delete: defineRoute("DELETE", "/admin/media/:mediaId", "session"),
    get: defineRoute("GET", "/admin/media/:mediaId", "session-or-import"),
    update: defineRoute("PATCH", "/admin/media/:mediaId", "session-or-import"),
    retryDeletion: defineRoute("POST", "/admin/media/:mediaId/retry-deletion", "session"),
    binary: defineRoute("GET", "/public/media/:mediaId", "public"),
    preview: defineRoute("GET", "/admin/media/:mediaId/preview", "session"),
    thumbnail: defineRoute("GET", "/admin/media/:mediaId/thumbnail", "session"),
  },
  credentials: {
    listBuild: defineRoute("GET", "/admin/api-tokens", "session"),
    issueBuild: defineRoute("POST", "/admin/api-tokens", "session", {
      rateLimit: { operation: "token", scope: "actor" },
    }),
    revokeBuild: defineRoute("DELETE", "/admin/api-tokens/:tokenId", "session", {
      rateLimit: { operation: "token", scope: "actor" },
    }),
    listImport: defineRoute("GET", "/admin/import-tokens", "session"),
    issueImport: defineRoute("POST", "/admin/import-tokens", "session", {
      rateLimit: { operation: "token", scope: "actor" },
    }),
    revokeImport: defineRoute("DELETE", "/admin/import-tokens/:tokenId", "session", {
      rateLimit: { operation: "token", scope: "actor" },
    }),
    describeImport: defineRoute("GET", "/admin/import-credential", "import-only"),
  },
  accounts: {
    inspectInvitation: defineRoute("POST", "/invitations/inspect", "public", {
      rateLimit: { operation: "auth", scope: "client" },
    }),
    acceptInvitation: defineRoute("POST", "/invitations/accept", "public", {
      rateLimit: { operation: "auth", scope: "client" },
    }),
    requestReset: defineRoute("POST", "/password-reset/request", "public", {
      rateLimit: { operation: "auth", scope: "client" },
    }),
    confirmReset: defineRoute("POST", "/password-reset/confirm", "public", {
      rateLimit: { operation: "auth", scope: "client" },
    }),
    profile: defineRoute("PATCH", "/account", "session"),
    password: defineRoute("POST", "/account/password", "session", {
      rateLimit: { operation: "auth", scope: "actor" },
    }),
    capabilities: defineRoute("GET", "/account/capabilities", "session"),
    connections: defineRoute("GET", "/account/mcp-connections", "session"),
    revokeConnection: defineRoute(
      "POST",
      "/account/mcp-connections/:connectionId/revoke",
      "session",
      { rateLimit: { operation: "oauth-revoke", scope: "actor" } },
    ),
    sessions: defineRoute("GET", "/account/sessions", "session"),
    revokeSession: defineRoute("DELETE", "/account/sessions/:sessionId", "session"),
    revokeOtherSessions: defineRoute("POST", "/account/sessions/revoke-others", "session"),
  },
  adminUsers: {
    users: defineRoute("GET", "/admin/users", "session"),
    createUser: defineRoute("POST", "/admin/users", "session", {
      rateLimit: { operation: "invite", scope: "actor" },
    }),
    invitations: defineRoute("GET", "/admin/invitations", "session"),
    invite: defineRoute("POST", "/admin/invitations", "session", {
      rateLimit: { operation: "invite", scope: "actor" },
    }),
    resendInvitation: defineRoute("POST", "/admin/invitations/:invitationId/resend", "session", {
      rateLimit: { operation: "invite", scope: "actor" },
    }),
    revokeInvitation: defineRoute("DELETE", "/admin/invitations/:invitationId", "session", {
      rateLimit: { operation: "invite", scope: "actor" },
    }),
    resetUserPassword: defineRoute("POST", "/admin/users/:userId/password-reset", "session", {
      rateLimit: { operation: "invite", scope: "actor" },
    }),
    revokeUserSessions: defineRoute("POST", "/admin/users/:userId/sessions/revoke", "session"),
    updateUser: defineRoute("PATCH", "/admin/users/:userId", "session"),
  },
  builds: {
    buildSite: defineRoute("GET", "/admin/build-site", "session"),
    list: defineRoute("GET", "/admin/site-builds", "session"),
    get: defineRoute("GET", "/admin/site-builds/:buildId", "session"),
    request: defineRoute("POST", "/admin/builds", "session"),
    retry: defineRoute("POST", "/admin/builds/:buildId/retry", "session"),
  },
  public: {
    global: defineRoute("GET", "/public/globals/:modelKey", "public"),
    page: defineRoute("GET", "/public/pages/:modelKey", "public"),
    records: defineRoute("GET", "/public/records/:modelKey", "public"),
    collection: defineRoute("GET", "/public/collections/:modelKey", "public"),
    collectionItem: defineRoute("GET", "/public/collections/:modelKey/:slug", "public"),
    byPath: defineRoute("GET", "/public/content/by-path", "public"),
    buildExport: defineRoute("GET", "/public/build-export", "build"),
    buildThumbnail: defineRoute("GET", "/public/build-media/:mediaId/thumbnail", "build"),
  },
  setupSession: {
    setupState: defineRoute("GET", "/setup/state", "public"),
    setupAdmin: defineRoute("POST", "/setup/admin", "public", {
      rateLimit: { operation: "setup", scope: "client" },
    }),
    session: defineRoute("GET", "/admin/session", "session"),
    status: defineRoute("GET", "/admin/settings/status", "session"),
    emailTest: defineRoute("POST", "/admin/settings/email-test", "session", {
      rateLimit: { operation: "email", scope: "actor" },
    }),
  },
  preview: {
    config: previewRoutes.admin.config,
    status: previewRoutes.admin.status,
    create: previewRoutes.admin.create,
  },
  documentation: { openApi: defineRoute("GET", "/openapi.json", "public") },
} as const;

export const v1RoutePolicies = Object.values(v1Routes).flatMap((family) =>
  Object.values<RoutePolicy>(family),
);
