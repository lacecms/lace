import { SITE_BUILD_REQUESTED } from "@lacecms/contracts/outbox";
import {
  DISPATCHER_LEASE_DURATION_MS,
  MAX_SITE_BUILD_CLAIMS_PER_CALL,
  dispatcherEventId,
  dispatcherLeaseId,
} from "@lacecms/application";
import type { SiteBuildWorkLease } from "@lacecms/application";
import { MAX_PAGE_SIZE } from "@lacecms/content";
import { siteBuildId, unixMilliseconds } from "@lacecms/domain";
import type { OutboxRow } from "../shared/outbox-row.js";
import { outboxCandidateGuard } from "../write-plan/outbox-candidate.js";
import type { WritePlanGroup, WritePlanSql, WritePlanStatement } from "../write-plan/plan.js";
import { CLAIMABLE_SITE_BUILD_STATUS_SQL } from "./site-builds.js";
import { siteBuildPayload } from "./requests.js";

export function siteBuildCandidates(input: {
  readonly now: number;
  readonly limit: number;
}): WritePlanSql {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > MAX_PAGE_SIZE)
    throw new TypeError("Build claim limit is invalid.");
  return {
    sql: "select id, type, payload_json, attempts, available_at from outbox_events where type = ? and processed_at is null and available_at <= ? and (locked_at is null or locked_at <= ?) order by available_at asc, id asc limit ?",
    params: [
      SITE_BUILD_REQUESTED,
      input.now,
      input.now - DISPATCHER_LEASE_DURATION_MS,
      Math.min(input.limit, MAX_SITE_BUILD_CLAIMS_PER_CALL),
    ],
  };
}

type BuildCandidate = {
  readonly claim: number;
  readonly started?: number;
  readonly lease?: SiteBuildWorkLease;
};
export function siteBuildClaimPlan(
  rows: readonly OutboxRow[],
  leaseIds: readonly string[],
  now: number,
): { readonly plan: WritePlanGroup; readonly candidates: readonly BuildCandidate[] } {
  const statements: WritePlanStatement[] = [];
  const candidates = rows.map((row, index): BuildCandidate => {
    const leaseId = dispatcherLeaseId(leaseIds[index]!);
    const payload = siteBuildPayload(row.payload_json);
    const claim = statements.length;
    const guard = outboxCandidateGuard(row, now);
    statements.push({
      sql: `update outbox_events set locked_at = ?, locked_by = ? where ${guard.sql}`,
      params: [now, leaseId, ...guard.params],
    });
    if (payload === null) {
      statements.push({
        sql: "update outbox_events set attempts = attempts + 1, processed_at = ?, locked_at = null, locked_by = null, last_error = 'invalid_build_event' where id = ? and locked_by = ? and changes() = 1",
        params: [now, row.id, leaseId],
      });
      return { claim };
    }
    statements.push({
      sql: "insert or ignore into site_builds (id, reason, status, target_version, published_snapshot_id, requested_by, requested_at, started_at) select ?, ?, 'running', ?, (select id from content_snapshots where id = ?), ?, ?, ? where exists (select 1 from outbox_events where id = ? and locked_by = ?)",
      params: [
        row.id,
        payload.reason,
        payload.targetVersion,
        payload.publishedSnapshotId ?? null,
        payload.requestedBy,
        payload.requestedAt,
        now,
        row.id,
        leaseId,
      ],
    });
    const started = statements.length;
    statements.push({
      sql: `update site_builds set status = 'running', started_at = coalesce(started_at, ?) where id = ? and status in ${CLAIMABLE_SITE_BUILD_STATUS_SQL} and exists (select 1 from outbox_events where id = ? and locked_by = ?)`,
      params: [now, row.id, row.id, leaseId],
    });
    statements.push({
      sql: `update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ? and locked_by = ? and exists (select 1 from site_builds where id = ? and status not in ${CLAIMABLE_SITE_BUILD_STATUS_SQL})`,
      params: [now, row.id, leaseId, row.id],
    });
    return {
      claim,
      started,
      lease: Object.freeze({
        buildId: siteBuildId(row.id),
        event: Object.freeze({
          attempts: row.attempts,
          availableAt: unixMilliseconds(row.available_at),
          id: dispatcherEventId(row.id),
          payload,
          type: SITE_BUILD_REQUESTED,
        }),
        expiresAt: unixMilliseconds(now + DISPATCHER_LEASE_DURATION_MS),
        id: leaseId,
        targetVersion: payload.targetVersion,
      }),
    };
  });
  return { plan: { statements }, candidates };
}

export function claimedSiteBuilds(
  candidates: readonly BuildCandidate[],
  changes: readonly number[],
): readonly SiteBuildWorkLease[] {
  return Object.freeze(
    candidates.flatMap((candidate) =>
      candidate.lease !== undefined &&
      candidate.started !== undefined &&
      changes[candidate.claim] === 1 &&
      changes[candidate.started] === 1
        ? [candidate.lease]
        : [],
    ),
  );
}
