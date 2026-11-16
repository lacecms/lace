import { readBuildExportPage, readBuildExportQuery } from "./build-export.js";
import { notFound, parse, response, validationHook, validationResponse } from "../shared/http.js";
import { collectionItemParams, modelKeyParams, pagination, publicPath } from "../shared/request.js";
import {
  collectionModel,
  globalModel,
  pageModel,
  routeLessCollectionModel,
} from "../shared/content-config.js";
import { authenticationFailure, describePolicy, validationFailure } from "../shared/openapi.js";
import {
  AuthenticationRequiredError,
  buildExportContinuationPageSchema,
  buildExportFirstPageSchema,
  DEFAULT_PAGE_SIZE,
  MAX_BUILD_EXPORT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  opaqueCursorSchema,
  entityTagForVersion,
  entityTagSchema,
  errorEnvelopeSchema,
  publicContentEntrySchema,
  publicGlobalContentSchema,
  publicContentListSchema,
  publicRecordListSchema,
  collectionPathFailure,
  toBuildExportContinuationPageDto,
  toBuildExportFirstPageDto,
  toPublicContentEntryDto,
  toPublicGlobalContentDto,
  toPublicContentListDto,
  toPublicRecordListDto,
  versionFromEntityTag,
} from "@lacecms/contracts";
import { toJsonSchema } from "@valibot/to-json-schema";
import { Hono } from "hono";
import { resolver, validator } from "hono-openapi";
import * as v from "valibot";
import type { RouteContext } from "../composition/route-context.js";
import { v1Routes } from "../routing/v1-routes.js";
import { authenticationChallenge } from "../routing/route-policy.js";

/** Documents what `pagination()` parses by hand; parsing stays there. */
const paginationParameters = [
  {
    description: "Opaque `nextCursor` of the previous page; omit for the first page.",
    in: "query" as const,
    name: "after",
    required: false,
    schema: toJsonSchema(opaqueCursorSchema) as never,
  },
  {
    description: "Entries per page.",
    in: "query" as const,
    name: "limit",
    required: false,
    schema: {
      default: DEFAULT_PAGE_SIZE,
      maximum: MAX_PAGE_SIZE,
      minimum: 1,
      type: "integer" as const,
    },
  },
];

const routes = v1Routes.public;

