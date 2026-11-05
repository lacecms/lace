import { invalid, notFound, response, validationHook } from "../shared/http.js";
import { mediaIdParams, pagination } from "../shared/request.js";
import {
  MAX_MEDIA_TAG_INPUT_LENGTH,
  MAX_MEDIA_TAGS_PER_ITEM,
  mediaDetailSchema,
  mediaDeleteQuerySchema,
  mediaListQuerySchema,
  mediaTagCatalogQuerySchema,
  mediaTagCatalogSchema,
  mediaListSchema,
  mediaEntityTag,
  mediaMetadataSchema,
  mediaUrl,
  resolveMediaPrecondition,
  toUpdateMediaMetadataResultDto,
  updateMediaMetadataRequestSchema,
  updateMediaMetadataResultSchema,
  toMediaDetailDto,
} from "@lacecms/contracts";
import { Hono } from "hono";
import { describeRoute, resolver, validator } from "hono-openapi";
import * as v from "valibot";
import type { RouteContext } from "../composition/route-context.js";
import {
  conditionalMediaResponse,
  PUBLIC_MEDIA_CACHE_CONTROL,
  PREVIEW_MEDIA_CACHE_CONTROL,
} from "./media-binary.js";
import { readMediaUpload } from "./media-upload.js";

export function registerMediaRoutes(app: Hono, routeContext: RouteContext): void {
  const { input, actor, media, mediaDto } = routeContext;
  app.get(
    "/api/v1/admin/media",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(mediaListSchema) } },
          description: "Media page",
        },
      },
      summary: "List media",
      tags: ["admin"],
    }),
    validator("query", mediaListQuerySchema, validationHook),
    async (context) => {
      const query = context.req.valid("query") as v.InferOutput<typeof mediaListQuerySchema>;
      const page = await media().list({
        actor: await actor(context),
        ...pagination(context.req.raw),
        ...(query.q === undefined || query.q.length === 0 ? {} : { q: query.q }),
        ...(query.sort === undefined ? {} : { sort: query.sort }),
        ...(query.type === undefined ? {} : { type: query.type }),
        ...(query.tag === undefined ? {} : { tags: query.tag }),
        ...(query.sha256 === undefined ? {} : { sha256: query.sha256 }),
      });
      return response(mediaListSchema, {
        items: page.items.map(mediaDto),
        ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor }),
      });
    },
  );

  app.get(
    "/api/v1/admin/media/tags",
    describeRoute({
      summary: "List media tags with counts",
      tags: ["admin"],
      responses: {
        200: {
          description: "Media tag catalog",
          content: { "application/json": { schema: resolver(mediaTagCatalogSchema) } },
        },
      },
    }),
    validator("query", mediaTagCatalogQuerySchema, validationHook),
    async (context) => {
      const query = context.req.valid("query");
      return response(
        mediaTagCatalogSchema,
        await media().listTags({
          actor: await actor(context),
          ...pagination(context.req.raw),
          ...(query.q === undefined ? {} : { q: query.q }),
        }),
      );
    },
  );

  app.post(
    "/api/v1/admin/media",
    describeRoute({
      requestBody: {
        required: true,
        content: {
          "multipart/form-data": {
            schema: {
              type: "object",
              required: ["file"],
              properties: {
                file: { type: "string", format: "binary" },
                tags: {
                  type: "array",
                  maxItems: MAX_MEDIA_TAGS_PER_ITEM,
                  items: {
                    type: "string",
                    description: "ASCII tag: letters, digits and hyphens; normalized to lowercase",
                    maxLength: MAX_MEDIA_TAG_INPUT_LENGTH,
                  },
                },
              },
            },
          },
        },
      },
      responses: {
        201: {
          content: { "application/json": { schema: resolver(mediaMetadataSchema) } },
          description: "Created media",
        },
      },
      summary: "Upload media",
      tags: ["admin"],
    }),
    async (context) => {
      const resolvedActor = await actor(context);
      const upload = await readMediaUpload(context.req.raw);
      if (upload instanceof Response) return upload;
      const created = await media().create({ ...upload, actor: resolvedActor });
      return response(mediaMetadataSchema, mediaDto(created), 201);
    },
  );

  app.delete(
    "/api/v1/admin/media/:mediaId",
    describeRoute({
      responses: {
        202: {
          content: { "application/json": { schema: resolver(mediaMetadataSchema) } },
          description: "Deletion requested",
        },
      },
      summary: "Request media deletion",
      description:
        "With `detach=drafts`, first removes the media from the current draft of every entry that uses it; refused with `MEDIA_IN_USE` while a current publication uses it.",
      tags: ["admin"],
    }),
    validator("param", mediaIdParams, validationHook),
    validator("query", mediaDeleteQuerySchema, validationHook),
    async (context) => {
      const { detach } = context.req.valid("query");
      const deleted = await media().requestDeletion({
        actor: await actor(context),
        ...(detach === undefined ? {} : { detach }),
        mediaId: context.req.param("mediaId") as never,
      });
      return response(mediaMetadataSchema, mediaDto(deleted), 202);
    },
  );

  app.get(
    "/api/v1/admin/media/:mediaId",
    describeRoute({
      responses: {
        200: {
          content: { "application/json": { schema: resolver(mediaDetailSchema) } },
          description: "Media item with the entries that use it",
        },
      },
      summary: "Get media details",
      tags: ["admin"],
    }),
    validator("param", mediaIdParams, validationHook),
    async (context) => {
      const detail = await media().get({
        actor: await actor(context),
        mediaId: context.req.param("mediaId") as never,
      });
      return detail === null
        ? notFound()
        : response(
            mediaDetailSchema,
            toMediaDetailDto(detail, mediaUrl(input.publicBaseUrl!, detail.id)),
            200,
            { etag: mediaEntityTag(detail.updatedAt) },
          );
    },
  );

  app.patch(
    "/api/v1/admin/media/:mediaId",
    describeRoute({
      description:
        "Updates alt text, caption, and focal point of active media. Requires media:write and the item's ETag in If-Match. Editing media used by published content queues a site build.",
      parameters: [
        {
          description: "The item's current ETag: its updatedAt in quoted Unix milliseconds.",
          in: "header",
          name: "If-Match",
          required: true,
          schema: { type: "string" },
        },
      ],
      requestBody: {
        content: { "application/json": { schema: resolver(updateMediaMetadataRequestSchema) } },
      },
      responses: {
        200: {
          content: {
            "application/json": { schema: resolver(updateMediaMetadataResultSchema) },
          },
          description: "Updated media and build dispatch outcome",
        },
      },
      summary: "Update media metadata",
      tags: ["admin"],
    }),
    validator("param", mediaIdParams, validationHook),
    validator("json", updateMediaMetadataRequestSchema, validationHook),
    async (context) => {
      const body = context.req.valid("json") as v.InferOutput<
        typeof updateMediaMetadataRequestSchema
      >;
      let expectedUpdatedAt: ReturnType<typeof resolveMediaPrecondition>;
      try {
        expectedUpdatedAt = resolveMediaPrecondition(context.req.header("if-match") ?? undefined);
      } catch {
        return invalid("If-Match must carry the media item's current strong ETag.");
      }
      const updated = await media().updateMetadata({
        actor: await actor(context),
        expectedUpdatedAt,
        mediaId: context.req.param("mediaId") as never,
        patch: body,
      });
      return updated === null
        ? notFound()
        : response(
            updateMediaMetadataResultSchema,
            toUpdateMediaMetadataResultDto(
              updated,
              mediaUrl(input.publicBaseUrl!, updated.media.id),
            ),
            200,
            { etag: mediaEntityTag(updated.media.updatedAt) },
          );
    },
  );

  app.post(
    "/api/v1/admin/media/:mediaId/retry-deletion",
    describeRoute({
      responses: {
        202: {
          content: { "application/json": { schema: resolver(mediaMetadataSchema) } },
          description: "Deletion retry requested",
        },
      },
      summary: "Retry media deletion",
      tags: ["admin"],
    }),
    validator("param", mediaIdParams, validationHook),
    async (context) => {
      const retried = await media().retryDeletion({
        actor: await actor(context),
        mediaId: context.req.param("mediaId") as never,
      });
      return response(mediaMetadataSchema, mediaDto(retried), 202);
    },
  );

  app.get(
    "/api/v1/public/media/:mediaId",
    describeRoute({
      description:
        "Streams media that a current publication uses. The response carries a strong `ETag` " +
        "derived from the media ID, which never changes because stored bytes are immutable, " +
        "and `Cache-Control: public, max-age=86400`. A matching `If-None-Match` (weak " +
        "comparison or `*`) receives `304 Not Modified` without a body; a malformed one is " +
        "ignored. Unpublished or unknown media is not found, never `304`.",
      responses: {
        200: { description: "Media bytes" },
        304: { description: "The cached media is still valid" },
        404: { description: "Media is not published or does not exist" },
      },
      summary: "Read published media",
      tags: ["public"],
    }),
    validator("param", mediaIdParams, validationHook),
    async (context) => {
      const resolved = await media().resolvePublic({
        mediaId: context.req.param("mediaId") as never,
      });
      return resolved === null
        ? notFound()
        : conditionalMediaResponse(context.req.raw, resolved, PUBLIC_MEDIA_CACHE_CONTROL, (item) =>
            media().openBinary(item),
          );
    },
  );

  app.get(
    "/api/v1/admin/media/:mediaId/preview",
    describeRoute({
      description:
        "Streams active media to an authenticated reader with the same immutable `ETag` as " +
        "the public route and `Cache-Control: private, no-cache`. A matching `If-None-Match` " +
        "receives `304 Not Modified` after authorization; a malformed one is ignored.",
      responses: {
        200: { description: "Media bytes" },
        304: { description: "The cached media is still valid" },
        404: { description: "Media is not active or does not exist" },
      },
      summary: "Preview media",
      tags: ["admin"],
    }),
    validator("param", mediaIdParams, validationHook),
    async (context) => {
      const resolved = await media().resolvePreview({
        actor: await actor(context),
        mediaId: context.req.param("mediaId") as never,
      });
      return resolved === null
        ? notFound()
        : conditionalMediaResponse(context.req.raw, resolved, PREVIEW_MEDIA_CACHE_CONTROL, (item) =>
            media().openBinary(item),
          );
    },
  );
}
