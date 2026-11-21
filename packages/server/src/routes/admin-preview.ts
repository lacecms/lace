import { effectiveActorPermissions } from "@lacecms/application";
import type { PreviewStatus } from "@lacecms/application";
import type { Actor } from "../composition/input.js";
import { entryId } from "../shared/application-input.js";
import { entryIdParams } from "../shared/request.js";
import {
  createPreviewRequestSchema,
  errorEnvelopeSchema,
  previewReadinessSchema,
  previewReceiptSchema,
  previewStatusSchema,
  toIsoTimestamp,
  transportError,
} from "@lacecms/contracts";
import { Hono } from "hono";
import { resolver } from "hono-openapi";
import type { RouteContext } from "../composition/route-context.js";
import { v1Routes } from "../routing/v1-routes.js";
import { AuthorizationError, errorResponse, noStore, response } from "../shared/http.js";
import {
  authenticationFailure,
  authorizationFailure,
  describePolicy,
  validate,
  validationFailure,
} from "../shared/openapi.js";

const { config, status, create } = v1Routes.preview;
const unavailable = () =>
  errorResponse(transportError("PREVIEW_CONFIGURATION_UNAVAILABLE"), noStore);

function requirePreviewPermission(actor: Actor, permission: "content:read" | "content:write") {
  const permissions = effectiveActorPermissions(actor);
  if (actor.authority !== undefined || !permissions.includes(permission))
    throw new AuthorizationError();
  return permissions;
}

function statusDto(status: PreviewStatus | null) {
  return (
    status && {
      id: status.id,
      revision: status.revision,
      state: status.state,
      createdAt: toIsoTimestamp(status.createdAt),
      ...(status.readyAt === undefined ? {} : { readyAt: toIsoTimestamp(status.readyAt) }),
      ...(status.expiresAt === undefined ? {} : { expiresAt: toIsoTimestamp(status.expiresAt) }),
      ...(status.reason === undefined ? {} : { reason: status.reason }),
    }
  );
}

export function createAdminPreviewRoutes(
  { actors, capabilities }: RouteContext,
  frameOrigin: string | undefined,
) {
  const configured = capabilities.adminPreview;
  const preview = typeof configured === "object" ? configured : undefined;
  const permissionResponses = { ...authenticationFailure(), ...authorizationFailure() };
  const unavailableResponse = {
    description: "Draft preview is unavailable",
    content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
  };
  const receipt = { "application/json": { schema: resolver(previewReceiptSchema) } };
  return new Hono()
    .on(
      config.method,
      config.path,
      describePolicy(config, {
        summary: "Read draft preview configuration readiness",
        tags: ["admin"],
        responses: {
          ...permissionResponses,
          200: {
            description: "Local configuration readiness",
            content: { "application/json": { schema: resolver(previewReadinessSchema) } },
          },
        },
      }),
      async (context) => {
        const permissions = requirePreviewPermission(await actors.actor(context), "content:read");
        return response(
          previewReadinessSchema,
          preview
            ? {
                ready: true,
                origin: preview.origin,
                viewMode: preview.origin === frameOrigin ? "iframe" : "new-tab",
              }
            : {
                ready: false,
                ...(permissions.includes("settings:manage") && {
                  missing: [
                    configured === "configuration-required"
                      ? "preview-configuration"
                      : "preview-disabled",
                  ],
                }),
              },
          200,
          noStore,
        );
      },
    )
    .on(
      status.method,
      status.path,
      describePolicy(status, {
        summary: "Read the current saved-draft preview",
        tags: ["admin"],
        responses: {
          ...permissionResponses,
          ...validationFailure(),
          503: unavailableResponse,
          200: {
            description: "Current preview or null",
            content: { "application/json": { schema: resolver(previewStatusSchema) } },
          },
        },
      }),
      actors.authenticate,
      validate("param", entryIdParams),
      async (context) => {
        const actor = await actors.actor(context);
        requirePreviewPermission(actor, "content:read");
        if (!preview) return unavailable();
        const target = entryId(context.req.valid("param").entryId);
        return response(
          previewStatusSchema,
          statusDto(await preview.status(actor, target)),
          200,
          noStore,
        );
      },
    )
    .on(
      create.method,
      create.path,
      describePolicy(create, {
        summary: "Create a preview of the specified saved revision",
        tags: ["admin"],
        requestBody: {
          content: { "application/json": { schema: resolver(createPreviewRequestSchema) } },
        },
        responses: {
          ...permissionResponses,
          ...validationFailure(),
          503: unavailableResponse,
          409: {
            description: "Draft revision, eligibility, idempotency or preview capacity conflict",
            content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          },
          200: { description: "Existing preview request replayed", content: receipt },
          202: { description: "Saved revision accepted for preview", content: receipt },
        },
      }),
      actors.authenticate,
      validate("param", entryIdParams),
      validate("json", createPreviewRequestSchema),
      async (context) => {
        const actor = await actors.actor(context);
        requirePreviewPermission(actor, "content:write");
        if (!preview) return unavailable();
        const target = entryId(context.req.valid("param").entryId);
        const result = await preview.create(actor, {
          entryId: target,
          ...context.req.valid("json"),
        });
        if (result.kind === "rejected")
          return errorResponse(transportError(result.reason), noStore);
        const { id, revision } = result.generation;
        return response(
          previewReceiptSchema,
          { id, revision },
          result.kind === "admitted" ? 202 : 200,
          noStore,
        );
      },
    );
}
