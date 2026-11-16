import { notFound, parse, response } from "../shared/http.js";
import { optionalJsonBody } from "../shared/request.js";
import {
  authenticationFailure,
  authorizationFailure,
  describePolicy,
  validationFailure,
} from "../shared/openapi.js";
import { requireContentReader } from "@lacecms/application";
import {
  buildSiteSelectionSchema,
  buildRequestSchema,
  buildQueueReceiptSchema,
  siteBuildRecordSchema,
  siteBuildListSchema,
  identifierSchemaPublic,
  toSiteBuildRecordDto,
  InvariantError,
  errorEnvelopeSchema,
} from "@lacecms/contracts";
import { Hono } from "hono";
import { resolver } from "hono-openapi";
import type { RouteContext } from "../composition/route-context.js";
import { v1Routes } from "../routing/v1-routes.js";

const routes = v1Routes.builds;

export function registerBuildRoutes(app: Hono, routeContext: RouteContext): void {
  const { actor, settingsActor } = routeContext.actors;
  const { capabilities } = routeContext;
  app.on(
    routes.buildSite.method,
    routes.buildSite.path,
    describePolicy(routes.buildSite, {
      summary: "Read current configured build site",
      tags: ["admin"],
      responses: {
        200: {
          description: "Current configuration, not deployment verification",
          content: { "application/json": { schema: resolver(buildSiteSelectionSchema) } },
        },
        ...authenticationFailure(),
        ...authorizationFailure(),
      },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      requireContentReader(resolvedActor);
      return response(buildSiteSelectionSchema, { site: capabilities.buildSite ?? null });
    },
  );
  app.on(
    routes.list.method,
    routes.list.path,
    describePolicy(routes.list, {
      responses: {
        200: {
          content: { "application/json": { schema: resolver(siteBuildListSchema) } },
          description: "Recent site builds",
        },
        ...authenticationFailure(),
        ...authorizationFailure(),
      },
      summary: "List site builds",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      if (capabilities.builds === undefined)
        throw new InvariantError("Build reads are unavailable.");
      const items = await capabilities.builds.list(resolvedActor);
      return response(siteBuildListSchema, { items: items.map(toSiteBuildRecordDto) });
    },
  );
  app.on(
    routes.get.method,
    routes.get.path,
    describePolicy(routes.get, {
      responses: {
        200: {
          content: { "application/json": { schema: resolver(siteBuildRecordSchema) } },
          description: "Site build detail",
        },
        ...authenticationFailure(),
        ...authorizationFailure(),
        404: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description: "Site build not found",
        },
        ...validationFailure(),
      },
      summary: "Get a site build",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      const buildId = parse(identifierSchemaPublic, context.req.param("buildId"));
      if (capabilities.builds === undefined)
        throw new InvariantError("Build reads are unavailable.");
      const build = await capabilities.builds.get(resolvedActor, buildId);
      return build === null
        ? notFound()
        : response(siteBuildRecordSchema, toSiteBuildRecordDto(build));
    },
  );
  app.on(
    routes.request.method,
    routes.request.path,
    describePolicy(routes.request, {
      requestBody: { content: { "application/json": { schema: resolver(buildRequestSchema) } } },
      responses: {
        202: {
          content: { "application/json": { schema: resolver(buildQueueReceiptSchema) } },
          description: "Build request queued",
        },
        ...authenticationFailure(),
        ...authorizationFailure(),
        ...validationFailure(),
      },
      summary: "Request a site build",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await settingsActor(context);
      parse(buildRequestSchema, await optionalJsonBody(context.req.raw));
      if (capabilities.builds === undefined)
        throw new InvariantError("Build commands are unavailable.");
      return response(
        buildQueueReceiptSchema,
        await capabilities.builds.request(resolvedActor),
        202,
      );
    },
  );
  app.on(
    routes.retry.method,
    routes.retry.path,
    describePolicy(routes.retry, {
      requestBody: { content: { "application/json": { schema: resolver(buildRequestSchema) } } },
      responses: {
        202: {
          content: { "application/json": { schema: resolver(buildQueueReceiptSchema) } },
          description: "Failed build retry queued",
        },
        ...authenticationFailure(),
        ...authorizationFailure(),
        ...validationFailure(),
      },
      summary: "Retry a failed site build",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await settingsActor(context);
      parse(buildRequestSchema, await optionalJsonBody(context.req.raw));
      const buildId = parse(identifierSchemaPublic, context.req.param("buildId"));
      if (capabilities.builds === undefined)
        throw new InvariantError("Build commands are unavailable.");
      return response(
        buildQueueReceiptSchema,
        await capabilities.builds.retry(resolvedActor, buildId),
        202,
      );
    },
  );
}
