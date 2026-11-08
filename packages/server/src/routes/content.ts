import { invalid, notFound, parse, response, validationHook } from "../shared/http.js";
import {
  entryIdParams,
  modelKeyParams,
  optionalIdempotencyKey,
  optionalJsonBody,
  optionalRevision,
  pagination,
  revision,
} from "../shared/request.js";
import { contentModel } from "../shared/content-config.js";
import { opaqueCursor } from "@lacecms/application";
import {
  adminContentEntrySchema,
  contentEntryListQuerySchema,
  MAX_COLLECTION_FILTER_BYTES,
  contentEntryListSchema,
  contentModelListSchema,
  createContentEntryRequestSchema,
  deleteContentEntryRequestSchema,
  duplicateContentEntryRequestSchema,
  revertContentEntryRequestSchema,
  toUnpublishContentEntryResultDto,
  unpublishContentEntryRequestSchema,
  unpublishContentEntryResultSchema,
  linkTargetIdSchema,
  linkTargetQuerySchema,
  linkTargetPageSchema,
  resolveLinkTargetsRequestSchema,
  linkTargetStatusesSchema,
  linkImpactQuerySchema,
  linkImpactPageSchema,
  publishContentEntryResultSchema,
  publishContentEntryRequestSchema,
  saveDraftRequestSchema,
  toAdminEntryProjectionDto,
  toContentModelDiscoveryDto,
  toContentEntryListDto,
  toContentBlockInput as blockInput,
  toPublishContentEntryResultDto,
} from "@lacecms/contracts";
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import type { RouteContext } from "../composition/route-context.js";

