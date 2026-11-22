import { entryId, snapshotId } from "../shared/application-input.js";
import { bodyResponse, invalid, noStore, notFound, parse, response } from "../shared/http.js";
import {
  cursorPageInput,
  entryIdParams,
  modelKeyParams,
  optionalIdempotencyKey,
  optionalJsonBody,
  optionalRevision,
  revision,
} from "../shared/request.js";
import { contentModel } from "../shared/content-config.js";
import {
  authenticationFailure,
  conflictFailure,
  authorizationFailure,
  describePolicy,
  validate,
  validationFailure,
} from "../shared/openapi.js";
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
  entityTagForVersion,
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
import { resolver } from "hono-openapi";
import * as v from "valibot";
import type { RouteContext } from "../composition/route-context.js";
import { v1Routes } from "../routing/v1-routes.js";

const routes = v1Routes.content;
const draftTagSchema = { type: "string", pattern: '^"[0-9]+"$', example: '"7"' } as const;
const draftIfMatch = {
  description:
    "Quoted draft revision returned by the entry read. It must agree with expectedRevision when both are supplied.",
  in: "header",
  name: "If-Match",
  required: false,
  schema: draftTagSchema,
} as const;

const referenceAdmission =
  "Reference failures identify the field or block using a JSON Pointer. Target issues use reference_target_missing, reference_target_model or reference_target_unpublished. A reference_cycle witness lists up to 16 entry IDs for callers with content:read. truncated indicates an omitted segment. publishFirst identifies a saved draft whose publication would remove an edge on the reported cycle. Further corrections may be required. reference_graph_limit means the proof would exceed 2048 reachable IDs. Reduce dependencies and retry.";

