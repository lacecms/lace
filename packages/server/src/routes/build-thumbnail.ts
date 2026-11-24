import {
  MediaThumbnailUnavailableError,
  type MediaThumbnails,
  type MediaUseCases,
  type TokenSecurityPort,
} from "@lacecms/application";
import { errorEnvelopeSchema } from "@lacecms/contracts";
import { Hono } from "hono";
import { resolver } from "hono-openapi";
import { v1Routes } from "../routing/v1-routes.js";
import { mediaId } from "../shared/application-input.js";
import { notFound } from "../shared/http.js";
import {
  authenticationFailure,
  describePolicy,
  validate,
  validationFailure,
} from "../shared/openapi.js";
import { mediaIdParams } from "../shared/request.js";
import { requireBuildToken } from "./build-auth.js";
import {
  conditionalThumbnailResponse,
  thumbnailParameters,
  thumbnailResponses,
} from "./media-binary.js";

const route = v1Routes.public.buildThumbnail;

export function createBuildThumbnailRoutes(
  media: MediaUseCases,
  thumbnails: MediaThumbnails | undefined,
  verify: TokenSecurityPort["verifyBuildToken"],
) {
  return new Hono().on(
    route.method,
    route.path,
    describePolicy(route, {
      summary: "Read a published media thumbnail for a site build",
      description:
        "Returns a static WebP thumbnail of media used by a current publication. A matching strong, weak or wildcard If-None-Match returns 304 after build authorization, eligibility and availability checks. Malformed validators are ignored.",
      tags: ["public"],
      parameters: thumbnailParameters,
      responses: {
        ...thumbnailResponses,
        404: {
          description: "Media is not published or does not exist",
          content: { "application/json": { schema: resolver(errorEnvelopeSchema) } },
        },
        ...authenticationFailure(),
        ...validationFailure(),
      },
    }),
    async (context, next) => {
      await requireBuildToken(context.req.header("authorization"), verify);
      await next();
    },
    validate("param", mediaIdParams),
    async (context) => {
      const input = { mediaId: mediaId(context.req.valid("param").mediaId) };
      if (!thumbnails) {
        if ((await media.resolvePublic(input)) === null) return notFound();
        throw new MediaThumbnailUnavailableError("transform");
      }
      const thumbnail = await thumbnails.readPublished(input);
      return thumbnail === null
        ? notFound()
        : conditionalThumbnailResponse(context.req.raw, thumbnail);
    },
  );
}