export function registerContentRoutes(app: Hono, routeContext: RouteContext): void {
  const { actor } = routeContext.actors;
  const { capabilities } = routeContext;
  const { adminEntryDto, seoSection } = capabilities;
  app.get(
    "/api/v1/admin/content-models",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(contentModelListSchema) } },
          description: "Content models",
        },
      },
      summary: "List content models",
      tags: ["admin"],
    }),
    async (context) => {
      return response(
        contentModelListSchema,
        toContentModelDiscoveryDto(
          capabilities.content.discoverModels({ actor: await actor(context) }),
        ),
      );
    },
  );

  app.get(
    "/api/v1/admin/models/:modelKey/entries",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(contentEntryListSchema) } },
          description: "Content entry page with per-status totals",
        },
      },
      summary: "List content entries",
      tags: ["admin"],
    }),
    validator("param", modelKeyParams, validationHook),
    async (context, next) => {
      const seen = new Set<string>();
      for (const key of new URL(context.req.url).searchParams.keys()) {
        if (seen.has(key))
          invalid(
            "Duplicate query parameter.",
            `/${key.replace(/~/gu, "~0").replace(/\//gu, "~1")}`,
          );
        seen.add(key);
        if (["searchableFields", "sortableFields", "filterableFields", "listOptions"].includes(key))
          invalid("Query targets come from configuration.", "/filters");
      }
      const raw = new URL(context.req.url).searchParams.get("filters");
      if (raw !== null && new TextEncoder().encode(raw).byteLength > MAX_COLLECTION_FILTER_BYTES)
        invalid("Filters exceed the byte limit.", "/filters");
      await next();
    },
    validator("query", contentEntryListQuerySchema, validationHook),
    async (context) => {
      const modelKey = context.req.param("modelKey");
      if (contentModel(capabilities.config, modelKey) === undefined) return notFound();
      const query = context.req.valid("query") as v.InferOutput<typeof contentEntryListQuerySchema>;
      let filters: unknown;
      if (query.filters !== undefined) {
        try {
          filters = JSON.parse(query.filters);
        } catch {
          invalid("Filters must be a JSON array.", "/filters");
        }
      }
      const page = await capabilities.content.list({
        actor: await actor(context),
        ...(filters === undefined ? {} : { filters }),
        modelKey,
        ...pagination(context.req.raw),
        ...(query.q === undefined || query.q.length === 0 ? {} : { q: query.q }),
        ...(query.slug === undefined ? {} : { slug: query.slug }),
        ...(query.sort === undefined ? {} : { sort: query.sort }),
        ...(query.status === undefined ? {} : { status: query.status }),
      });
      return response(contentEntryListSchema, toContentEntryListDto(page));
    },
  );

  app.post(
    "/api/v1/admin/models/:modelKey/entries",
    describeRoute({
      requestBody: {
        content: { "application/json": { schema: resolver(createContentEntryRequestSchema) } },
      },
      responses: {
        201: {
          content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
          description: "Created entry",
        },
      },
      summary: "Create content entry",
      tags: ["admin"],
    }),
    validator("param", modelKeyParams, validationHook),
    validator("json", createContentEntryRequestSchema, validationHook),
    async (context) => {
      const modelKey = context.req.param("modelKey");
      if (contentModel(capabilities.config, modelKey) === undefined) return notFound();
      const body = context.req.valid("json") as v.InferOutput<
        typeof createContentEntryRequestSchema
      >;
      const { blocks, fields, seo, slug, title } = body;
      const resolvedActor = await actor(context);
      const entry = await capabilities.content.create({
        actor: resolvedActor,
        modelKey,
        blocks: blocks.map(blockInput),
        fields,
        ...(seo === undefined ? {} : { seo }),
        ...(slug === undefined ? {} : { slug }),
        title,
      });
      return response(adminContentEntrySchema, await adminEntryDto(resolvedActor, entry), 201);
    },
  );

  app.get(
    "/api/v1/admin/link-targets",
    describeRoute({
      summary: "Search internal link destinations",
      description:
        "Requires content:read. Title-prefix search trims input and compares ASCII case-insensitively; non-ASCII characters and SQL wildcards are literal. Globals are excluded.",
      tags: ["admin"],
      responses: {
        200: {
          description: "Bounded destination page",
          content: {
            "application/json": { schema: resolver(linkTargetPageSchema) },
          },
        },
      },
    }),
    validator("query", linkTargetQuerySchema, validationHook),
    async (context) => {
      const query = context.req.valid("query") as v.InferOutput<typeof linkTargetQuerySchema>;
      const result = await capabilities.links.list(await actor(context), {
        limit: query.limit,
        ...(query.modelKey === undefined ? {} : { modelKey: query.modelKey }),
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(query.search === undefined ? {} : { search: query.search }),
        ...(query.after === undefined ? {} : { after: opaqueCursor(query.after) }),
      });
      return response(linkTargetPageSchema, result);
    },
  );
  app.post(
    "/api/v1/admin/link-targets/resolve",
    describeRoute({
      summary: "Resolve up to 200 distinct destination IDs",
      tags: ["admin"],
      requestBody: {
        content: { "application/json": { schema: resolver(resolveLinkTargetsRequestSchema) } },
      },
      responses: {
        200: {
          description: "Destination statuses keyed by ID",
          content: {
            "application/json": { schema: resolver(linkTargetStatusesSchema) },
          },
        },
      },
    }),
    validator("json", resolveLinkTargetsRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<
        typeof resolveLinkTargetsRequestSchema
      >;
      return response(
        linkTargetStatusesSchema,
        await capabilities.links.resolve(await actor(context), body.ids),
      );
    },
  );
  app.get(
    "/api/v1/admin/entries/:entryId/link-impact",
    describeRoute({
      summary: "Review incoming links before delete or unpublish",
      description:
        "Requires content:read. Source pages contain at most ten initial locations each. Continue an individual source with sourceEntryId, snapshotId and locationsAfter. A 409 CONTENT_LINK_IMPACT_CHANGED requires restarting the review; receipts confer no permissions.",
      tags: ["admin"],
      responses: {
        200: {
          description: "Bounded source or location page and concurrency receipt",
          content: {
            "application/json": { schema: resolver(linkImpactPageSchema) },
          },
        },
      },
    }),
    validator("param", v.strictObject({ entryId: linkTargetIdSchema }), validationHook),
    validator("query", linkImpactQuerySchema, validationHook),
    async (context) => {
      const query = context.req.valid("query") as v.InferOutput<typeof linkImpactQuerySchema>;
      const result = await capabilities.links.impact(await actor(context), {
        limit: query.limit,
        action: query.action,
        targetId: context.req.param("entryId"),
        ...(query.sourceEntryId === undefined ? {} : { sourceEntryId: query.sourceEntryId }),
        ...(query.snapshotId === undefined ? {} : { snapshotId: query.snapshotId }),
        ...(query.after === undefined ? {} : { after: opaqueCursor(query.after) }),
        ...(query.locationsAfter === undefined
          ? {}
          : { locationsAfter: opaqueCursor(query.locationsAfter) }),
      });
      return response(linkImpactPageSchema, result);
    },
  );

  app.get(
    "/api/v1/admin/entries/:entryId",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
          description: "Content entry with its last editor",
        },
      },
      summary: "Load content entry",
      tags: ["admin"],
    }),
    validator("param", entryIdParams, validationHook),
    async (context) => {
      const resolvedActor = await actor(context);
      const projection = await capabilities.content.loadAdminEntry({
        actor: resolvedActor,
        entryId: context.req.param("entryId") as never,
      });
      return projection === null
        ? notFound()
        : response(adminContentEntrySchema, toAdminEntryProjectionDto(projection));
    },
  );

  app.put(
    "/api/v1/admin/entries/:entryId/draft",
    describeRoute({
      requestBody: {
        content: { "application/json": { schema: resolver(saveDraftRequestSchema) } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
          description: "Saved entry",
        },
      },
      summary: "Save complete draft",
      tags: ["admin"],
    }),
    validator("param", entryIdParams, validationHook),
    validator("json", saveDraftRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<typeof saveDraftRequestSchema>;
      const resolvedActor = await actor(context);
      const entry = await capabilities.content.save({
        actor: resolvedActor,
        blocks: body.blocks.map(blockInput),
        entryId: context.req.param("entryId") as never,
        expectedRevision: revision(body, context.req.raw),
        fields: body.fields,
        ...(body.seo === undefined ? {} : { seo: body.seo }),
        ...(body.slug === undefined ? {} : { slug: body.slug }),
        title: body.title,
      });
      return response(adminContentEntrySchema, await adminEntryDto(resolvedActor, entry));
    },
  );

  app.post(
    "/api/v1/admin/entries/:entryId/publish",
    describeRoute({
      requestBody: {
        content: { "application/json": { schema: resolver(publishContentEntryRequestSchema) } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: resolver(publishContentEntryResultSchema) } },
          description: "Publication and build dispatch outcome",
        },
      },
      summary: "Publish content entry",
      tags: ["admin"],
    }),
    validator("param", entryIdParams, validationHook),
    validator("json", publishContentEntryRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<
        typeof publishContentEntryRequestSchema
      >;
      const idempotencyKey = optionalIdempotencyKey(context.req.raw);
      const resolvedActor = await actor(context);
      const published = await capabilities.content.publish({
        actor: resolvedActor,
        entryId: context.req.param("entryId") as never,
        expectedRevision: revision(body, context.req.raw),
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      });
      return response(
        publishContentEntryResultSchema,
        toPublishContentEntryResultDto(
          await capabilities.content.projectPublicationResult({
            actor: resolvedActor,
            result: published,
          }),
        ),
      );
    },
  );

  app.post(
    "/api/v1/admin/entries/:entryId/unpublish",
    describeRoute({
      description:
        "Removes the entry's publication and public route, keeps the draft, and queues a site build. Requires content:publish.",
      requestBody: {
        content: { "application/json": { schema: resolver(unpublishContentEntryRequestSchema) } },
      },
      responses: {
        200: {
          content: {
            "application/json": { schema: resolver(unpublishContentEntryResultSchema) },
          },
          description: "Unpublication and build dispatch outcome",
        },
      },
      summary: "Unpublish content entry",
      tags: ["admin"],
    }),
    validator("param", entryIdParams, validationHook),
    validator("json", unpublishContentEntryRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<
        typeof unpublishContentEntryRequestSchema
      >;
      const idempotencyKey = optionalIdempotencyKey(context.req.raw);
      const resolvedActor = await actor(context);
      const unpublished = await capabilities.content.unpublish({
        actor: resolvedActor,
        entryId: context.req.param("entryId") as never,
        expectedPublishedSnapshotId: body.expectedPublishedSnapshotId as never,
        ...(body.linkImpact === undefined ? {} : { linkImpact: body.linkImpact }),
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      });
      return response(
        unpublishContentEntryResultSchema,
        toUnpublishContentEntryResultDto({
          ...unpublished,
          seo: seoSection.models[unpublished.entry.model.key] !== undefined,
          updatedBy: await capabilities.content.describeActor({
            actor: resolvedActor,
            actorId: unpublished.entry.draft.updatedBy.id,
          }),
        }),
      );
    },
  );

  app.post(
    "/api/v1/admin/entries/:entryId/revert",
    describeRoute({
      description:
        "Replaces the draft with the current publication. Requires content:write and the expected draft revision.",
      requestBody: {
        content: { "application/json": { schema: resolver(revertContentEntryRequestSchema) } },
      },
      responses: {
        200: {
          content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
          description: "Reverted entry",
        },
      },
      summary: "Revert draft to published",
      tags: ["admin"],
    }),
    validator("param", entryIdParams, validationHook),
    async (context) => {
      const body = parse(revertContentEntryRequestSchema, await optionalJsonBody(context.req.raw));
      const resolvedActor = await actor(context);
      const entry = await capabilities.content.revertDraft({
        actor: resolvedActor,
        entryId: context.req.param("entryId") as never,
        expectedRevision: revision(body, context.req.raw),
      });
      return response(adminContentEntrySchema, await adminEntryDto(resolvedActor, entry));
    },
  );

  app.post(
    "/api/v1/admin/entries/:entryId/duplicate",
    describeRoute({
      description:
        "Creates an unpublished copy of a collection entry's draft with a cleared slug. Requires content:write.",
      requestBody: {
        content: { "application/json": { schema: resolver(duplicateContentEntryRequestSchema) } },
      },
      responses: {
        201: {
          content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
          description: "Created copy",
        },
      },
      summary: "Duplicate content entry",
      tags: ["admin"],
    }),
    validator("param", entryIdParams, validationHook),
    async (context) => {
      const body = parse(
        duplicateContentEntryRequestSchema,
        await optionalJsonBody(context.req.raw),
      );
      const expectedRevision = optionalRevision(body, context.req.raw);
      const resolvedActor = await actor(context);
      const entry = await capabilities.content.duplicate({
        actor: resolvedActor,
        entryId: context.req.param("entryId") as never,
        ...(expectedRevision === undefined ? {} : { expectedRevision }),
      });
      return response(adminContentEntrySchema, await adminEntryDto(resolvedActor, entry), 201);
    },
  );

  app.delete(
    "/api/v1/admin/entries/:entryId",
    describeRoute({
      summary: "Delete content entry",
      tags: ["admin"],
      description:
        "Requires content:write and the expected draft revision through If-Match or the body. Optional linkImpact acknowledges the current published incoming links. Refresh impact after CONTENT_LINK_IMPACT_CHANGED.",
      requestBody: {
        required: false,
        content: { "application/json": { schema: resolver(deleteContentEntryRequestSchema) } },
      },
    }),
    validator("param", entryIdParams, validationHook),
    async (context) => {
      const body = parse(deleteContentEntryRequestSchema, await optionalJsonBody(context.req.raw));
      await capabilities.content.delete({
        actor: await actor(context),
        entryId: context.req.param("entryId") as never,
        expectedRevision: revision(body, context.req.raw),
        ...(body.linkImpact === undefined ? {} : { linkImpact: body.linkImpact }),
      });
      return new Response(null, { status: 204 });
    },
  );
}
