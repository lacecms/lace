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
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import { emailDeliveryStatus } from "../runtime/email.js";
import type { RouteContext } from "../composition/route-context.js";

export function registerSetupSessionRoutes(app: Hono, routeContext: RouteContext): void {
  const { actor, settingsActor } = routeContext.actors;
  const { capabilities } = routeContext;
  const { email, sessionSummary, accountSecurity, profiles } = capabilities;
  app.get(
    "/api/v1/setup/state",
    describeRoute({
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

  app.post(
    "/api/v1/setup/admin",
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

  app.get(
    "/api/v1/admin/session",
    describeRoute({
      summary: "Read the signed-in user and server-derived permissions",
      tags: ["admin"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(adminSessionSchema) } },
          description: "Session summary without credential material",
        },
      },
    }),
    async (context) => sessionSummary(await actor(context)),
  );
  app.get(
    "/api/v1/admin/settings/status",
    describeRoute({
      summary: "Read settings status",
      tags: ["admin"],
      responses: {
        200: {
          description: "Successful response",
          content: { "application/json": { schema: resolver(adminSettingsStatusSchema) } },
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
  app.post(
    "/api/v1/admin/settings/email-test",
    describeRoute({
      summary: "Send a test email to the signed-in administrator",
      tags: ["admin"],
      responses: {
        200: {
          content: { "application/json": { schema: resolver(emailTestResultSchema) } },
          description: "Closed delivery outcome; failed sends are reported, not raised",
        },
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
