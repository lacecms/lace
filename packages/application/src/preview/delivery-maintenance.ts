import type { UnixMilliseconds } from "@lacecms/domain";
import type { PreviewBlobStorage } from "../ports/preview-storage.js";
import type { PreviewInputStore } from "../ports/preview.js";
import { previewGenerationKey } from "./manifest.js";
import { maintainPreviews } from "./maintenance.js";
import type { PreviewMaintenanceDependencies } from "./maintenance.js";

export function previewNamespaceCleanup(
  blobs: PreviewBlobStorage,
): Pick<PreviewInputStore, "purge"> {
  return {
    async purge(id, scope, limit) {
      const prefix = previewGenerationKey(id) + (scope === "input" ? "input/" : "");
      const page = await blobs.list(prefix, limit);
      const keys = page.objects.map(({ key }) => key);
      if (keys.length > limit || keys.some((key) => !key.startsWith(prefix)))
        throw new Error("Invalid preview storage listing.");
      await blobs.delete(keys);
      return page.cursor === undefined ? "empty" : "more";
    },
  };
}

export async function maintainPreviewDelivery(
  deps: Omit<PreviewMaintenanceDependencies, "store"> & {
    readonly blobs: PreviewBlobStorage;
    readonly purgeExpiredAccess: (now: UnixMilliseconds, limit: number) => Promise<void>;
  },
): Promise<number> {
  let failures = 0;
  try {
    await deps.purgeExpiredAccess(deps.clock.now(), 16);
  } catch {
    failures++;
  }
  const report = await maintainPreviews({ ...deps, store: previewNamespaceCleanup(deps.blobs) });
  return failures + report.failures;
}
