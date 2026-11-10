import {
  accountCapabilitiesSchema,
  oauthConnectionListSchema,
  mcpConsentDetailsSchema,
  mcpConsentNavigationSchema,
  accountSessionListSchema,
  adminPasswordResetResultSchema,
  adminSessionSchema,
  invitationAcceptResultSchema,
  invitationInspectResultSchema,
  invitationIssueResultSchema,
  invitationListSchema,
  sessionRevocationResultSchema,
  setupStateSchema,
  setupAdminRequestSchema,
  managedUserListSchema,
  managedUserSchema,
} from "@lacecms/contracts";
import * as v from "valibot";
import {
  AdminClientError,
  request,
  postJson,
  withoutIssues,
  parse,
  type Fetcher,
} from "../admin-transport.js";
import type { AdminClient } from "../admin-client-types.js";

export function accountsClient(fetcher: Fetcher) {
  return {
    loadSetupState: async () =>
      parse(setupStateSchema, await request(fetcher, "/api/v1/setup/state", { cache: "no-store" })),
    setupAdmin: async (input: Parameters<AdminClient["setupAdmin"]>[0]) => {
      const validated = v.safeParse(setupAdminRequestSchema, input);
      if (!validated.success)
        throw new AdminClientError({
          message: "Check the email, password and bootstrap token.",
          status: 422,
        });
      try {
        parse(
          managedUserSchema,
          await request(fetcher, "/api/v1/setup/admin", {
            body: JSON.stringify(validated.output),
            headers: { "content-type": "application/json" },
            method: "POST",
          }),
        );
      } catch (error) {
        // Never propagate provider text or validation objects that could echo submitted credentials.
        throw new AdminClientError({
          message: "Administrator setup could not be confirmed.",
          ...(error instanceof AdminClientError && error.status !== undefined
            ? { status: error.status }
            : {}),
        });
      }
    },
    updateUser: async (userId: string, input: Parameters<AdminClient["updateUser"]>[1]) =>
      parse(
        managedUserSchema,
        await request(fetcher, `/api/v1/admin/users/${encodeURIComponent(userId)}`, {
          body: JSON.stringify(input),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        }),
      ),
    listUsers: async () =>
      parse(managedUserListSchema, await request(fetcher, "/api/v1/admin/users")),
    signOutUser: async (userId: string) =>
      parse(
        sessionRevocationResultSchema,
        await postJson(
          fetcher,
          `/api/v1/admin/users/${encodeURIComponent(userId)}/sessions/revoke`,
          {},
        ),
      ),
    sendPasswordReset: async (userId: string) =>
      parse(
        adminPasswordResetResultSchema,
        await postJson(
          fetcher,
          `/api/v1/admin/users/${encodeURIComponent(userId)}/password-reset`,
          {},
        ),
      ),
    listInvitations: async () =>
      parse(invitationListSchema, await request(fetcher, "/api/v1/admin/invitations")),
    createInvitation: async (input: Parameters<AdminClient["createInvitation"]>[0]) =>
      parse(
        invitationIssueResultSchema,
        await postJson(fetcher, "/api/v1/admin/invitations", input),
      ),
    resendInvitation: async (invitationId: string) =>
      parse(
        invitationIssueResultSchema,
        await postJson(
          fetcher,
          `/api/v1/admin/invitations/${encodeURIComponent(invitationId)}/resend`,
          {},
        ),
      ),
    revokeInvitation: async (invitationId: string) => {
      await request(fetcher, `/api/v1/admin/invitations/${encodeURIComponent(invitationId)}`, {
        method: "DELETE",
      });
    },
    inspectInvitation: async (token: string) =>
      parse(
        invitationInspectResultSchema,
        await withoutIssues(postJson(fetcher, "/api/v1/invitations/inspect", { token })),
      ),
    acceptInvitation: async (input: Parameters<AdminClient["acceptInvitation"]>[0]) =>
      parse(
        invitationAcceptResultSchema,
        await withoutIssues(postJson(fetcher, "/api/v1/invitations/accept", input)),
      ),
    requestPasswordReset: async (email: string) => {
      await postJson(fetcher, "/api/v1/password-reset/request", { email });
    },
    confirmPasswordReset: async (input: Parameters<AdminClient["confirmPasswordReset"]>[0]) => {
      await withoutIssues(postJson(fetcher, "/api/v1/password-reset/confirm", input));
    },
    updateProfile: async (input: Parameters<AdminClient["updateProfile"]>[0]) =>
      parse(
        adminSessionSchema,
        await request(fetcher, "/api/v1/account", {
          body: JSON.stringify(input),
          headers: { "content-type": "application/json" },
          method: "PATCH",
        }),
      ),
    changePassword: async (input: Parameters<AdminClient["changePassword"]>[0]) =>
      parse(
        sessionRevocationResultSchema,
        await withoutIssues(postJson(fetcher, "/api/v1/account/password", input)),
      ),
    loadAccountCapabilities: async () =>
      parse(accountCapabilitiesSchema, await request(fetcher, "/api/v1/account/capabilities")),
    listMcpConnections: async (after?: string) =>
      parse(
        oauthConnectionListSchema,
        await request(
          fetcher,
          `/api/v1/account/mcp-connections${after ? `?after=${encodeURIComponent(after)}` : ""}`,
        ),
      ),
    revokeMcpConnection: async (id: string) => {
      await postJson(
        fetcher,
        `/api/v1/account/mcp-connections/${encodeURIComponent(id)}/revoke`,
        {},
      );
    },
    loadMcpConsent: async (transaction: string) =>
      parse(
        mcpConsentDetailsSchema,
        await request(
          fetcher,
          `/api/auth/oauth2/authorize?transaction=${encodeURIComponent(transaction)}`,
          { headers: { accept: "application/json" } },
        ),
      ),
    submitMcpConsent: async (input: { transaction: string; accept: boolean; scope: string }) =>
      parse(
        mcpConsentNavigationSchema,
        await request(fetcher, "/api/auth/oauth2/consent", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify(input),
        }),
      ),
    listSessions: async () =>
      parse(accountSessionListSchema, await request(fetcher, "/api/v1/account/sessions")),
    deleteSession: async (sessionId: string) => {
      await request(fetcher, `/api/v1/account/sessions/${encodeURIComponent(sessionId)}`, {
        method: "DELETE",
      });
    },
    revokeOtherSessions: async () =>
      parse(
        sessionRevocationResultSchema,
        await postJson(fetcher, "/api/v1/account/sessions/revoke-others", {}),
      ),
    signIn: async (email: string, password: string) => {
      await request(fetcher, "/api/auth/sign-in/email", {
        body: JSON.stringify({ email, password }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
    },
    signOut: async () => {
      await request(fetcher, "/api/auth/sign-out", { method: "POST" });
    },
  };
}
