import { response } from "../shared/http.js";
import {
  errorEnvelopeSchema,
  adminSettingsStatusSchema,
  adminSessionSchema,
  emailTestRequestSchema,
  emailTestResultSchema,
  managedUserSchema,
  setupAdminRequestSchema,
  setupStateSchema,
} from "@lacecms/contracts";
import { Hono } from "hono";
import { resolver } from "hono-openapi";
import {
  authenticationFailure,
  authorizationFailure,
  describePolicy,
  validate,
  validationFailure,
} from "../shared/openapi.js";
import type { RouteContext } from "../composition/route-context.js";
import { v1Routes } from "../routing/v1-routes.js";

const routes = v1Routes.setupSession;

export function createSetupSessionRoutes(routeContext: RouteContext) {
  const { actor } = routeContext.actors;
  const { installedAccounts, sessionSummary, settings } = routeContext.capabilities;
  return new Hono()
    .on(
      routes.setupState.method,
      routes.setupState.path,
      describePolicy(routes.setupState, {
        summary: "Read installation setup completion",
        tags: ["setup"],
        responses: {
          200: {
            content: { "application/json": { schema: resolver(setupStateSchema) } },
            description: "Minimal installation completion state",
          },
        },
      }),
      async () => {
        return response(
          setupStateSchema,
          { setupComplete: await installedAccounts().isSetupComplete() },
          200,
          { "cache-control": "no-store" },
        );
      },
    )
    .on(
      routes.setupAdmin.method,
      routes.setupAdmin.path,
      describePolicy(routes.setupAdmin, {
        summary: "Create the first administrator with the setup token",
        tags: ["setup"],
        responses: {
          201: {
            content: { "application/json": { schema: resolver(managedUserSchema) } },
            description: "The created administrator",
          },
          404: {
            content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
            description:
              "Unknown or expired token, or setup already complete (one ambiguous answer)",
          },
          ...validationFailure(),
        },
      }),
      validate("json", setupAdminRequestSchema),
      async (context) => {
        // Setup outcomes raise `AccountError("NOT_FOUND")`, one ambiguous 404 through the
        // classifier; any other failure keeps its own classification.
        const body = context.req.valid("json");
        const created = await installedAccounts().bootstrap(body);
        return response(managedUserSchema, created.user, 201);
      },
    )
    .on(
      routes.session.method,
      routes.session.path,
      describePolicy(routes.session, {
        summary: "Read the signed-in user and server-derived permissions",
        tags: ["admin"],
        responses: {
          200: {
            content: { "application/json": { schema: resolver(adminSessionSchema) } },
            description: "Session summary without credential material",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
        },
      }),
      async (context) => sessionSummary(await actor(context)),
    )
    .on(
      routes.status.method,
      routes.status.path,
      describePolicy(routes.status, {
        summary: "Read settings status",
        tags: ["admin"],
        responses: {
          200: {
            description: "Successful response",
            content: { "application/json": { schema: resolver(adminSettingsStatusSchema) } },
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
        },
      }),
      async (context) =>
        response(adminSettingsStatusSchema, await settings.readStatus(await actor(context))),
    )
    .on(
      routes.emailTest.method,
      routes.emailTest.path,
      describePolicy(routes.emailTest, {
        summary: "Send a test email to the signed-in administrator",
        tags: ["admin"],
        responses: {
          200: {
            content: { "application/json": { schema: resolver(emailTestResultSchema) } },
            description: "Closed delivery outcome; failed sends are reported, not raised",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      validate("json", emailTestRequestSchema),
      async (context) => {
        const resolvedActor = await actor(context);
        const outcome = await settings.sendTestEmail(
          resolvedActor,
          new URL(context.req.url).origin,
        );
        return response(emailTestResultSchema, outcome);
      },
    );
}
