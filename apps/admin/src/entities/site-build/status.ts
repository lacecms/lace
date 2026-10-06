import { siteBuildStatusSchema, type SiteBuildRecordDto } from "@lacecms/contracts";

export type SiteBuildStatus = SiteBuildRecordDto["status"];

export interface SiteBuildStatusGuidance {
  readonly badge: "destructive" | "secondary" | "success" | "warning" | "outline";
  readonly label: string;
  /** A few words for compact summaries such as the tour. */
  readonly short: string;
  readonly meaning: string;
  readonly proof: string;
  readonly next: string;
}

/** Lifecycle order of the closed status vocabulary from the shared contract. */
export const siteBuildStatuses: readonly SiteBuildStatus[] = siteBuildStatusSchema.options;

/**
 * The single source of status explanations shown in Builds, the entry
 * publication details and the tour. Only `succeeded` claims publication.
 */
export const siteBuildStatusGuidance: Readonly<Record<SiteBuildStatus, SiteBuildStatusGuidance>> = {
  pending: {
    badge: "secondary",
    label: "Pending",
    short: "queued or waiting for a retry",
    meaning: "Queued: waiting for the debounce window, a dispatcher, or an automatic retry.",
    proof: "The public site has not been changed by this build yet.",
    next: "Wait. If a failure reason is shown, apply its correction before the automatic retry.",
  },
  running: {
    badge: "warning",
    label: "Running",
    short: "building, or tracking a provider deployment",
    meaning:
      "Lace is running this build, or tracking the provider deployment it started until a final result or the tracking deadline.",
    proof: "Not yet confirmed: the public site may still serve the previous release.",
    next: "Wait for a final status. Build details show the provider stage and last check.",
  },
  accepted: {
    badge: "outline",
    label: "Accepted",
    short: "a provider accepted the request; its outcome is not tracked",
    meaning: "The deployment provider accepted the build request. Lace does not track its outcome.",
    proof: "Nothing: Lace has not confirmed that the public site changed.",
    next: "Check the deployment in your provider. If it failed or never ran, retry the build.",
  },
  succeeded: {
    badge: "success",
    label: "Succeeded",
    short: "published",
    meaning: "The build finished and its release was published.",
    proof: "The public site serves content for this target version.",
    next: "No action needed.",
  },
  failed: {
    badge: "destructive",
    label: "Failed",
    short: "failed with a recorded reason",
    meaning: "The build failed with a recorded reason.",
    proof: "This build did not update the public site; the previous release stays served.",
    next: "Apply the correction shown in the build details, then retry the build.",
  },
  cancelled: {
    badge: "secondary",
    label: "Cancelled",
    short: "cancelled or skipped by the provider",
    meaning: "The provider cancelled or skipped this deployment.",
    proof: "This build did not update the public site.",
    next: "Check the provider's build settings, then retry the build.",
  },
  unknown: {
    badge: "outline",
    label: "Unknown",
    short: "tracking stopped without proof",
    meaning: "Lace stopped tracking this deployment without proof of its outcome.",
    proof: "Unknown: the public site may or may not have changed.",
    next: "Check the deployment in your provider, then retry the build if needed.",
  },
};

const terminal = new Set<SiteBuildStatus>([
  "accepted",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
]);
const retryable = new Set<SiteBuildStatus>(["failed", "cancelled", "unknown", "accepted"]);

export function isTerminalBuildStatus(status: SiteBuildStatus): boolean {
  return terminal.has(status);
}

/** Administrators may retry these terminal statuses; retry queues a new build. */
export function isRetryableBuildStatus(status: SiteBuildStatus): boolean {
  return retryable.has(status);
}

/** Tour wording derived from the same map as the status popovers. */
export function buildStatusTourSummary(): string {
  const statuses = siteBuildStatuses
    .map(
      (status) =>
        `${siteBuildStatusGuidance[status].label} (${siteBuildStatusGuidance[status].short})`,
    )
    .join(", ");
  return `Inspect recorded site builds and their target versions. A build is ${statuses}. Only Succeeded proves the site was published; provider acceptance does not. Each status has an info button with its meaning and next step. One build can cover several publications. Failure details explain problems without changing the published content, and the previous release stays served.`;
}