export function createContentRoutes(routeContext: RouteContext) {
  const { actor } = routeContext.actors;
  const { capabilities } = routeContext;
  const { adminEntryDto, seoSection } = capabilities;
  return new Hono()
    .on(
      routes.models.method,
      routes.models.path,
      describePolicy(routes.models, {
        responses: {
          200: {
            content: { "application/json": { schema: resolver(contentModelListSchema) } },
            description: "Content models",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
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
    )
    .on(
      routes.listEntries.method,
      routes.listEntries.path,
      describePolicy(routes.listEntries, {
        responses: {
          200: {
            content: { "application/json": { schema: resolver(contentEntryListSchema) } },
            description: "Content entry page with per-status totals",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
        summary: "List content entries",
        tags: ["admin"],
      }),
      validate("param", modelKeyParams),
      async (context, next) => {
        const seen = new Set<string>();
        for (const key of new URL(context.req.url).searchParams.keys()) {
          if (seen.has(key))
            invalid(
              "Duplicate query parameter.",
              `/${key.replace(/~/gu, "~0").replace(/\//gu, "~1")}`,
            );
          seen.add(key);
          if (
            ["searchableFields", "sortableFields", "filterableFields", "listOptions"].includes(key)
          )
            invalid("Query targets come from configuration.", "/filters");
        }
        const raw = new URL(context.req.url).searchParams.get("filters");
        if (raw !== null && new TextEncoder().encode(raw).byteLength > MAX_COLLECTION_FILTER_BYTES)
          invalid("Filters exceed the byte limit.", "/filters");
        await next();
      },
      validate("query", contentEntryListQuerySchema),
      async (context) => {
        const modelKey = context.req.valid("param").modelKey;
        if (contentModel(capabilities.config, modelKey) === undefined) return notFound();
        const query = context.req.valid("query");
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
          ...cursorPageInput(query),
          ...(query.q === undefined || query.q.length === 0 ? {} : { q: query.q }),
          ...(query.slug === undefined ? {} : { slug: query.slug }),
          ...(query.sort === undefined ? {} : { sort: query.sort }),
          ...(query.status === undefined ? {} : { status: query.status }),
        });
        return response(contentEntryListSchema, toContentEntryListDto(page));
      },
    )
    .on(
      routes.createEntry.method,
      routes.createEntry.path,
      describePolicy(routes.createEntry, {
        description: referenceAdmission,
        requestBody: {
          content: { "application/json": { schema: resolver(createContentEntryRequestSchema) } },
        },
        responses: {
          201: {
            content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
            description: "Created entry",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
          ...conflictFailure(
            "The reference graph or entry changed. For CONFLICT, reload and retry.",
          ),
        },
        summary: "Create content entry",
        tags: ["admin"],
      }),
      validate("param", modelKeyParams),
      validate("json", createContentEntryRequestSchema),
      async (context) => {
        const modelKey = context.req.valid("param").modelKey;
        if (contentModel(capabilities.config, modelKey) === undefined) return notFound();
        const body = context.req.valid("json");
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
    )
    .on(
      routes.linkTargets.method,
      routes.linkTargets.path,
      describePolicy(routes.linkTargets, {
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
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      validate("query", linkTargetQuerySchema),
      async (context) => {
        const query = context.req.valid("query");
        const result = await capabilities.links.list(await actor(context), {
          limit: query.limit,
          ...(query.modelKey === undefined ? {} : { modelKey: query.modelKey }),
          ...(query.status === undefined ? {} : { status: query.status }),
          ...(query.search === undefined ? {} : { search: query.search }),
          ...(query.after === undefined ? {} : { after: opaqueCursor(query.after) }),
        });
        return response(linkTargetPageSchema, result);
      },
    )
    .on(
      routes.resolveLinkTargets.method,
      routes.resolveLinkTargets.path,
      describePolicy(routes.resolveLinkTargets, {
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
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      validate("json", resolveLinkTargetsRequestSchema),
      async (context) => {
        const body = context.req.valid("json");
        return response(
          linkTargetStatusesSchema,
          await capabilities.links.resolve(await actor(context), body.ids),
        );
      },
    )
    .on(
      routes.linkImpact.method,
      routes.linkImpact.path,
      describePolicy(routes.linkImpact, {
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
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      validate("param", v.strictObject({ entryId: linkTargetIdSchema })),
      validate("query", linkImpactQuerySchema),
      async (context) => {
        const query = context.req.valid("query");
        const result = await capabilities.links.impact(await actor(context), {
          limit: query.limit,
          action: query.action,
          targetId: context.req.valid("param").entryId,
          ...(query.sourceEntryId === undefined ? {} : { sourceEntryId: query.sourceEntryId }),
          ...(query.snapshotId === undefined ? {} : { snapshotId: query.snapshotId }),
          ...(query.after === undefined ? {} : { after: opaqueCursor(query.after) }),
          ...(query.locationsAfter === undefined
            ? {}
            : { locationsAfter: opaqueCursor(query.locationsAfter) }),
        });
        return response(linkImpactPageSchema, result);
      },
    )
    .on(
      routes.getEntry.method,
      routes.getEntry.path,
      describePolicy(routes.getEntry, {
        responses: {
          200: {
            content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
            description: "Content entry with its last editor",
            headers: {
              ETag: { description: "The quoted draft revision.", schema: draftTagSchema },
            },
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
        summary: "Load content entry",
        tags: ["admin"],
      }),
      validate("param", entryIdParams),
      async (context) => {
        const resolvedActor = await actor(context);
        const projection = await capabilities.content.loadAdminEntry({
          actor: resolvedActor,
          entryId: entryId(context.req.valid("param").entryId),
        });
        if (projection === null) return notFound();
        const entry = toAdminEntryProjectionDto(projection);
        return response(adminContentEntrySchema, entry, 200, {
          ...noStore,
          etag: entityTagForVersion(entry.draft.revision),
        });
      },
    )
    .on(
      routes.saveDraft.method,
      routes.saveDraft.path,
      describePolicy(routes.saveDraft, {
        description: referenceAdmission,
        parameters: [draftIfMatch],
        requestBody: {
          content: { "application/json": { schema: resolver(saveDraftRequestSchema) } },
        },
        responses: {
          200: {
            content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
            description: "Saved entry",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
          ...conflictFailure(
            "The reference graph or entry changed. For CONFLICT, reload and retry.",
          ),
        },
        summary: "Save complete draft",
        tags: ["admin"],
      }),
      validate("param", entryIdParams),
      validate("json", saveDraftRequestSchema),
      async (context) => {
        const body = context.req.valid("json");
        const resolvedActor = await actor(context);
        const entry = await capabilities.content.save({
          actor: resolvedActor,
          blocks: body.blocks.map(blockInput),
          entryId: entryId(context.req.valid("param").entryId),
          expectedRevision: revision(body, context.req.raw),
          fields: body.fields,
          ...(body.seo === undefined ? {} : { seo: body.seo }),
          ...(body.slug === undefined ? {} : { slug: body.slug }),
          title: body.title,
        });
        return response(adminContentEntrySchema, await adminEntryDto(resolvedActor, entry));
      },
    )
    .on(
      routes.publishEntry.method,
      routes.publishEntry.path,
      describePolicy(routes.publishEntry, {
        description: referenceAdmission,
        parameters: [draftIfMatch],
        requestBody: {
          content: { "application/json": { schema: resolver(publishContentEntryRequestSchema) } },
        },
        responses: {
          200: {
            content: { "application/json": { schema: resolver(publishContentEntryResultSchema) } },
            description: "Publication and build dispatch outcome",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
          ...conflictFailure(
            "The reference graph or entry changed. For CONFLICT, reload and retry.",
          ),
        },
        summary: "Publish content entry",
        tags: ["admin"],
      }),
      validate("param", entryIdParams),
      validate("json", publishContentEntryRequestSchema),
      async (context) => {
        const body = context.req.valid("json");
        const idempotencyKey = optionalIdempotencyKey(context.req.raw);
        const resolvedActor = await actor(context);
        const published = await capabilities.content.publish({
          actor: resolvedActor,
          entryId: entryId(context.req.valid("param").entryId),
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
    )
    .on(
      routes.unpublishEntry.method,
      routes.unpublishEntry.path,
      describePolicy(routes.unpublishEntry, {
        description:
          "Requires content:publish and the expected published snapshot. Keeps the draft and queues a site build after removing the publication. An idempotency key can replay a committed request. Delivered typed uses block unpublication. Review published URL uses with linkImpact.",
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
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
          ...conflictFailure(
            "CONTENT_REFERENCES_IN_USE requires removing the delivered use and republishing its source. For CONTENT_LINKS_IN_USE or CONTENT_LINK_IMPACT_CHANGED, review the current URL usages and supply linkImpact. Publication preconditions can also conflict.",
          ),
        },
        summary: "Unpublish content entry",
        tags: ["admin"],
      }),
      validate("param", entryIdParams),
      validate("json", unpublishContentEntryRequestSchema),
      async (context) => {
        const body = context.req.valid("json");
        const idempotencyKey = optionalIdempotencyKey(context.req.raw);
        const resolvedActor = await actor(context);
        const unpublished = await capabilities.content.unpublish({
          actor: resolvedActor,
          entryId: entryId(context.req.valid("param").entryId),
          expectedPublishedSnapshotId: snapshotId(body.expectedPublishedSnapshotId),
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
    )
    .on(
      routes.revertDraft.method,
      routes.revertDraft.path,
      describePolicy(routes.revertDraft, {
        parameters: [draftIfMatch],
        description: `Replaces the draft with the current publication. Requires content:write and the expected draft revision. ${referenceAdmission}`,
        requestBody: {
          content: { "application/json": { schema: resolver(revertContentEntryRequestSchema) } },
        },
        responses: {
          200: {
            content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
            description: "Reverted entry",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
          ...conflictFailure(
            "The reference graph or entry changed. For CONFLICT, reload and retry.",
          ),
        },
        summary: "Revert draft to published",
        tags: ["admin"],
      }),
      validate("param", entryIdParams),
      async (context) => {
        const body = parse(
          revertContentEntryRequestSchema,
          await optionalJsonBody(context.req.raw),
        );
        const resolvedActor = await actor(context);
        const entry = await capabilities.content.revertDraft({
          actor: resolvedActor,
          entryId: entryId(context.req.valid("param").entryId),
          expectedRevision: revision(body, context.req.raw),
        });
        return response(adminContentEntrySchema, await adminEntryDto(resolvedActor, entry));
      },
    )
    .on(
      routes.duplicateEntry.method,
      routes.duplicateEntry.path,
      describePolicy(routes.duplicateEntry, {
        parameters: [draftIfMatch],
        description: `Creates an unpublished copy of a collection entry's draft with a cleared slug. Requires content:write. ${referenceAdmission}`,
        requestBody: {
          content: { "application/json": { schema: resolver(duplicateContentEntryRequestSchema) } },
        },
        responses: {
          201: {
            content: { "application/json": { schema: resolver(adminContentEntrySchema) } },
            description: "Created copy",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
          ...conflictFailure(
            "The reference graph or entry changed. For CONFLICT, reload and retry.",
          ),
        },
        summary: "Duplicate content entry",
        tags: ["admin"],
      }),
      validate("param", entryIdParams),
      async (context) => {
        const body = parse(
          duplicateContentEntryRequestSchema,
          await optionalJsonBody(context.req.raw),
        );
        const expectedRevision = optionalRevision(body, context.req.raw);
        const resolvedActor = await actor(context);
        const entry = await capabilities.content.duplicate({
          actor: resolvedActor,
          entryId: entryId(context.req.valid("param").entryId),
          ...(expectedRevision === undefined ? {} : { expectedRevision }),
        });
        return response(adminContentEntrySchema, await adminEntryDto(resolvedActor, entry), 201);
      },
    )
    .on(
      routes.deleteEntry.method,
      routes.deleteEntry.path,
      describePolicy(routes.deleteEntry, {
        parameters: [draftIfMatch],
        summary: "Delete content entry",
        tags: ["admin"],
        description:
          "Requires content:write and the expected draft revision through If-Match or the body. Deletion of a published entry also requires content:publish. A draft-only reference review uses referenceImpact. Published URL uses require a separate linkImpact acknowledgment. Both objects can be supplied together.",
        requestBody: {
          required: false,
          content: { "application/json": { schema: resolver(deleteContentEntryRequestSchema) } },
        },
        responses: {
          204: { description: "Entry deleted" },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
          ...conflictFailure(
            "CONTENT_REFERENCES_IN_USE requires removing the delivered use and republishing its source. For CONTENT_REFERENCE_REVIEW_REQUIRED or CONTENT_REFERENCE_IMPACT_CHANGED, review the current draft usages and supply referenceImpact. For CONTENT_LINKS_IN_USE or CONTENT_LINK_IMPACT_CHANGED, review URL usages and supply linkImpact. Target preconditions can also conflict.",
          ),
        },
      }),
      validate("param", entryIdParams),
      async (context) => {
        const body = parse(
          deleteContentEntryRequestSchema,
          await optionalJsonBody(context.req.raw),
        );
        await capabilities.content.delete({
          actor: await actor(context),
          entryId: entryId(context.req.valid("param").entryId),
          expectedRevision: revision(body, context.req.raw),
          ...(body.linkImpact === undefined ? {} : { linkImpact: body.linkImpact }),
          ...(body.referenceImpact === undefined ? {} : { referenceImpact: body.referenceImpact }),
        });
        return bodyResponse(null, 204);
      },
    );
}
