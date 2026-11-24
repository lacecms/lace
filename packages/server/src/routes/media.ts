import { mediaId, entryId } from "../shared/application-input.js";
import { invalid, notFound, response } from "../shared/http.js";
import { cursorPageInput, mediaIdParams, pagination } from "../shared/request.js";
import {
  authenticationFailure,
  authorizationFailure,
  describePolicy,
  conflictFailure,
  validate,
  validationFailure,
} from "../shared/openapi.js";
import {
  ContractValidationError,
  errorEnvelopeSchema,
  MAX_MEDIA_TAG_INPUT_LENGTH,
  MAX_MEDIA_TAGS_PER_ITEM,
  mediaDetailSchema,
  mediaDeleteQuerySchema,
  mediaDetachProgressSchema,
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
import { MediaThumbnailUnavailableError } from "@lacecms/application";
import { Hono } from "hono";
import { resolver } from "hono-openapi";
import type { RouteContext } from "../composition/route-context.js";
import { v1Routes } from "../routing/v1-routes.js";
import {
  conditionalMediaResponse,
  conditionalThumbnailResponse,
  PUBLIC_MEDIA_CACHE_CONTROL,
  PREVIEW_MEDIA_CACHE_CONTROL,
  thumbnailParameters,
  thumbnailResponses,
} from "./media-binary.js";
import { readMediaUpload } from "./media-upload.js";

const routes = v1Routes.media;

export function createMediaRoutes(routeContext: RouteContext) {
  const { actor } = routeContext.actors;
  const { capabilities } = routeContext;
  const { media, mediaDto, thumbnails } = capabilities;
  return new Hono()
    .on(
      routes.list.method,
      routes.list.path,
      describePolicy(routes.list, {
        responses: {
          200: {
            content: { "application/json": { schema: resolver(mediaListSchema) } },
            description: "Media page",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
        summary: "List media",
        tags: ["admin"],
      }),
      validate("query", mediaListQuerySchema),
      async (context) => {
        const query = context.req.valid("query");
        const page = await media().list({
          actor: await actor(context),
          ...cursorPageInput(query),
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
    )
    .on(
      routes.tags.method,
      routes.tags.path,
      describePolicy(routes.tags, {
        summary: "List media tags with counts",
        tags: ["admin"],
        responses: {
          200: {
            description: "Media tag catalog",
            content: { "application/json": { schema: resolver(mediaTagCatalogSchema) } },
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      validate("query", mediaTagCatalogQuerySchema),
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
    )
    .on(
      routes.upload.method,
      routes.upload.path,
      describePolicy(routes.upload, {
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
                      description:
                        "ASCII tag: letters, digits and hyphens; normalized to lowercase",
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
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
        summary: "Upload media",
        tags: ["admin"],
      }),
      async (context) => {
        const resolvedActor = await actor(context);
        const upload = await readMediaUpload(context.req.raw);
        if (upload instanceof Response) return upload;
        const defer = capabilities.deferTask(context);
        const created = await media().create({
          ...upload,
          actor: resolvedActor,
          ...(thumbnails?.canGenerate && {
            onCommitted: (id) => defer(Promise.resolve().then(() => thumbnails.prepare(id))),
          }),
        });
        return response(mediaMetadataSchema, mediaDto(created), 201);
      },
    )
    .on(
      routes.delete.method,
      routes.delete.path,
      describePolicy(routes.delete, {
        responses: {
          200: {
            content: { "application/json": { schema: resolver(mediaDetachProgressSchema) } },
            description: "Draft plan or acknowledgment for one entry",
          },
          ...conflictFailure(
            "Published or excess usage, remaining usage at finish, or a stale draft revision",
          ),
          202: {
            content: { "application/json": { schema: resolver(mediaMetadataSchema) } },
            description: "Deletion requested",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
        summary: "Request media deletion",
        description:
          "With detach=drafts, start returns the current draft IDs and revisions, or queues an unused item. Send step=entry with entryId and expectedRevision for each confirmed draft, then step=finish to queue deletion. Both write permissions are required for every detach request. Missing or inactive media returns 422 CONTENT_INVALID_STATE.",
        tags: ["admin"],
      }),
      validate("param", mediaIdParams),
      validate("query", mediaDeleteQuerySchema),
      async (context) => {
        const query = context.req.valid("query");
        const input = {
          actor: await actor(context),
          mediaId: mediaId(context.req.valid("param").mediaId),
        };
        const result =
          query.detach === undefined
            ? await media().requestDeletion(input)
            : await media().detachDeletion({
                ...input,
                ...(query.step === "entry"
                  ? {
                      step: "entry",
                      entryId: entryId(query.entryId!),
                      expectedRevision: Number(query.expectedRevision),
                    }
                  : query.step === "finish"
                    ? { step: "finish" }
                    : {}),
              });
        if ("state" in result) return response(mediaDetachProgressSchema, result);
        return response(mediaMetadataSchema, mediaDto(result), 202);
      },
    )
    .on(
      routes.get.method,
      routes.get.path,
      describePolicy(routes.get, {
        responses: {
          200: {
            content: { "application/json": { schema: resolver(mediaDetailSchema) } },
            description: "Media item with the entries that use it",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
        summary: "Get media details",
        tags: ["admin"],
      }),
      validate("param", mediaIdParams),
      async (context) => {
        const detail = await media().get({
          actor: await actor(context),
          mediaId: mediaId(context.req.valid("param").mediaId),
        });
        return detail === null
          ? notFound()
          : response(
              mediaDetailSchema,
              toMediaDetailDto(detail, mediaUrl(capabilities.publicBaseUrl!, detail.id)),
              200,
              { etag: mediaEntityTag(detail.updatedAt) },
            );
      },
    )
    .on(
      routes.update.method,
      routes.update.path,
      describePolicy(routes.update, {
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
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
        summary: "Update media metadata",
        tags: ["admin"],
      }),
      validate("param", mediaIdParams),
      validate("json", updateMediaMetadataRequestSchema),
      async (context) => {
        const body = context.req.valid("json");
        let expectedUpdatedAt: ReturnType<typeof resolveMediaPrecondition>;
        try {
          expectedUpdatedAt = resolveMediaPrecondition(context.req.header("if-match") ?? undefined);
        } catch (error) {
          if (!(error instanceof ContractValidationError)) throw error;
          return invalid("If-Match must carry the media item's current strong ETag.");
        }
        const updated = await media().updateMetadata({
          actor: await actor(context),
          expectedUpdatedAt,
          mediaId: mediaId(context.req.valid("param").mediaId),
          patch: body,
        });
        return updated === null
          ? notFound()
          : response(
              updateMediaMetadataResultSchema,
              toUpdateMediaMetadataResultDto(
                updated,
                mediaUrl(capabilities.publicBaseUrl!, updated.media.id),
              ),
              200,
              { etag: mediaEntityTag(updated.media.updatedAt) },
            );
      },
    )
    .on(
      routes.retryDeletion.method,
      routes.retryDeletion.path,
      describePolicy(routes.retryDeletion, {
        responses: {
          202: {
            content: { "application/json": { schema: resolver(mediaMetadataSchema) } },
            description: "Deletion retry requested",
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
        summary: "Retry media deletion",
        tags: ["admin"],
      }),
      validate("param", mediaIdParams),
      async (context) => {
        const retried = await media().retryDeletion({
          actor: await actor(context),
          mediaId: mediaId(context.req.valid("param").mediaId),
        });
        return response(mediaMetadataSchema, mediaDto(retried), 202);
      },
    )
    .on(
      routes.binary.method,
      routes.binary.path,
      describePolicy(routes.binary, {
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
          ...validationFailure(),
        },
        summary: "Read published media",
        tags: ["public"],
      }),
      validate("param", mediaIdParams),
      async (context) => {
        const resolved = await media().resolvePublic({
          mediaId: mediaId(context.req.valid("param").mediaId),
        });
        return resolved === null
          ? notFound()
          : conditionalMediaResponse(
              context.req.raw,
              resolved,
              PUBLIC_MEDIA_CACHE_CONTROL,
              (item) => media().openBinary(item),
            );
      },
    )
    .on(
      routes.preview.method,
      routes.preview.path,
      describePolicy(routes.preview, {
        description:
          "Streams active media to an authenticated reader with the same immutable `ETag` as " +
          "the public route and `Cache-Control: private, no-cache`. A matching `If-None-Match` " +
          "receives `304 Not Modified` after authorization; a malformed one is ignored.",
        responses: {
          200: { description: "Media bytes" },
          304: { description: "The cached media is still valid" },
          404: { description: "Media is not active or does not exist" },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
        summary: "Preview media",
        tags: ["admin"],
      }),
      validate("param", mediaIdParams),
      async (context) => {
        const resolved = await media().resolvePreview({
          actor: await actor(context),
          mediaId: mediaId(context.req.valid("param").mediaId),
        });
        return resolved === null
          ? notFound()
          : conditionalMediaResponse(
              context.req.raw,
              resolved,
              PREVIEW_MEDIA_CACHE_CONTROL,
              (item) => media().openBinary(item),
            );
      },
    )
    .on(
      routes.thumbnail.method,
      routes.thumbnail.path,
      describePolicy(routes.thumbnail, {
        summary: "Read a media thumbnail",
        description:
          "Returns the stored or freshly generated static WebP thumbnail of an active media item to a browser session with content:read, including for unpublished media. " +
          "A matching strong, weak or wildcard If-None-Match returns 304 only for an available thumbnail. Malformed validators are ignored.",
        tags: ["admin"],
        parameters: thumbnailParameters,
        responses: {
          ...thumbnailResponses,
          404: {
            description: "Media is not active or does not exist",
            content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
          },
          ...authenticationFailure(),
          ...authorizationFailure(),
          ...validationFailure(),
        },
      }),
      validate("param", mediaIdParams),
      async (context) => {
        const input = {
          actor: await actor(context),
          mediaId: mediaId(context.req.valid("param").mediaId),
        };
        if (!thumbnails) {
          if ((await media().resolvePreview(input)) === null) return notFound();
          throw new MediaThumbnailUnavailableError("transform");
        }
        const thumbnail = await thumbnails.read(input);
        return thumbnail === null
          ? notFound()
          : conditionalThumbnailResponse(context.req.raw, thumbnail);
      },
    );
}
