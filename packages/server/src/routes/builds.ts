import { notFound, parse, response } from "../shared/http.js";
import { optionalJsonBody } from "../shared/request.js";
import {
  authenticationFailure,
  authorizationFailure,
  describePolicy,
  validationFailure,
} from "../shared/openapi.js";
import {
  buildSiteSelectionSchema,
  buildRequestSchema,
  buildQueueReceiptSchema,
  siteBuildRecordSchema,
  siteBuildListSchema,
  identifierSchemaPublic,
  toSiteBuildRecordDto,
  errorEnvelopeSchema,
} from "@lacecms/contracts";
import { Hono } from "hono";
import { resolver } from "hono-openapi";
import type { RouteContext } from "../composition/route-context.js";
import { v1Routes } from "../routing/v1-routes.js";

const routes = v1Routes.builds;

export function createBuildRoutes(routeContext: RouteContext) {
  const { actor } = routeContext.actors;
  const { builds, buildSite } = routeContext.capabilities;
  return new Hono()
    .on(
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
        return response(buildSiteSelectionSchema, { site: buildSite(await actor(context)) });
      },
    )
    .on(
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
        const items = await builds.list(resolvedActor);
        return response(siteBuildListSchema, { items: items.map(toSiteBuildRecordDto) });
      },
    )
    .on(
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
        const build = await builds.get(resolvedActor, buildId);
        return build === null
          ? notFound()
          : response(siteBuildRecordSchema, toSiteBuildRecordDto(build));
      },
    )
    .on(
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
        const resolvedActor = await actor(context);
        return response(
          buildQueueReceiptSchema,
          await builds.request(resolvedActor, async () => {
            parse(buildRequestSchema, await optionalJsonBody(context.req.raw));
          }),
          202,
        );
      },
    )
    .on(
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
        const resolvedActor = await actor(context);
        return response(
          buildQueueReceiptSchema,
          await builds.retry(resolvedActor, async () => {
            parse(buildRequestSchema, await optionalJsonBody(context.req.raw));
            return parse(identifierSchemaPublic, context.req.param("buildId"));
          }),
          202,
        );
      },
    );
}