export function registerPublicRoutes(app: Hono, routeContext: RouteContext): void {
  const { capabilities } = routeContext;
  const { publicMediaUrl, seoSection, seoModels } = capabilities;
  app.on(
    routes.global.method,
    routes.global.path,
    describePolicy(routes.global, {
      responses: {
        200: {
          content: { "application/json": { schema: resolver(publicGlobalContentSchema) } },
          description: "Published global",
        },
        ...validationFailure(),
      },
      summary: "Read a published global",
      tags: ["public"],
    }),
    validator("param", modelKeyParams, validationHook),
    async (context) => {
      const model = globalModel(capabilities.config, context.req.param("modelKey"));
      if (model === undefined) return notFound();
      const global = await capabilities.publicContent.loadPublicGlobal(model.key as never);
      return global === null
        ? notFound()
        : response(publicGlobalContentSchema, toPublicGlobalContentDto(global, publicMediaUrl()));
    },
  );

  app.on(
    routes.page.method,
    routes.page.path,
    describePolicy(routes.page, {
      responses: {
        200: {
          content: { "application/json": { schema: resolver(publicContentEntrySchema) } },
          description: "Published page",
        },
        ...validationFailure(),
      },
      summary: "Read a published page",
      tags: ["public"],
    }),
    validator("param", modelKeyParams, validationHook),
    async (context) => {
      const model = pageModel(capabilities.config, context.req.param("modelKey"));
      if (model === undefined) return notFound();
      const entry = await capabilities.publicContent.loadPublic(model.path);
      return entry === null
        ? notFound()
        : response(
            publicContentEntrySchema,
            toPublicContentEntryDto(entry, publicMediaUrl(), { seoModels }),
          );
    },
  );

  app.on(
    routes.records.method,
    routes.records.path,
    describePolicy(routes.records, {
      responses: {
        200: {
          content: { "application/json": { schema: resolver(publicRecordListSchema) } },
          description: "Published records of a route-less collection",
        },
        ...validationFailure(),
      },
      parameters: paginationParameters,
      summary: "List published records of a route-less collection",
      tags: ["public"],
    }),
    validator("param", modelKeyParams, validationHook),
    async (context) => {
      const model = routeLessCollectionModel(capabilities.config, context.req.param("modelKey"));
      if (model === undefined) return notFound();
      const page = await capabilities.publicContent.listPublicRecords({
        modelKey: model.key as never,
        ...pagination(context.req.raw),
      });
      return response(publicRecordListSchema, toPublicRecordListDto(page, publicMediaUrl()));
    },
  );

  app.on(
    routes.collection.method,
    routes.collection.path,
    describePolicy(routes.collection, {
      responses: {
        200: {
          content: { "application/json": { schema: resolver(publicContentListSchema) } },
          description: "Published collection page",
        },
        ...validationFailure(),
      },
      parameters: paginationParameters,
      summary: "List published collection entries",
      tags: ["public"],
    }),
    validator("param", modelKeyParams, validationHook),
    async (context) => {
      const model = collectionModel(capabilities.config, context.req.param("modelKey"));
      if (model === undefined) return notFound();
      const page = await capabilities.publicContent.listPublic({
        modelKey: model.key as never,
        ...pagination(context.req.raw),
      });
      return response(
        publicContentListSchema,
        toPublicContentListDto(page, publicMediaUrl(), { seoModels }),
      );
    },
  );

  app.on(
    routes.collectionItem.method,
    routes.collectionItem.path,
    describePolicy(routes.collectionItem, {
      responses: {
        200: {
          content: { "application/json": { schema: resolver(publicContentEntrySchema) } },
          description: "Published collection entry",
        },
        ...validationFailure(),
      },
      summary: "Read a published collection entry",
      tags: ["public"],
    }),
    validator("param", collectionItemParams, validationHook),
    async (context) => {
      const model = collectionModel(capabilities.config, context.req.param("modelKey"));
      if (model === undefined) return notFound();
      const resolved = collectionPathFailure(model.route, context.req.param("slug"));
      if (!("path" in resolved))
        return validationResponse([
          { code: "invalid_value", message: "The submitted value is invalid.", path: "/slug" },
        ]);
      const path = resolved.path;
      const entry = await capabilities.publicContent.loadPublic(path);
      return entry === null
        ? notFound()
        : response(
            publicContentEntrySchema,
            toPublicContentEntryDto(entry, publicMediaUrl(), { seoModels }),
          );
    },
  );

  app.on(
    routes.byPath.method,
    routes.byPath.path,
    describePolicy(routes.byPath, {
      responses: {
        200: {
          content: { "application/json": { schema: resolver(publicContentEntrySchema) } },
          description: "Published entry",
        },
        ...validationFailure(),
      },
      parameters: [
        {
          description: "The published route path, starting with `/`.",
          in: "query",
          name: "path",
          required: true,
          schema: { type: "string" },
        },
      ],
      summary: "Read published content by path",
      tags: ["public"],
    }),
    async (context) => {
      const suppliedPath = new URL(context.req.raw.url).searchParams.get("path");
      if (suppliedPath === null)
        return validationResponse([
          { code: "invalid_value", message: "The submitted value is invalid.", path: "/path" },
        ]);
      let path: string;
      try {
        path = publicPath(suppliedPath);
      } catch {
        return validationResponse([
          { code: "invalid_value", message: "The submitted value is invalid.", path: "/path" },
        ]);
      }
      const entry = await capabilities.publicContent.loadPublic(path);
      return entry === null
        ? notFound()
        : response(
            publicContentEntrySchema,
            toPublicContentEntryDto(entry, publicMediaUrl(), { seoModels }),
          );
    },
  );

  const { buildTokens } = capabilities;
  if (typeof buildTokens?.verifyBuildToken !== "function") return;

  app.on(
    routes.buildExport.method,
    routes.buildExport.path,
    describePolicy(routes.buildExport, {
      description:
        "Returns one bounded page of the published build export. A request without `after` returns the first page with `globals` and `seo`; follow `nextCursor` through `after` until it is absent. A continuation cursor of a superseded published state fails with `409 BUILD_EXPORT_VERSION_CHANGED`; restart from the first page.",
      parameters: [
        {
          description: "Opaque `nextCursor` of the previous page; omit for the first page.",
          in: "query",
          name: "after",
          required: false,
          schema: { maxLength: 4_096, minLength: 1, type: "string" },
        },
        {
          description: "Entries per page; the server may end a page earlier at its byte budget.",
          in: "query",
          name: "limit",
          required: false,
          schema: {
            default: MAX_BUILD_EXPORT_PAGE_SIZE,
            maximum: 100,
            minimum: 1,
            type: "integer",
          },
        },
      ],
      responses: {
        200: {
          content: {
            "application/json": {
              schema: resolver(
                v.union([buildExportFirstPageSchema, buildExportContinuationPageSchema]),
              ),
            },
          },
          description: "One page of the published build export",
        },
        409: {
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          description:
            "Published content changed since the first page (BUILD_EXPORT_VERSION_CHANGED)",
        },
        ...authenticationFailure(),
        ...validationFailure(),
      },
      summary: "Read a page of the published build export",
      tags: ["public"],
    }),
    async (context) => {
      const authorization = context.req.header("authorization");
      if (
        authorization === undefined ||
        !authorization.startsWith("Bearer ") ||
        !(await buildTokens.verifyBuildToken({
          now: Date.now() as never,
          token: authorization.slice(7) as never,
        }))
      )
        throw new AuthenticationRequiredError(authenticationChallenge(routes.buildExport.auth));
      const query = readBuildExportQuery(new URL(context.req.url));
      const suppliedTag = context.req.header("if-none-match") ?? undefined;
      if (suppliedTag !== undefined) parse(entityTagSchema, suppliedTag);
      // Conditional reads apply to the first page only; a continuation page
      // is guarded by its cursor's version instead.
      if (query.after === undefined && suppliedTag !== undefined) {
        const version = await capabilities.publicContent.publishedContentVersion();
        if (versionFromEntityTag(suppliedTag) === version)
          return new Response(null, {
            headers: { etag: entityTagForVersion(version) },
            status: 304,
          });
      }
      const page = await readBuildExportPage(capabilities.publicContent, query);
      // Each page is validated strictly before it is sent; its ETag is the
      // version it was read at, even when a publication followed the lookup.
      const headers = { etag: entityTagForVersion(page.version) };
      return query.after === undefined
        ? response(
            buildExportFirstPageSchema,
            toBuildExportFirstPageDto(page, publicMediaUrl(), seoSection),
            200,
            headers,
          )
        : response(
            buildExportContinuationPageSchema,
            toBuildExportContinuationPageDto(page, publicMediaUrl(), seoSection),
            200,
            headers,
          );
    },
  );
}
