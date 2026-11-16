import {
  MEDIA_DELETE_REQUESTED,
  SITE_BUILD_REQUESTED,
  outboxEvents,
} from "@lacecms/contracts/outbox";
import {
  DISPATCHER_LEASE_DURATION_MS,
  MAX_DISPATCHER_CLAIMS_PER_CALL,
  dispatcherEventId,
  dispatcherLeaseId,
} from "@lacecms/application";
import type {
  ClaimDispatcherEventsInput,
  CompleteDispatcherLeaseInput,
  DispatcherLease,
  RetryDispatcherLeaseInput,
} from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import { sanitizeDispatchError } from "../shared/dispatch-error.js";
import { failure } from "../shared/failures.js";
import { SQL_MAX_PAGE_SIZE } from "../shared/limits.js";
import { assertNonNegativeInteger, assertTimestamp, parseObject } from "../shared/values.js";
import { outboxCandidateGuard } from "../write-plan/outbox-candidate.js";
import type { WritePlanGroup, WritePlanSql, WritePlanStatement } from "../write-plan/plan.js";
import type { OutboxRow } from "../shared/outbox-row.js";

export function dispatcherCandidates(input: ClaimDispatcherEventsInput): WritePlanSql {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > SQL_MAX_PAGE_SIZE)
    failure("Dispatcher claim limit is invalid.");
  if (input.eventTypes.length === 0 || input.eventTypes.some((type) => type.length === 0))
    failure("Dispatcher event types are invalid.");
  return {
    sql: `select id, type, payload_json, attempts, available_at from outbox_events where processed_at is null and type in (${input.eventTypes.map(() => "?").join(", ")}) and available_at <= ? and (locked_at is null or locked_at <= ?) order by available_at asc, id asc limit ?`,
    params: [
      ...input.eventTypes,
      input.now,
      input.now - DISPATCHER_LEASE_DURATION_MS,
      Math.min(input.limit, MAX_DISPATCHER_CLAIMS_PER_CALL),
    ],
  };
}

export function dispatcherClaimPlan(
  rows: readonly OutboxRow[],
  leaseIds: readonly string[],
  now: number,
): { plan: WritePlanGroup; leases: readonly DispatcherLease[]; claimIndices: readonly number[] } {
  const leases: DispatcherLease[] = [];
  const claimIndices: number[] = [];
  const statements = rows.map((row, index): WritePlanStatement => {
    const guard = outboxCandidateGuard(row, now);
    const type = row.type;
    const payload =
      type === MEDIA_DELETE_REQUESTED || type === SITE_BUILD_REQUESTED
        ? outboxEvents[type].decodeJson(row.payload_json)
        : parseObject(row.payload_json, "Outbox payload");
    if (payload === null) {
      const reason =
        type === MEDIA_DELETE_REQUESTED ? "invalid_media_deletion_event" : "invalid_build_event";
      return {
        sql: `update outbox_events set attempts = attempts + 1, processed_at = ?, locked_at = null, locked_by = null, last_error = ? where ${guard.sql}`,
        params: [now, reason, ...guard.params],
      };
    }

    const leaseId = dispatcherLeaseId(leaseIds[index]!);
    claimIndices.push(index);
    leases.push(
      Object.freeze({
        event: Object.freeze({
          attempts: assertNonNegativeInteger(row.attempts, "Outbox attempts"),
          availableAt: unixMilliseconds(assertTimestamp(row.available_at, "Outbox availability")),
          id: dispatcherEventId(row.id),
          payload,
          type,
        }),
        expiresAt: unixMilliseconds(now + DISPATCHER_LEASE_DURATION_MS),
        id: leaseId,
      }),
    );
    return {
      sql: `update outbox_events set locked_at = ?, locked_by = ? where ${guard.sql}`,
      params: [now, leaseId, ...guard.params],
    };
  });
  return { leases, claimIndices, plan: { statements } };
}

export function completeDispatcherPlan(input: CompleteDispatcherLeaseInput): WritePlanGroup {
  return {
    statements: [
      {
        sql: "update outbox_events set processed_at = ?, locked_at = null, locked_by = null where locked_by = ? and processed_at is null and locked_at > ?",
        params: [
          input.completedAt,
          input.leaseId,
          input.completedAt - DISPATCHER_LEASE_DURATION_MS,
        ],
      },
    ],
  };
}

export function retryDispatcherPlan(input: RetryDispatcherLeaseInput): WritePlanGroup {
  return {
    statements: [
      {
        sql: "update outbox_events set attempts = attempts + 1, available_at = ?, locked_at = null, locked_by = null, last_error = ? where locked_by = ? and processed_at is null and locked_at > ?",
        params: [
          input.retryAt ?? input.failedAt,
          sanitizeDispatchError(input.error),
          input.leaseId,
          input.failedAt - DISPATCHER_LEASE_DURATION_MS,
        ],
      },
    ],
  };
}
