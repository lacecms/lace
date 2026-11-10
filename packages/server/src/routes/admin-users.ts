import { noStore, notFound, parse, response, validationHook } from "../shared/http.js";
import { optionalJsonBody } from "../shared/request.js";
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
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import type { RouteContext } from "../composition/route-context.js";

export function registerAdminUserRoutes(app: Hono, routeContext: RouteContext): void {
  const { actor, usersActor } = routeContext.actors;
  const { accounts, accountSecurity } = routeContext.capabilities;
  app.get(
    "/api/v1/admin/users",
    describeRoute({
      summary: "List managed users",
      tags: ["admin"],
      responses: {
        200: {
          description: "Successful response",
          content: { "application/json": { schema: resolver(managedUserListSchema) } },
        },
        401: {
          description: "Session required",
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
        },
        403: {
          description: "Insufficient permissions",
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
        },
      },
    }),
    async (context) => {
      await usersActor(context);
      return response(managedUserListSchema, { items: await accountSecurity().listUsers() });
    },
  );
  app.get(
    "/api/v1/admin/invitations",
    describeRoute({
      summary: "List pending and expired invitations",
      tags: ["admin"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(invitationListSchema) } },
          description: "Invitations without tokens or links",
        },
      },
    }),
    async (context) => {
      const items = await accounts().listInvitations(await actor(context));
      return response(invitationListSchema, { items: items.map(invitationDto) }, 200, noStore);
    },
  );
  app.post(
    "/api/v1/admin/invitations",
    describeRoute({
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
      },
    }),
    validator("json", invitationCreateRequestSchema, validationHook),
    async (context) => {
      const resolvedActor = await actor(context);
      const body = context.req.valid("json") as v.InferOutput<typeof invitationCreateRequestSchema>;
      return response(
        invitationIssueResultSchema,
        invitationIssueDto(await accounts().invite(resolvedActor, body)),
        201,
        noStore,
      );
    },
  );
  app.post(
    "/api/v1/admin/invitations/:invitationId/resend",
    describeRoute({
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
  );
  app.delete(
    "/api/v1/admin/invitations/:invitationId",
    describeRoute({
      summary: "Revoke an invitation",
      tags: ["admin"],
      responses: { 204: { description: "Invitation revoked" } },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      const invitationId = parse(identifierSchemaPublic, context.req.param("invitationId"));
      await accounts().revokeInvitation(resolvedActor, invitationId);
      return new Response(null, { status: 204 });
    },
  );
  app.post(
    "/api/v1/admin/users/:userId/password-reset",
    describeRoute({
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
  );
  app.post(
    "/api/v1/admin/users/:userId/sessions/revoke",
    describeRoute({
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
  );
  app.patch(
    "/api/v1/admin/users/:userId",
    validator("json", userUpdateRequestSchema, validationHook),
    async (context) => {
      await usersActor(context);
      const body = context.req.valid("json") as v.InferOutput<typeof userUpdateRequestSchema>;
      const updated = await accountSecurity().updateUser({
        ...(body.disabled === undefined ? {} : { disabled: body.disabled }),
        ...(body.role === undefined ? {} : { role: body.role }),
        userId: context.req.param("userId"),
      });
      return updated === null ? notFound() : response(managedUserSchema, updated);
    },
  );
}
