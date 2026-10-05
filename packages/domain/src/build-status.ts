/**
 * The closed site-build lifecycle. Only `succeeded` proves the site was
 * published; provider acceptance without tracking is `accepted`.
 */
export const siteBuildStatuses = [
  "pending",
  "running",
  "accepted",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
] as const;
export type SiteBuildStatus = (typeof siteBuildStatuses)[number];

/** Terminal rows are never reopened, including by late provider results. */
export const terminalSiteBuildStatuses = [
  "accepted",
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
] as const satisfies readonly SiteBuildStatus[];

/** Statuses an administrator may retry; retry always creates a new request. */
export const retryableSiteBuildStatuses = [
  "failed",
  "cancelled",
  "unknown",
  "accepted",
] as const satisfies readonly SiteBuildStatus[];

/** Outcomes that may end a tracked provider deployment. */
export const trackedSiteBuildOutcomes = [
  "succeeded",
  "failed",
  "cancelled",
  "unknown",
] as const satisfies readonly SiteBuildStatus[];
export type TrackedSiteBuildOutcome = (typeof trackedSiteBuildOutcomes)[number];

export function isSiteBuildStatus(value: unknown): value is SiteBuildStatus {
  return (siteBuildStatuses as readonly unknown[]).includes(value);
}

export function isTerminalSiteBuildStatus(status: SiteBuildStatus): boolean {
  return (terminalSiteBuildStatuses as readonly SiteBuildStatus[]).includes(status);
}

export function isRetryableSiteBuildStatus(status: SiteBuildStatus): boolean {
  return (retryableSiteBuildStatuses as readonly SiteBuildStatus[]).includes(status);
}
