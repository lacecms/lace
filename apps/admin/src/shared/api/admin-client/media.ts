import {
  mediaDetailSchema,
  mediaListSchema,
  mediaMetadataSchema,
  mediaTagCatalogSchema,
  updateMediaMetadataResultSchema,
  entityTagForVersion,
  type UpdateMediaMetadataRequestDto,
} from "@lacecms/contracts";
import {
  responseError,
  request,
  parse,
  type Fetcher,
  type MediaUploader,
  type MediaUploadOptions,
} from "../admin-transport.js";
import type { MediaListQuery } from "../admin-client-types.js";

export function mediaClient(fetcher: Fetcher, upload: MediaUploader) {
  return {
    listMediaTags: async (query: { q?: string; after?: string; limit?: number } = {}) => {
      const search = new URLSearchParams();
      if (query.q !== undefined) search.set("q", query.q);
      if (query.after !== undefined) search.set("after", query.after);
      if (query.limit !== undefined) search.set("limit", String(query.limit));
      return parse(
        mediaTagCatalogSchema,
        await request(
          fetcher,
          `/api/v1/admin/media/tags${search.size ? "?" + search.toString() : ""}`,
        ),
      );
    },
    listMedia: async (cursor?: string, query: MediaListQuery = {}) => {
      const search = new URLSearchParams();
      if (cursor !== undefined) search.set("after", cursor);
      if (query.q !== undefined && query.q.trim().length > 0) search.set("q", query.q.trim());
      for (const tag of query.tags ?? []) search.append("tag", tag);
      if (query.type !== undefined) search.set("type", query.type);
      if (query.sort !== undefined) search.set("sort", query.sort);
      if (query.limit !== undefined) search.set("limit", String(query.limit));
      const suffix = search.size === 0 ? "" : `?${search.toString()}`;
      return parse(mediaListSchema, await request(fetcher, `/api/v1/admin/media${suffix}`));
    },
    getMedia: async (mediaId: string) =>
      parse(
        mediaDetailSchema,
        await request(fetcher, `/api/v1/admin/media/${encodeURIComponent(mediaId)}`),
      ),
    uploadMedia: async (file: File, options: MediaUploadOptions = {}) => {
      const body = new FormData();
      body.append("file", file);
      for (const tag of options.tags ?? []) body.append("tags", tag);
      const exchange = await upload("/api/v1/admin/media", body, options);
      if (exchange.status < 200 || exchange.status >= 300)
        throw responseError(exchange.status, exchange.requestId, exchange.body);
      return parse(mediaMetadataSchema, exchange.body);
    },
    deleteMedia: async (mediaId: string, options: { readonly detachDrafts?: boolean } = {}) =>
      parse(
        mediaMetadataSchema,
        await request(
          fetcher,
          `/api/v1/admin/media/${encodeURIComponent(mediaId)}${
            options.detachDrafts === true ? "?detach=drafts" : ""
          }`,
          { method: "DELETE" },
        ),
      ),
    retryMediaDeletion: async (mediaId: string) =>
      parse(
        mediaMetadataSchema,
        await request(
          fetcher,
          `/api/v1/admin/media/${encodeURIComponent(mediaId)}/retry-deletion`,
          {
            method: "POST",
          },
        ),
      ),
    updateMediaMetadata: async (
      mediaId: string,
      patch: UpdateMediaMetadataRequestDto,
      expectedUpdatedAt: string,
    ) =>
      parse(
        updateMediaMetadataResultSchema,
        await request(fetcher, `/api/v1/admin/media/${encodeURIComponent(mediaId)}`, {
          body: JSON.stringify(patch),
          headers: {
            "content-type": "application/json",
            "if-match": entityTagForVersion(Date.parse(expectedUpdatedAt)),
          },
          method: "PATCH",
        }),
      ),
  };
}
