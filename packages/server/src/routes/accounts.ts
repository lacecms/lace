import {
  AuthorizationError,
  noStore,
  notFound,
  parse,
  response,
  validationHook,
} from "../shared/http.js";
import { optionalJsonBody } from "../shared/request.js";
import {
  accountCapabilitiesSchema,
  oauthConnectionListSchema,
  oauthConnectionListQuerySchema,
  oauthConnectionRevokeSchema,
  adminSessionSchema,
  errorEnvelopeSchema,
  identifierSchemaPublic,
  toIsoTimestamp,
  accountPasswordChangeRequestSchema,
  accountProfileUpdateRequestSchema,
  accountSessionListSchema,
  invitationAcceptRequestSchema,
  invitationAcceptResultSchema,
  invitationInspectRequestSchema,
  invitationInspectResultSchema,
  passwordResetConfirmRequestSchema,
  passwordResetRequestSchema,
  sessionRevocationResultSchema,
  sessionRevokeRequestSchema,
} from "@lacecms/contracts";
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import type { RouteContext } from "../composition/route-context.js";

export function registerAccountRoutes(app: Hono, routeContext: RouteContext): void {
  const { actor, currentSessionId } = routeContext.actors;
  const { capabilities } = routeContext;
  const { accounts, deferTask, sessionSummary } = capabilities;
  app.post(
    "/api/v1/invitations/inspect",
    describeRoute({
      summary: "Inspect an invitation token",
      tags: ["account"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(invitationInspectResultSchema) } },
          description: "Invited email, role and expiry",
        },
        410: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "Unknown, expired, revoked or accepted invitation",
        },
      },
    }),
    validator("json", invitationInspectRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<
        typeof invitationInspectRequestSchema
      >;
      const found = await accounts().inspectInvitation(body);
      return response(
        invitationInspectResultSchema,
        { email: found.email, expiresAt: toIsoTimestamp(found.expiresAt), role: found.role },
        200,
        noStore,
      );
    },
  );
  app.post(
    "/api/v1/invitations/accept",
    describeRoute({
      summary: "Accept an invitation by choosing a password",
      tags: ["account"],
      responses: {
        201: {
          content: { "application/json": { schema: resolver(invitationAcceptResultSchema) } },
          description: "Account created; sign in with the returned email",
        },
        409: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "An account for the address already exists",
        },
        410: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "Unknown, expired, revoked or accepted invitation",
        },
      },
    }),
    validator("json", invitationAcceptRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<typeof invitationAcceptRequestSchema>;
      return response(
        invitationAcceptResultSchema,
        await accounts().acceptInvitation({
          ...(body.displayName === undefined ? {} : { displayName: body.displayName }),
          password: body.password,
          token: body.token,
        }),
        201,
        noStore,
      );
    },
  );
  app.post(
    "/api/v1/password-reset/request",
    describeRoute({
      summary: "Request a password reset link",
      tags: ["account"],
      responses: {
        202: { description: "Accepted; identical whether or not the address has an account" },
      },
    }),
    validator("json", passwordResetRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<typeof passwordResetRequestSchema>;
      await accounts().requestPasswordReset({ defer: deferTask(context), email: body.email });
      return new Response(null, { headers: noStore, status: 202 });
    },
  );
  app.post(
    "/api/v1/password-reset/confirm",
    describeRoute({
      summary: "Choose a new password with a reset token",
      tags: ["account"],
      responses: {
        204: { description: "Password replaced and every session ended" },
        410: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "Unknown, expired, consumed or superseded reset link",
        },
      },
    }),
    validator("json", passwordResetConfirmRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<
        typeof passwordResetConfirmRequestSchema
      >;
      await accounts().confirmPasswordReset(body);
      return new Response(null, { headers: noStore, status: 204 });
    },
  );

  app.patch(
    "/api/v1/account",
    describeRoute({
      summary: "Change the signed-in user's display name",
      tags: ["account"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(adminSessionSchema) } },
          description: "Updated session summary",
        },
      },
    }),
    validator("json", accountProfileUpdateRequestSchema, validationHook),
    async (context) => {
      const resolvedActor = await actor(context);
      const body = context.req.valid("json") as v.InferOutput<
        typeof accountProfileUpdateRequestSchema
      >;
      await accounts().updateDisplayName(resolvedActor, body.displayName);
      return sessionSummary(resolvedActor);
    },
  );
  app.post(
    "/api/v1/account/password",
    describeRoute({
      summary: "Change the signed-in user's password",
      tags: ["account"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(sessionRevocationResultSchema) } },
          description: "Password changed; count of other sessions ended",
        },
        400: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "The current password is incorrect",
        },
      },
    }),
    validator("json", accountPasswordChangeRequestSchema, validationHook),
    async (context) => {
      const resolvedActor = await actor(context);
      const body = context.req.valid("json") as v.InferOutput<
        typeof accountPasswordChangeRequestSchema
      >;
      return response(
        sessionRevocationResultSchema,
        await accounts().changePassword(resolvedActor, await currentSessionId(context), {
          currentPassword: body.currentPassword,
          defer: deferTask(context),
          newPassword: body.newPassword,
          signOutOtherSessions: body.signOutOtherSessions,
        }),
      );
    },
  );
  app.get("/api/v1/account/capabilities", async (context) => {
    await actor(context);
    return response(
      accountCapabilitiesSchema,
      {
        mcpEnabled: capabilities.mcpEnabled === true && capabilities.oauthConnections !== undefined,
      },
      200,
      noStore,
    );
  });
  if (capabilities.mcpEnabled && capabilities.oauthConnections) {
    const connections = capabilities.oauthConnections;
    app.get("/api/v1/account/mcp-connections", async (context) => {
      const resolvedActor = await actor(context);
      const query = parse(oauthConnectionListQuerySchema, context.req.query());
      const limit = query.limit === undefined ? 20 : Number(query.limit);
      const items = await connections.list(resolvedActor, {
        ...(query.after === undefined ? {} : { after: query.after }),
        limit,
      });
      return response(
        oauthConnectionListSchema,
        {
          items: items.map((item) => ({
            id: item.id,
            clientName: item.clientName,
            scopes: [...item.scopes],
            createdAt: toIsoTimestamp(item.createdAt),
            expiresAt: toIsoTimestamp(item.expiresAt),
            revokedAt: item.revokedAt === null ? null : toIsoTimestamp(item.revokedAt),
            ...(item.lastUsedAt === undefined
              ? {}
              : { lastUsedAt: toIsoTimestamp(item.lastUsedAt) }),
          })),
          nextCursor: items.length === limit ? items.at(-1)!.id : null,
        },
        200,
        noStore,
      );
    });
    app.post("/api/v1/account/mcp-connections/:connectionId/revoke", async (context) => {
      const resolvedActor = await actor(context);
      if (
        context.req.header("origin") !==
        new URL(capabilities.publicBaseUrl ?? context.req.url).origin
      )
        throw new AuthorizationError();
      parse(oauthConnectionRevokeSchema, await optionalJsonBody(context.req.raw));
      const connectionId = parse(identifierSchemaPublic, context.req.param("connectionId"));
      if (!(await connections.revoke(resolvedActor, connectionId))) return notFound();
      return new Response(null, { status: 204, headers: noStore });
    });
  }

  app.get(
    "/api/v1/account/sessions",
    describeRoute({
      summary: "List the signed-in user's sessions",
      tags: ["account"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(accountSessionListSchema) } },
          description: "Sessions without tokens or IP addresses",
        },
      },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      const items = await accounts().listSessions(resolvedActor, await currentSessionId(context));
      return response(
        accountSessionListSchema,
        {
          items: items.map((item) => ({
            browser: item.browser,
            createdAt: toIsoTimestamp(item.createdAt),
            current: item.current,
            id: item.id,
            lastActiveAt: toIsoTimestamp(item.lastActiveAt),
            os: item.os,
          })),
        },
        200,
        noStore,
      );
    },
  );
  app.delete(
    "/api/v1/account/sessions/:sessionId",
    describeRoute({
      summary: "End another session of the signed-in user",
      tags: ["account"],
      responses: {
        204: { description: "Session ended" },
        404: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "No such session for this user",
        },
        409: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "The current session is ended by signing out instead",
        },
      },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      const sessionId = parse(identifierSchemaPublic, context.req.param("sessionId"));
      await accounts().deleteSession(resolvedActor, await currentSessionId(context), sessionId);
      return new Response(null, { status: 204 });
    },
  );
  app.post(
    "/api/v1/account/sessions/revoke-others",
    describeRoute({
      summary: "End every other session of the signed-in user",
      tags: ["account"],
      requestBody: {
        content: { "application/json": { schema: resolver(sessionRevokeRequestSchema) } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: resolver(sessionRevocationResultSchema) } },
          description: "Count of sessions ended",
        },
      },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      parse(sessionRevokeRequestSchema, await optionalJsonBody(context.req.raw));
      return response(
        sessionRevocationResultSchema,
        await accounts().deleteOtherSessions(resolvedActor, await currentSessionId(context)),
      );
    },
  );
}
