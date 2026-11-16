import { bodyResponse, noStore, notFound, parse, response } from "../shared/http.js";
import { optionalJsonBody } from "../shared/request.js";
import {
  authenticationFailure,
  authorizationFailure,
  describePolicy,
  validate,
  validationFailure,
} from "../shared/openapi.js";
import { invitationDto, invitationIssueDto, linkIssueDto } from "../shared/account-dtos.js";
import {
  managedUserListSchema,
  managedUserSchema,
  errorEnvelopeSchema,
  identifierSchemaPublic,
  userUpdateRequestSchema,
  adminPasswordResetRequestSchema,
  adminPasswordResetResultSchema,
  invitationCreateRequestSchema,
  invitationIssueResultSchema,
  invitationListSchema,
  invitationResendRequestSchema,
  sessionRevocationResultSchema,
  sessionRevokeRequestSchema,
} from "@lacecms/contracts";
import { Hono } from "hono";
import { resolver } from "hono-openapi";
import type { RouteContext } from "../composition/route-context.js";
import { v1Routes } from "../routing/v1-routes.js";

const routes = v1Routes.adminUsers;

export function createAdminUserRoutes(routeContext: RouteContext) {
  const { actor } = routeContext.actors;
  const { accounts, installedAccounts } = routeContext.capabilities;
  return new Hono()
    .on(
      routes.users.method,
      routes.users.path,
      describePolicy(routes.users, {
        summary: "List managed users",
        tags: ["admin"],
        responses: {
          200: {
            description: "Successful response",
            content: { "application/json": { schema: resolver(managedUserListSchema) } },
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
        },
      }),
      async (context) => {
        const resolvedActor = await actor(context);
        return response(managedUserListSchema, {
          items: await installedAccounts().listUsers(resolvedActor),
        });
      },
    )
    .on(
      routes.invitations.method,
      routes.invitations.path,
      describePolicy(routes.invitations, {
        summary: "List pending and expired invitations",
        tags: ["admin"],
        responses: {
          200: {
            content: { "application/json": { schema: resolver(invitationListSchema) } },
            description: "Invitations without tokens or links",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
        },
      }),
      async (context) => {
        const items = await accounts().listInvitations(await actor(context));
        return response(invitationListSchema, { items: items.map(invitationDto) }, 200, noStore);
      },
    )
    .on(
      routes.invite.method,
      routes.invite.path,
      describePolicy(routes.invite, {
        summary: "Invite an email address with a role",
        tags: ["admin"],
        responses: {
          201: {
            content: { "application/json": { schema: resolver(invitationIssueResultSchema) } },
            description: "Invitation created; the link is present only when email was not sent",
          },
          409: {
            content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
            description: "The address has an account or an active invitation",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      validate("json", invitationCreateRequestSchema),
      async (context) => {
        const resolvedActor = await actor(context);
        const body = context.req.valid("json");
        return response(
          invitationIssueResultSchema,
          invitationIssueDto(await accounts().invite(resolvedActor, body)),
          201,
          noStore,
        );
      },
    )
    .on(
      routes.resendInvitation.method,
      routes.resendInvitation.path,
      describePolicy(routes.resendInvitation, {
        summary: "Resend an invitation with a new link",
        tags: ["admin"],
        requestBody: {
          content: { "application/json": { schema: resolver(invitationResendRequestSchema) } },
        },
        responses: {
          200: {
            content: { "application/json": { schema: resolver(invitationIssueResultSchema) } },
            description: "Invitation reissued; the link is present only when email was not sent",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      async (context) => {
        const resolvedActor = await actor(context);
        parse(invitationResendRequestSchema, await optionalJsonBody(context.req.raw));
        const invitationId = parse(identifierSchemaPublic, context.req.param("invitationId"));
        return response(
          invitationIssueResultSchema,
          invitationIssueDto(await accounts().resendInvitation(resolvedActor, invitationId)),
          200,
          noStore,
        );
      },
    )
    .on(
      routes.revokeInvitation.method,
      routes.revokeInvitation.path,
      describePolicy(routes.revokeInvitation, {
        summary: "Revoke an invitation",
        tags: ["admin"],
        responses: {
          204: { description: "Invitation revoked" },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      async (context) => {
        const resolvedActor = await actor(context);
        const invitationId = parse(identifierSchemaPublic, context.req.param("invitationId"));
        await accounts().revokeInvitation(resolvedActor, invitationId);
        return bodyResponse(null, 204);
      },
    )
    .on(
      routes.resetUserPassword.method,
      routes.resetUserPassword.path,
      describePolicy(routes.resetUserPassword, {
        summary: "Send a password reset to a user",
        tags: ["admin"],
        requestBody: {
          content: { "application/json": { schema: resolver(adminPasswordResetRequestSchema) } },
        },
        responses: {
          200: {
            content: { "application/json": { schema: resolver(adminPasswordResetResultSchema) } },
            description: "Reset issued; the link is present only when email was not sent",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      async (context) => {
        const resolvedActor = await actor(context);
        parse(adminPasswordResetRequestSchema, await optionalJsonBody(context.req.raw));
        const userId = parse(identifierSchemaPublic, context.req.param("userId"));
        return response(
          adminPasswordResetResultSchema,
          linkIssueDto(await accounts().sendPasswordReset(resolvedActor, userId)),
          200,
          noStore,
        );
      },
    )
    .on(
      routes.revokeUserSessions.method,
      routes.revokeUserSessions.path,
      describePolicy(routes.revokeUserSessions, {
        summary: "Sign a user out everywhere",
        tags: ["admin"],
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
        const userId = parse(identifierSchemaPublic, context.req.param("userId"));
        return response(
          sessionRevocationResultSchema,
          await accounts().signOutUser(resolvedActor, userId),
        );
      },
    )
    .on(
      routes.updateUser.method,
      routes.updateUser.path,
      describePolicy(routes.updateUser, {
        summary: "Change a user's role or disabled state",
        tags: ["admin"],
        responses: {
          200: {
            content: { "application/json": { schema: resolver(managedUserSchema) } },
            description: "Updated user",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          404: {
            content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
            description: "User not found",
          },
          409: {
            content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
            description:
              "The final active administrator cannot be disabled or demoted (LAST_ADMIN_PROTECTED)",
          },
          ...validationFailure(),
        },
      }),
      validate("json", userUpdateRequestSchema),
      async (context) => {
        const resolvedActor = await actor(context);
        const body = context.req.valid("json");
        const updated = await installedAccounts().updateUser(resolvedActor, {
          ...(body.disabled === undefined ? {} : { disabled: body.disabled }),
          ...(body.role === undefined ? {} : { role: body.role }),
          userId: context.req.param("userId"),
        });
        return updated === null ? notFound() : response(managedUserSchema, updated);
      },
    );
}
