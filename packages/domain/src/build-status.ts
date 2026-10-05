import type { SiteBuildFailureReason } from "./build-diagnostics.js";

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

/** Closed reasons each tracked outcome may store; `succeeded` stores none. */
export const trackedOutcomeReasons = {
  succeeded: [],
  failed: ["provider_build_failed", "provider_deploy_failed", "provider_failed"],
  cancelled: ["provider_cancelled", "provider_skipped"],
  unknown: [
    "tracking_forbidden",
    "tracking_not_found",
    "tracking_rejected",
    "tracking_timeout",
    "tracking_unconfigured",
  ],
} as const satisfies Readonly<Record<TrackedSiteBuildOutcome, readonly SiteBuildFailureReason[]>>;

/**
 * The reason stored for a tracked outcome: an allowed reason is kept, any
 * other `failed` reason becomes `provider_failed`, and foreign reasons for the
 * other outcomes are dropped.
 */
export function normalizeTrackedOutcomeReason(
  outcome: TrackedSiteBuildOutcome,
  reason: unknown,
): SiteBuildFailureReason | undefined {
  const allowed: readonly SiteBuildFailureReason[] = trackedOutcomeReasons[outcome];
  const known = allowed.find((candidate) => candidate === reason);
  if (known !== undefined) return known;
  return outcome === "failed" ? "provider_failed" : undefined;
}

/** Closed provider deployment stages recorded while a build is tracked. */
export const siteBuildProviderStages = [
  "queued",
  "initialize",
  "clone_repo",
  "build",
  "deploy",
] as const;
export type SiteBuildProviderStage = (typeof siteBuildProviderStages)[number];

export function isSiteBuildProviderStage(value: unknown): value is SiteBuildProviderStage {
  return (siteBuildProviderStages as readonly unknown[]).includes(value);
}

/** Provider tracking policy shared by every runtime and documented in §9.8. */
export const siteBuildTrackingPolicy = Object.freeze({
  /** Next check after an in-progress observation; below the one-minute cron. */
  pollIntervalMs: 30_000,
  /** Exclusive claim of one check; an unfinished check is due again afterwards. */
  checkLeaseMs: 60_000,
  /** Upper bound of the transient-failure backoff. */
  maxBackoffMs: 600_000,
  /** A deployment may not be readable immediately after the hook accepted it. */
  notFoundGraceMs: 300_000,
  defaultTimeoutMinutes: 60,
  minTimeoutMinutes: 5,
  maxTimeoutMinutes: 1440,
});
