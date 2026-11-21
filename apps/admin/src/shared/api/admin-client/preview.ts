import {
  createPreviewRequestSchema,
  previewReadinessSchema,
  previewReceiptSchema,
  previewStatusSchema,
} from "@lacecms/contracts";
import { parse, postJson, request, type Fetcher } from "../admin-transport.js";

export function previewClient(fetcher: Fetcher) {
  return {
    loadPreviewConfig: async () =>
      parse(previewReadinessSchema, await request(fetcher, "/api/v1/admin/preview/config")),
    loadPreviewStatus: async (entryId: string, signal?: AbortSignal) =>
      parse(
        previewStatusSchema,
        await request(
          fetcher,
          `/api/v1/admin/entries/${encodeURIComponent(entryId)}/preview`,
          signal === undefined ? {} : { signal },
        ),
      ),
    createPreview: async (
      entryId: string,
      input: { expectedRevision: number; idempotencyKey: string },
    ) =>
      parse(
        previewReceiptSchema,
        await postJson(
          fetcher,
          `/api/v1/admin/entries/${encodeURIComponent(entryId)}/preview`,
          parse(createPreviewRequestSchema, input),
        ),
      ),
  };
}
