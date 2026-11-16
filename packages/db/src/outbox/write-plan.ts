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
import type { WritePlanGroup, WritePlanSql } from "../write-plan/plan.js";
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
): { plan: WritePlanGroup; leases: readonly DispatcherLease[] } {
  const leases = rows.map((row, index) =>
    Object.freeze({
      event: Object.freeze({
        attempts: assertNonNegativeInteger(row.attempts, "Outbox attempts"),
        availableAt: unixMilliseconds(assertTimestamp(row.available_at, "Outbox availability")),
        id: dispatcherEventId(row.id),
        payload: parseObject(row.payload_json, "Outbox payload"),
        type: row.type,
      }),
      expiresAt: unixMilliseconds(now + DISPATCHER_LEASE_DURATION_MS),
      id: dispatcherLeaseId(leaseIds[index]!),
    }),
  );
  return {
    leases,
    plan: {
      statements: rows.map((row, index) => ({
        sql: "update outbox_events set locked_at = ?, locked_by = ? where id = ? and payload_json = ? and processed_at is null and available_at <= ? and (locked_at is null or locked_at <= ?)",
        params: [
          now,
          leaseIds[index],
          row.id,
          row.payload_json,
          now,
          now - DISPATCHER_LEASE_DURATION_MS,
        ],
      })),
    },
  };
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
