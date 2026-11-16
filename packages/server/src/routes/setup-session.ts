import { response, validationHook } from "../shared/http.js";
import { sendTestEmail } from "@lacecms/application";
import {
  errorEnvelopeSchema,
  adminSettingsStatusSchema,
  adminSessionSchema,
  emailTestRequestSchema,
  emailTestResultSchema,
  managedUserSchema,
  setupAdminRequestSchema,
  setupStateSchema,
  InvariantError,
} from "@lacecms/contracts";
import { Hono } from "hono";
import { resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { emailDeliveryStatus } from "../runtime/email.js";
import {
  authenticationFailure,
  authorizationFailure,
  describePolicy,
  validationFailure,
} from "../shared/openapi.js";
import type { RouteContext } from "../composition/route-context.js";
import { v1Routes } from "../routing/v1-routes.js";

const routes = v1Routes.setupSession;

export function registerSetupSessionRoutes(app: Hono, routeContext: RouteContext): void {
  const { actor, settingsActor } = routeContext.actors;
  const { capabilities } = routeContext;
  const { email, sessionSummary, accountSecurity, profiles } = capabilities;
  app.on(
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
        { setupComplete: await accountSecurity().isSetupComplete() },
        200,
        { "cache-control": "no-store" },
      );
    },
  );

  app.on(
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
          description: "Unknown or expired token, or setup already complete (one ambiguous answer)",
        },
        ...validationFailure(),
      },
    }),
    validator("json", setupAdminRequestSchema, validationHook),
    async (context) => {
      // Setup outcomes raise `AccountError("NOT_FOUND")`, one ambiguous 404 through the
      // classifier; any other failure keeps its own classification.
      const body = context.req.valid("json") as v.InferOutput<typeof setupAdminRequestSchema>;
      const created = await accountSecurity().bootstrap({
        email: body.email,
        password: body.password,
        token: body.token as never,
      });
      return response(managedUserSchema, created.user, 201);
    },
  );

  app.on(
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
  );
  app.on(
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
    async (context) => {
      await settingsActor(context);
      if (!capabilities.publicBaseUrl)
        throw new InvariantError("Canonical public URL is unavailable.");
      return response(adminSettingsStatusSchema, {
        mcp: {
          enabled: capabilities.mcpEnabled === true,
          endpoint: new URL("/mcp", capabilities.publicBaseUrl).href,
        },
        configuredModels: capabilities.config.content.length,
        email: emailDeliveryStatus(email),
        engineVersion: capabilities.environment.engineVersion,
        ready: await capabilities.readiness.isReady(),
      });
    },
  );
  app.on(
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
    validator("json", emailTestRequestSchema, validationHook),
    async (context) => {
      const resolvedActor = await settingsActor(context);
      const outcome = await sendTestEmail({
        actor: resolvedActor,
        email,
        installationUrl: capabilities.publicBaseUrl ?? new URL(context.req.url).origin,
        users: profiles(),
      });
      return response(emailTestResultSchema, outcome);
    },
  );
}
