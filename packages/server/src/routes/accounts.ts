import { mountOptionalRoutes } from "../routing/optional-routes.js";
import {
  bodyResponse,
  AuthorizationError,
  noStore,
  notFound,
  parse,
  response,
} from "../shared/http.js";
import { optionalJsonBody } from "../shared/request.js";
import {
  authenticationFailure,
  authorizationFailure,
  describePolicy,
  openApiParameterSchema,
  validate,
  validationFailure,
} from "../shared/openapi.js";
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
import { resolver } from "hono-openapi";
import type { RouteContext } from "../composition/route-context.js";
import { v1Routes } from "../routing/v1-routes.js";

const routes = v1Routes.accounts;

export function createAccountRoutes(routeContext: RouteContext) {
  const { actor, currentSessionId } = routeContext.actors;
  const { capabilities } = routeContext;
  const { accounts, deferTask, sessionSummary } = capabilities;
  const accountRoutes = new Hono()
    .on(
      routes.inspectInvitation.method,
      routes.inspectInvitation.path,
      describePolicy(routes.inspectInvitation, {
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
          ...validationFailure(),
        },
      }),
      validate("json", invitationInspectRequestSchema),
      async (context) => {
        const body = context.req.valid("json");
        const found = await accounts().inspectInvitation(body);
        return response(
          invitationInspectResultSchema,
          { email: found.email, expiresAt: toIsoTimestamp(found.expiresAt), role: found.role },
          200,
          noStore,
        );
      },
    )
    .on(
      routes.acceptInvitation.method,
      routes.acceptInvitation.path,
      describePolicy(routes.acceptInvitation, {
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
          ...validationFailure(),
        },
      }),
      validate("json", invitationAcceptRequestSchema),
      async (context) => {
        const body = context.req.valid("json");
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
    )
    .on(
      routes.requestReset.method,
      routes.requestReset.path,
      describePolicy(routes.requestReset, {
        summary: "Request a password reset link",
        tags: ["account"],
        responses: {
          202: { description: "Accepted; identical whether or not the address has an account" },
          ...validationFailure(),
        },
      }),
      validate("json", passwordResetRequestSchema),
      async (context) => {
        const body = context.req.valid("json");
        await accounts().requestPasswordReset({ defer: deferTask(context), email: body.email });
        return bodyResponse(null, 202, noStore);
      },
    )
    .on(
      routes.confirmReset.method,
      routes.confirmReset.path,
      describePolicy(routes.confirmReset, {
        summary: "Choose a new password with a reset token",
        tags: ["account"],
        responses: {
          204: { description: "Password replaced and every session ended" },
          410: {
            content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
            description: "Unknown, expired, consumed or superseded reset link",
          },
          ...validationFailure(),
        },
      }),
      validate("json", passwordResetConfirmRequestSchema),
      async (context) => {
        const body = context.req.valid("json");
        await accounts().confirmPasswordReset(body);
        return bodyResponse(null, 204, noStore);
      },
    )
    .on(
      routes.profile.method,
      routes.profile.path,
      describePolicy(routes.profile, {
        summary: "Change the signed-in user's display name",
        tags: ["account"],
        responses: {
          200: {
            content: { "application/json": { schema: resolver(adminSessionSchema) } },
            description: "Updated session summary",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      validate("json", accountProfileUpdateRequestSchema),
      async (context) => {
        const resolvedActor = await actor(context);
        const body = context.req.valid("json");
        await accounts().updateDisplayName(resolvedActor, body.displayName);
        return sessionSummary(resolvedActor);
      },
    )
    .on(
      routes.password.method,
      routes.password.path,
      describePolicy(routes.password, {
        summary: "Change the signed-in user's password",
        tags: ["account"],
        responses: {
          200: {
            content: { "application/json": { schema: resolver(sessionRevocationResultSchema) } },
            description: "Password changed; count of other sessions ended",
          },
          400: {
            content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
            description: "The current password is incorrect (INVALID_CREDENTIALS)",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      validate("json", accountPasswordChangeRequestSchema),
      async (context) => {
        const resolvedActor = await actor(context);
        const body = context.req.valid("json");
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
    )
    .on(
      routes.capabilities.method,
      routes.capabilities.path,
      describePolicy(routes.capabilities, {
        summary: "Read account capabilities",
        tags: ["account"],
        responses: {
          200: {
            description: "Successful response",
            content: { "application/json": { schema: resolver(accountCapabilitiesSchema) } },
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
        },
      }),
      async (context) => {
        return response(
          accountCapabilitiesSchema,
          capabilities.accountCapabilities(await actor(context)),
          200,
          noStore,
        );
      },
    );
  return mountOptionalRoutes(
    accountRoutes,
    capabilities.mcpEnabled && capabilities.oauthConnections
      ? createOAuthConnectionRoutes(routeContext, capabilities.oauthConnections)
      : undefined,
  )
    .on(
      routes.sessions.method,
      routes.sessions.path,
      describePolicy(routes.sessions, {
        summary: "List the signed-in user's sessions",
        tags: ["account"],
        responses: {
          200: {
            content: { "application/json": { schema: resolver(accountSessionListSchema) } },
            description: "Sessions without tokens or IP addresses",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
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
    )
    .on(
      routes.revokeSession.method,
      routes.revokeSession.path,
      describePolicy(routes.revokeSession, {
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
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      async (context) => {
        const resolvedActor = await actor(context);
        const sessionId = parse(identifierSchemaPublic, context.req.param("sessionId"));
        await accounts().deleteSession(resolvedActor, await currentSessionId(context), sessionId);
        return bodyResponse(null, 204);
      },
    )
    .on(
      routes.revokeOtherSessions.method,
      routes.revokeOtherSessions.path,
      describePolicy(routes.revokeOtherSessions, {
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
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
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

function createOAuthConnectionRoutes(
  { actors: { actor }, capabilities }: RouteContext,
  connections: NonNullable<RouteContext["capabilities"]["oauthConnections"]>,
) {
  return new Hono()
    .on(
      routes.connections.method,
      routes.connections.path,
      describePolicy(routes.connections, {
        summary: "List the signed-in user's MCP connections",
        tags: ["account"],
        parameters: [
          {
            in: "query",
            name: "after",
            required: false,
            schema: openApiParameterSchema(oauthConnectionListQuerySchema.entries.after),
          },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: openApiParameterSchema(oauthConnectionListQuerySchema.entries.limit, {
              errorMode: "ignore",
            }),
          },
        ],
        responses: {
          200: {
            description: "Connections without credentials",
            content: { "application/json": { schema: resolver(oauthConnectionListSchema) } },
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      async (context) => {
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
      },
    )
    .on(
      routes.revokeConnection.method,
      routes.revokeConnection.path,
      describePolicy(routes.revokeConnection, {
        summary: "Revoke an owned MCP connection",
        tags: ["account"],
        parameters: [
          {
            in: "path",
            name: "connectionId",
            required: true,
            schema: openApiParameterSchema(identifierSchemaPublic),
          },
        ],
        requestBody: {
          required: false,
          content: { "application/json": { schema: resolver(oauthConnectionRevokeSchema) } },
        },
        responses: {
          204: { description: "Connection revoked" },
          ...authenticationFailure(),
          ...authorizationFailure("an Origin that is not the canonical public origin"),
          404: {
            description: "Connection not found",
            content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          },
          ...validationFailure(),
          429: {
            description: "Rate limit exceeded",
            content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          },
        },
      }),
      async (context) => {
        const resolvedActor = await actor(context);
        if (
          context.req.header("origin") !==
          new URL(capabilities.publicBaseUrl ?? context.req.url).origin
        )
          // A foreign origin is refused regardless of authentication.
          throw new AuthorizationError();
        parse(oauthConnectionRevokeSchema, await optionalJsonBody(context.req.raw));
        const connectionId = parse(identifierSchemaPublic, context.req.param("connectionId"));
        if (!(await connections.revoke(resolvedActor, connectionId))) return notFound();
        return bodyResponse(null, 204, noStore);
      },
    );
}
