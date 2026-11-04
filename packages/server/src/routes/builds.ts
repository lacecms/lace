import { notFound, parse, response } from "../shared/http.js";
import { optionalJsonBody } from "../shared/request.js";
import { requireContentReader } from "@lacecms/application";
import {
  buildSiteSelectionSchema,
  buildRequestSchema,
  buildQueueReceiptSchema,
  siteBuildRecordSchema,
  siteBuildListSchema,
  identifierSchemaPublic,
  toSiteBuildRecordDto,
} from "@lacecms/contracts";
import { Hono } from "hono";
import { describeRoute, resolver } from "hono-openapi";
import type { RouteContext } from "../composition/route-context.js";

export function registerBuildRoutes(app: Hono, routeContext: RouteContext): void {
  const { input, actor, settingsActor } = routeContext;
  app.get(
    "/api/v1/admin/build-site",
    describeRoute({
      summary: "Read current configured build site",
      responses: {
        200: {
          description: "Current configuration, not deployment verification",
          content: { "application/json": { schema: resolver(buildSiteSelectionSchema) } },
        },
      },
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      requireContentReader(resolvedActor);
      return response(buildSiteSelectionSchema, { site: input.buildSite ?? null });
    },
  );
  app.get(
    "/api/v1/admin/site-builds",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(siteBuildListSchema) } },
          description: "Recent site builds",
        },
      },
      summary: "List site builds",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      if (input.builds === undefined) throw new Error("Build reads are unavailable.");
      const items = await input.builds.list(resolvedActor);
      return response(siteBuildListSchema, { items: items.map(toSiteBuildRecordDto) });
    },
  );
  app.get(
    "/api/v1/admin/site-builds/:buildId",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(siteBuildRecordSchema) } },
          description: "Site build detail",
        },
      },
      summary: "Get a site build",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      const buildId = parse(identifierSchemaPublic, context.req.param("buildId"));
      if (input.builds === undefined) throw new Error("Build reads are unavailable.");
      const build = await input.builds.get(resolvedActor, buildId);
      return build === null
        ? notFound()
        : response(siteBuildRecordSchema, toSiteBuildRecordDto(build));
    },
  );
  app.post(
    "/api/v1/admin/builds",
    describeRoute({
      requestBody: { content: { "application/json": { schema: resolver(buildRequestSchema) } } },
      responses: {
        202: {
          content: { "application/json": { schema: resolver(buildQueueReceiptSchema) } },
          description: "Build request queued",
        },
      },
      summary: "Request a site build",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await settingsActor(context);
      parse(buildRequestSchema, await optionalJsonBody(context.req.raw));
      if (input.builds === undefined) throw new Error("Build commands are unavailable.");
      return response(buildQueueReceiptSchema, await input.builds.request(resolvedActor), 202);
    },
  );
  app.post(
    "/api/v1/admin/builds/:buildId/retry",
    describeRoute({
      requestBody: { content: { "application/json": { schema: resolver(buildRequestSchema) } } },
      responses: {
        202: {
          content: { "application/json": { schema: resolver(buildQueueReceiptSchema) } },
          description: "Failed build retry queued",
        },
      },
      summary: "Retry a failed site build",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await settingsActor(context);
      parse(buildRequestSchema, await optionalJsonBody(context.req.raw));
      const buildId = parse(identifierSchemaPublic, context.req.param("buildId"));
      if (input.builds === undefined) throw new Error("Build commands are unavailable.");
      return response(
        buildQueueReceiptSchema,
        await input.builds.retry(resolvedActor, buildId),
        202,
      );
    },
  );
}
