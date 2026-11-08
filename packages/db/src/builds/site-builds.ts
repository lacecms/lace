import { failure } from "../shared/failures.js";
import type { SiteBuildRecord, TrackedSiteBuildCheck } from "@lacecms/application";
import {
  normalizeBuildFailure,
  isSiteBuildProviderStage,
  isSiteBuildStatus,
  normalizeTrackedOutcomeReason,
  retryableSiteBuildStatuses,
  siteBuildId,
  unixMilliseconds,
} from "@lacecms/domain";
import type { SiteBuildProviderStage, TrackedSiteBuildOutcome } from "@lacecms/domain";

/** Literal SQL list of closed status values; never built from input. */
function statusListSql(statuses: readonly string[]): string {
  return `(${statuses.map((status) => `'${status}'`).join(", ")})`;
}

/** Statuses an administrator may retry from. */
export const RETRYABLE_SITE_BUILD_STATUS_SQL = statusListSql(retryableSiteBuildStatuses);

/** A claim may (re)start only a queued or orphaned in-progress row. */
export const CLAIMABLE_SITE_BUILD_STATUS_SQL = statusListSql(["pending", "running"]);

export const RETRYABLE_SITE_BUILD_REFUSAL =
  "Only a failed, cancelled, unknown, or accepted build can be retried.";

/** Provider deployment references are bounded opaque identifiers. */
export function assertProviderBuildId(value: string): void {
  if (value.length === 0 || value.length > 200)
    throw new TypeError("Provider build ID is invalid.");
}

/** Stored error for a tracked outcome: only a reason from that outcome's closed vocabulary. */
export function trackedOutcomeError(
  outcome: TrackedSiteBuildOutcome,
  reason: string | undefined,
): string | null {
  return normalizeTrackedOutcomeReason(outcome, reason) ?? null;
}

/** Bounds one tracking-check claim and its lease. */
export function assertTrackingClaim(input: { readonly limit: number; readonly leaseMs: number }) {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 25)
    throw new TypeError("Tracking claim limit is invalid.");
  if (!Number.isSafeInteger(input.leaseMs) || input.leaseMs < 1 || input.leaseMs > 3_600_000)
    throw new TypeError("Tracking lease is invalid.");
}

/** Due tracked builds in next-check order; the tracking start is the event completion. */
export const DUE_TRACKED_SITE_BUILDS_SQL = `select b.id, b.provider_build_id, b.provider_checked_at, b.provider_check_after, e.processed_at
  from site_builds b
  join outbox_events e on e.id = b.id
 where b.status = 'running'
   and b.provider_build_id is not null
   and b.provider_check_after is not null
   and b.provider_check_after <= ?
   and e.processed_at is not null
 order by b.provider_check_after asc, b.id asc
 limit ?`;

export interface DueTrackedSiteBuildRow {
  readonly id: string;
  readonly provider_build_id: string;
  readonly provider_checked_at: number | null;
  readonly provider_check_after: number;
  readonly processed_at: number;
}

/** Leases one selected check: guarded by provider ID, status and the selected due time. */
export const LEASE_TRACKED_SITE_BUILD_SQL =
  "update site_builds set provider_check_after = ? where id = ? and status = 'running' and provider_build_id = ? and provider_check_after = ?";

export function trackedSiteBuildCheck(row: DueTrackedSiteBuildRow): TrackedSiteBuildCheck {
  return Object.freeze({
    buildId: siteBuildId(row.id),
    providerBuildId: row.provider_build_id,
    trackingStartedAt: unixMilliseconds(row.processed_at),
    ...(row.provider_checked_at === null
      ? {}
      : { lastCheckedAt: unixMilliseconds(row.provider_checked_at) }),
  });
}

