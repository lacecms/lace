import type { PreviewStatusDto } from "@lacecms/contracts";
import { useEffect, useState } from "react";

type Preview = NonNullable<PreviewStatusDto>;
type PreviewFailure = NonNullable<Preview["reason"]>;

export const previewStateDescription = {
  preparing: "Preparing preview…",
  dispatched: "Waiting for the preview builder…",
  running: "Building preview…",
  ready: "Preview ready.",
  failed: "Preview failed.",
  timed_out: "Preview timed out.",
  invalidated: "This preview was invalidated.",
  expired: "This preview has expired.",
} satisfies Record<Preview["state"], string>;

export const previewFailureDescription = {
  PREVIEW_CONFIGURATION_UNAVAILABLE: "Ask your Lace administrator to check the preview setup.",
  PREVIEW_INELIGIBLE: "Save a draft with a site route to create a preview.",
  PREVIEW_REVISION_CONFLICT: "The saved draft changed. Reload it before creating a preview.",
  PREVIEW_IDEMPOTENCY_CONFLICT: "This request has already been used. Start a new preview request.",
  PREVIEW_BUSY: "The builder is busy. Try again when it is available.",
  PREVIEW_CONTEXT_CHANGED:
    "The site content changed during preparation. Retry to use the latest content.",
  PREVIEW_VALIDATION_FAILED: "Review the required fields and visible blocks, then save and retry.",
  PREVIEW_SOURCE_UNAVAILABLE: "Ask your site maintainer to check the configured site source.",
  PREVIEW_DEPENDENCY_FAILED: "Ask your site maintainer to check the site's build dependencies.",
  PREVIEW_ROUTE_CONFLICT:
    "Check the saved route and ask your site maintainer to verify that it resolves to a single page.",
  PREVIEW_RENDER_FAILED:
    "The site could not render the preview. Ask your site maintainer to check the build.",
  PREVIEW_STORAGE_FAILED:
    "Preview storage is unavailable. Retry later or ask your Lace administrator to check storage.",
  PREVIEW_RESOURCE_LIMIT:
    "This preview exceeds the resource limits. Check the page's assets with your site maintainer.",
  PREVIEW_PROVIDER_UNAVAILABLE:
    "The preview builder is unavailable. Retry later or ask your Lace administrator to check it.",
  PREVIEW_PROVIDER_QUOTA:
    "The preview provider reached a limit. Retry when quota becomes available.",
  PREVIEW_TIMED_OUT:
    "Retry the saved draft. If previews keep timing out, ask your site maintainer to check the build.",
} satisfies Record<PreviewFailure, string>;

export function isActivePreview(state: Preview["state"] | undefined): boolean {
  return state === "preparing" || state === "dispatched" || state === "running";
}

/** A ready preview's access deadline can pass while the editor is idle. */
export function usePreviewExpired(expiresAt: string | undefined): boolean {
  const [elapsedExpiry, setElapsedExpiry] = useState<string>();
  useEffect(() => {
    if (expiresAt === undefined) return;
    const remaining = Date.parse(expiresAt) - Date.now();
    if (remaining <= 0) return;
    const timer = window.setTimeout(() => setElapsedExpiry(expiresAt), remaining);
    return () => window.clearTimeout(timer);
  }, [expiresAt]);
  return (
    expiresAt !== undefined && (elapsedExpiry === expiresAt || Date.parse(expiresAt) <= Date.now())
  );
}
