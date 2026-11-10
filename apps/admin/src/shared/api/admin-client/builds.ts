import {
  buildSiteSelectionSchema,
  buildQueueReceiptSchema,
  siteBuildRecordSchema,
  siteBuildListSchema,
} from "@lacecms/contracts";
import { request, parse, type Fetcher } from "../admin-transport.js";

export function buildsClient(fetcher: Fetcher) {
  return {
    loadBuildSite: async () =>
      parse(buildSiteSelectionSchema, await request(fetcher, "/api/v1/admin/build-site")),
    listBuilds: async () =>
      parse(siteBuildListSchema, await request(fetcher, "/api/v1/admin/site-builds")),
    getBuild: async (buildId: string) =>
      parse(
        siteBuildRecordSchema,
        await request(fetcher, `/api/v1/admin/site-builds/${encodeURIComponent(buildId)}`),
      ),
    requestBuild: async () =>
      parse(
        buildQueueReceiptSchema,
        await request(fetcher, "/api/v1/admin/builds", { method: "POST" }),
      ),
    retryBuild: async (buildId: string) =>
      parse(
        buildQueueReceiptSchema,
        await request(fetcher, `/api/v1/admin/builds/${encodeURIComponent(buildId)}/retry`, {
          method: "POST",
        }),
      ),
  };
}
