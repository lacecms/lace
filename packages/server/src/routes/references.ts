import { opaqueCursor } from "@lacecms/application";
import {
  linkTargetIdSchema,
  referenceImpactPageSchema,
  referenceImpactQuerySchema,
  referenceTargetPageSchema,
  referenceTargetQuerySchema,
  referenceTargetStatusSchema,
  referenceTargetStatusesSchema,
  resolveReferenceTargetsRequestSchema,
} from "@lacecms/contracts";
import { Hono, type MiddlewareHandler } from "hono";
import { resolver } from "hono-openapi";
import * as v from "valibot";
import type { RouteContext } from "../composition/route-context.js";
import { v1Routes } from "../routing/v1-routes.js";
import { invalid, response } from "../shared/http.js";
import {
  authenticationFailure,
  authorizationFailure,
  describePolicy,
  conflictFailure,
  validate,
  validationFailure,
} from "../shared/openapi.js";

const { referenceTargets, resolveReferenceTargets, referenceImpact } = v1Routes.content;

function strictQuery(entries: Record<string, unknown>): MiddlewareHandler {
  return async (context, next) => {
    const seen = new Set<string>();
    for (const key of new URL(context.req.url).searchParams.keys()) {
      if (seen.has(key) || !Object.hasOwn(entries, key))
        invalid("Duplicate or unsupported query parameter.");
      seen.add(key);
    }
    await next();
  };
}

export function createReferenceRoutes({ actors, capabilities }: RouteContext) {
  return new Hono()
    .on(
      referenceTargets.method,
      referenceTargets.path,
      describePolicy(referenceTargets, {
        summary: "Search entry reference targets",
        description:
          "Requires a browser session with content:read. Select one page or collection model. Search uses a trimmed literal title prefix, compared ASCII case-insensitively. Reuse a cursor with the same model, search and limit. A published route-less entry has no path.",
        tags: ["admin"],
        responses: {
          200: {
            description: "Reference targets, up to 50 per page",
            content: { "application/json": { schema: resolver(referenceTargetPageSchema) } },
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      strictQuery(referenceTargetQuerySchema.entries),
      validate("query", referenceTargetQuerySchema),
      async (context) => {
        const query = context.req.valid("query");
        const result = await capabilities.references.list(await actors.actor(context), {
          modelKey: query.modelKey,
          limit: query.limit,
          ...(query.search === undefined ? {} : { search: query.search }),
          ...(query.after === undefined ? {} : { after: opaqueCursor(query.after) }),
        });
        return response(referenceTargetPageSchema, result);
      },
    )
    .on(
      resolveReferenceTargets.method,
      resolveReferenceTargets.path,
      describePolicy(resolveReferenceTargets, {
        summary: "Resolve up to 200 distinct reference target IDs",
        description:
          "Requires a browser session with content:read. Missing IDs have no title and globals are ineligible.",
        tags: ["admin"],
        requestBody: {
          content: {
            "application/json": { schema: resolver(resolveReferenceTargetsRequestSchema) },
          },
        },
        responses: {
          200: {
            description: "Reference target statuses keyed by ID",
            content: {
              "application/json": {
                schema: resolver(v.record(linkTargetIdSchema, referenceTargetStatusSchema)),
              },
            },
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      validate("json", resolveReferenceTargetsRequestSchema),
      async (context) =>
        response(
          referenceTargetStatusesSchema,
          await capabilities.references.resolve(
            await actors.actor(context),
            context.req.valid("json").ids,
          ),
        ),
    )
    .on(
      referenceImpact.method,
      referenceImpact.path,
      describePolicy(referenceImpact, {
        summary: "Review direct entry reference usages",
        description:
          "Requires a browser session with content:read. Returns whole-result blocking and draft usage flags. Source pages hold up to 50 groups with up to ten locations each. Continue one group by specifying sourceEntryId, snapshotId and locationsAfter instead of after. Deletion review receipts are scoped to the current actor, target and graph. Cursors and receipts are limited to 4096 characters.",
        tags: ["admin"],
        responses: {
          200: {
            description: "Bounded source or location page",
            content: { "application/json": { schema: resolver(referenceImpactPageSchema) } },
          },
          ...conflictFailure("CONTENT_REFERENCE_IMPACT_CHANGED. Restart the review."),
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      validate("param", v.strictObject({ entryId: linkTargetIdSchema })),
      strictQuery(referenceImpactQuerySchema.entries),
      validate("query", referenceImpactQuerySchema),
      async (context) => {
        const query = context.req.valid("query");
        const result = await capabilities.references.impact(await actors.actor(context), {
          targetId: context.req.valid("param").entryId,
          action: query.action,
          limit: query.limit,
          ...(query.after === undefined ? {} : { after: opaqueCursor(query.after) }),
          ...(query.sourceEntryId === undefined ? {} : { sourceEntryId: query.sourceEntryId }),
          ...(query.snapshotId === undefined ? {} : { snapshotId: query.snapshotId }),
          ...(query.locationsAfter === undefined
            ? {}
            : { locationsAfter: opaqueCursor(query.locationsAfter) }),
        });
        return response(referenceImpactPageSchema, result);
      },
    );
}
