import {
  canonicalCollectionFilters,
  adminContentEntrySchema,
  contentEntryListSchema,
  contentModelListSchema,
  publishContentEntryResultSchema,
  unpublishContentEntryResultSchema,
  type ContentBlockDto,
  type SeoInputDto,
} from "@lacecms/contracts";
import {
  linkTargetPageSchema,
  linkTargetStatusesSchema,
  linkImpactPageSchema,
  type LinkImpactAcknowledgmentDto,
} from "@lacecms/contracts";
import { request, postJson, parse, type Fetcher } from "../admin-transport.js";
import type { AdminClient, EntryListQuery } from "../admin-client-types.js";

export function contentClient(fetcher: Fetcher) {
  return {
    createEntry: async (modelKey: string, title: string, slug?: string) =>
      parse(
        adminContentEntrySchema,
        await request(fetcher, `/api/v1/admin/models/${encodeURIComponent(modelKey)}/entries`, {
          body: JSON.stringify({
            blocks: [],
            fields: {},
            title,
            ...(slug === undefined || slug === "" ? {} : { slug }),
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
        }),
      ),
    listLinkTargets: async (
      query: Parameters<AdminClient["listLinkTargets"]>[0],
      signal?: AbortSignal,
    ) => {
      const search = new URLSearchParams(
        Object.entries(query)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      );
      return parse(
        linkTargetPageSchema,
        await request(fetcher, `/api/v1/admin/link-targets?${search}`, signal ? { signal } : {}),
      );
    },
    resolveLinkTargets: async (ids: readonly string[], signal?: AbortSignal) =>
      parse(
        linkTargetStatusesSchema,
        await request(fetcher, "/api/v1/admin/link-targets/resolve", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids }),
          ...(signal === undefined ? {} : { signal }),
        }),
      ),
    linkImpact: async (
      entryId: string,
      query: Parameters<AdminClient["linkImpact"]>[1],
      signal?: AbortSignal,
    ) => {
      const search = new URLSearchParams(
        Object.entries(query)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => [key, String(value)]),
      );
      return parse(
        linkImpactPageSchema,
        await request(
          fetcher,
          `/api/v1/admin/entries/${encodeURIComponent(entryId)}/link-impact?${search}`,
          signal === undefined ? {} : { signal },
        ),
      );
    },
    deleteEntry: async (
      entryId: string,
      expectedRevision: number,
      linkImpact?: LinkImpactAcknowledgmentDto,
    ) => {
      await request(fetcher, `/api/v1/admin/entries/${encodeURIComponent(entryId)}`, {
        body: JSON.stringify({
          expectedRevision,
          ...(linkImpact === undefined ? {} : { linkImpact }),
        }),
        headers: { "content-type": "application/json" },
        method: "DELETE",
      });
    },
    loadEntry: async (entryId: string) =>
      parse(
        adminContentEntrySchema,
        await request(fetcher, `/api/v1/admin/entries/${encodeURIComponent(entryId)}`),
      ),
    listEntries: async (modelKey: string, cursor?: string, query: EntryListQuery = {}) => {
      const search = new URLSearchParams();
      if (cursor !== undefined) search.set("after", cursor);
      if (query.q !== undefined && query.q.trim().length > 0) search.set("q", query.q.trim());
      if (query.status !== undefined) search.set("status", query.status);
      if (query.sort !== undefined) search.set("sort", query.sort);
      if (query.limit !== undefined) search.set("limit", String(query.limit));
      if (query.filters?.length)
        search.set("filters", JSON.stringify(canonicalCollectionFilters(query.filters)));
      const suffix = search.size === 0 ? "" : `?${search.toString()}`;
      return parse(
        contentEntryListSchema,
        await request(
          fetcher,
          `/api/v1/admin/models/${encodeURIComponent(modelKey)}/entries${suffix}`,
        ),
      );
    },
    listModels: async () =>
      parse(contentModelListSchema, await request(fetcher, "/api/v1/admin/content-models")),
    unpublishEntry: async (entryId: string, input: Parameters<AdminClient["unpublishEntry"]>[1]) =>
      parse(
        unpublishContentEntryResultSchema,
        await request(fetcher, `/api/v1/admin/entries/${encodeURIComponent(entryId)}/unpublish`, {
          body: JSON.stringify({
            expectedPublishedSnapshotId: input.expectedPublishedSnapshotId,
            ...(input.linkImpact === undefined ? {} : { linkImpact: input.linkImpact }),
          }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": input.idempotencyKey,
          },
          method: "POST",
        }),
      ),
    revertEntry: async (entryId: string, expectedRevision: number) =>
      parse(
        adminContentEntrySchema,
        await postJson(fetcher, `/api/v1/admin/entries/${encodeURIComponent(entryId)}/revert`, {
          expectedRevision,
        }),
      ),
    duplicateEntry: async (entryId: string, expectedRevision: number) =>
      parse(
        adminContentEntrySchema,
        await postJson(fetcher, `/api/v1/admin/entries/${encodeURIComponent(entryId)}/duplicate`, {
          expectedRevision,
        }),
      ),
    publishEntry: async (
      entryId: string,
      input: { readonly expectedRevision: number; readonly idempotencyKey: string },
    ) =>
      parse(
        publishContentEntryResultSchema,
        await request(fetcher, `/api/v1/admin/entries/${encodeURIComponent(entryId)}/publish`, {
          body: JSON.stringify({ expectedRevision: input.expectedRevision }),
          headers: {
            "content-type": "application/json",
            "idempotency-key": input.idempotencyKey,
          },
          method: "POST",
        }),
      ),
    saveDraft: async (
      entryId: string,
      input: {
        readonly blocks: readonly ContentBlockDto[];
        readonly expectedRevision: number;
        readonly fields: Record<string, unknown>;
        readonly seo?: SeoInputDto;
        readonly slug?: string;
        readonly title: string;
      },
    ) =>
      parse(
        adminContentEntrySchema,
        await request(fetcher, `/api/v1/admin/entries/${encodeURIComponent(entryId)}/draft`, {
          body: JSON.stringify(input),
          headers: { "content-type": "application/json" },
          method: "PUT",
        }),
      ),
  };
}