/** Records a check of a still-running tracked build; the stage variant marks a successful read. */
export function trackedSiteBuildCheckUpdate(input: {
  readonly buildId: string;
  readonly providerBuildId: string;
  readonly now: number;
  readonly checkAfter: number;
  readonly stage?: SiteBuildProviderStage;
}): { readonly sql: string; readonly params: readonly (number | string)[] } {
  if (input.stage !== undefined && !isSiteBuildProviderStage(input.stage))
    throw new TypeError("Provider stage is invalid.");
  return input.stage === undefined
    ? {
        params: [input.checkAfter, input.buildId, input.providerBuildId],
        sql: "update site_builds set provider_check_after = ? where id = ? and status = 'running' and provider_build_id = ?",
      }
    : {
        params: [input.checkAfter, input.stage, input.now, input.buildId, input.providerBuildId],
        sql: "update site_builds set provider_check_after = ?, provider_stage = ?, provider_checked_at = ? where id = ? and status = 'running' and provider_build_id = ?",
      };
}

/** Columns a tracked completion writes; a stage also records the last successful check. */
export function trackedCompletionStage(
  stage: SiteBuildProviderStage | undefined,
  now: number,
): readonly [string | null, number | null] {
  if (stage !== undefined && !isSiteBuildProviderStage(stage))
    throw new TypeError("Provider stage is invalid.");
  return stage === undefined ? [null, null] : [stage, now];
}

export interface SiteBuildRow {
  readonly id: string;
  readonly reason: string;
  readonly status: SiteBuildRecord["status"];
  readonly target_version: number;
  readonly requested_by: string;
  readonly requested_at: number;
  readonly started_at: number | null;
  readonly completed_at: number | null;
  readonly provider_build_id: string | null;
  readonly error: string | null;
  readonly provider_stage?: string | null;
  readonly provider_checked_at?: number | null;
  readonly provider_check_after?: number | null;
}

export function siteBuildRecord(row: SiteBuildRow): SiteBuildRecord {
  if (!isSiteBuildStatus(row.status)) failure("Stored build status is invalid.");
  return {
    id: siteBuildId(row.id),
    reason: row.reason,
    status: row.status,
    targetVersion: row.target_version,
    requestedBy: row.requested_by,
    requestedAt: unixMilliseconds(row.requested_at),
    ...(row.started_at === null ? {} : { startedAt: unixMilliseconds(row.started_at) }),
    ...(row.completed_at === null ? {} : { completedAt: unixMilliseconds(row.completed_at) }),
    ...(row.provider_build_id === null ? {} : { providerBuildId: row.provider_build_id }),
    ...(isSiteBuildProviderStage(row.provider_stage) ? { providerStage: row.provider_stage } : {}),
    ...(row.provider_checked_at === null || row.provider_checked_at === undefined
      ? {}
      : { providerCheckedAt: unixMilliseconds(row.provider_checked_at) }),
    ...(row.error === null ? {} : buildErrorRecord(row.error)),
  };
}

export function sanitizeDispatchError(value: string): string {
  return (
    value
      .replace(/[\r\n\t]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim()
      .slice(0, 160) || "storage_unavailable"
  );
}

export function sanitizeBuildReason(value: string): string {
  return normalizeBuildFailure(value).reason;
}

export function encodeBuildError(reason: string, path?: string): string {
  const failure = normalizeBuildFailure(reason, path);
  return failure.path === undefined ? failure.reason : JSON.stringify(failure);
}

export function buildErrorRecord(value: string): { error: string; errorPath?: string } {
  let failure = normalizeBuildFailure(value);
  if (value.startsWith("{") && value.length <= 1024) {
    try {
      const record: unknown = JSON.parse(value);
      if (record !== null && typeof record === "object" && !Array.isArray(record)) {
        const item = record as Record<string, unknown>;
        if (
          Object.keys(item).every((key) => key === "reason" || key === "path") &&
          typeof item.reason === "string" &&
          (item.path === undefined || typeof item.path === "string")
        )
          failure = normalizeBuildFailure(item.reason, item.path);
      }
    } catch {
      /* malformed stored data never reaches transport */
    }
  }
  return {
    error: failure.reason,
    ...(failure.path === undefined ? {} : { errorPath: failure.path }),
  };
}
