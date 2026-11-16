import { MEDIA_DELETE_REQUESTED } from "@lacecms/contracts/outbox";
import { DISPATCHER_LEASE_DURATION_MS } from "@lacecms/application";
import type { MarkMediaForDeletionInput } from "@lacecms/application";
import { sanitizeDispatchError } from "../shared/dispatch-error.js";
import { bindEventRequest, enqueueEvents } from "../write-plan/enqueue-events.js";
import type { WritePlan, WritePlanGroup } from "../write-plan/plan.js";

export type MediaDeletionMiss = "in-use" | "ineligible" | "lease" | "mismatch" | "media";

export function requestMediaDeletionWritePlan(
  input: MarkMediaForDeletionInput,
  eventIds: readonly string[],
  retry: boolean,
): WritePlan<MediaDeletionMiss> {
  const status = retry ? "delete_failed" : "active";
  return {
    admission: {
      sql: "exists (select 1 from media m where m.id = ? and m.status = ? and not exists (select 1 from content_media_references r where r.media_id = m.id))",
      params: [input.mediaId, status],
    },
    diagnostics: {
      media: {
        sql: "select status, exists(select 1 from content_media_references where media_id = ?) as referenced from media where id = ?",
        params: [input.mediaId, input.mediaId],
      },
    },
    diagnose: (rows) => {
      const row = rows.media?.[0] as { status: string; referenced: number } | undefined;
      return row?.status === status && row.referenced === 1 ? "in-use" : "ineligible";
    },
    statements: (guard) => [
      {
        checkpoint: retry ? "media.retry" : "media.mark",
        sql: `update media set status = 'deleting', ${retry ? "last_error = null, " : ""}updated_at = ? where id = ? and ${guard.sql}`,
        params: [input.requestedAt, input.mediaId, ...guard.params],
        expectedChanges: 1,
      },
      ...enqueueEvents(
        input.events.map((event, index) =>
          bindEventRequest(event, eventIds[index]!, guard, false, "media.outbox"),
        ),
      ),
    ],
  };
}

type LeaseInput = { readonly mediaId: string; readonly leaseId: string; readonly now: number };
const eventPredicate = "locked_by = ? and type = ? and processed_at is null and locked_at > ?";
function leasePlan(
  input: LeaseInput,
  requireMedia: "finalize" | "fail" | "none",
): Pick<
  WritePlan<MediaDeletionMiss>,
  "admission" | "admissionOutcome" | "diagnoseOutcome" | "diagnostics" | "diagnose"
> {
  const mediaCondition =
    requireMedia === "none"
      ? "1"
      : `exists (select 1 from media m where m.id = ? and m.status = 'deleting' ${requireMedia === "finalize" ? "and not exists (select 1 from content_media_references r where r.media_id = m.id)" : ""})`;
  const leaseParams = [
    input.leaseId,
    MEDIA_DELETE_REQUESTED,
    input.now - DISPATCHER_LEASE_DURATION_MS,
  ];
  const matching = `${eventPredicate} and case when json_valid(payload_json) then json_extract(payload_json, '$.mediaId') end = ?`;
  return {
    admission: { sql: "1", params: [] },
    admissionOutcome: {
      sql: `case when not exists (select 1 from outbox_events where ${eventPredicate}) then 0 when not exists (select 1 from outbox_events where ${matching}) then 2 when not (${mediaCondition}) then 3 else 1 end`,
      params: [
        ...leaseParams,
        ...leaseParams,
        input.mediaId,
        ...(requireMedia === "none" ? [] : [input.mediaId]),
      ],
    },
    diagnostics: {},
    diagnose: () => "lease",
    diagnoseOutcome: (code) => (code === 0 ? "lease" : code === 2 ? "mismatch" : "media"),
  };
}

/** The media key and admitted event key are unique; cascading deletes remove tags. */
export function completeMediaDeletionWritePlan(input: LeaseInput): WritePlanGroup {
  const classified = leasePlan(input, "finalize").admissionOutcome!;
  const matching = `${eventPredicate} and case when json_valid(payload_json) then json_extract(payload_json, '$.mediaId') end = ?`;
  return {
    statements: [
      {
        slot: "admission",
        sql: `select (${classified.sql}) as outcome`,
        params: classified.params,
      },
      {
        sql: `delete from media where id = ? and (${classified.sql}) = 1`,
        params: [input.mediaId, ...classified.params],
      },
      {
        sql: `update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = (select id from outbox_events where ${matching} limit 1) and changes() = 1`,
        params: [
          input.now,
          input.leaseId,
          MEDIA_DELETE_REQUESTED,
          input.now - DISPATCHER_LEASE_DURATION_MS,
          input.mediaId,
        ],
      },
    ],
  };
}

export function failMediaDeletionWritePlan(
  input: LeaseInput & {
    readonly sanitizedError: string;
    readonly terminal: boolean;
    readonly retryAt?: number;
  },
): WritePlan<MediaDeletionMiss> {
  const error = sanitizeDispatchError(input.sanitizedError);
  return {
    ...leasePlan(input, input.terminal ? "fail" : "none"),
    statements: (guard) => [
      ...(input.terminal
        ? [
            {
              sql: `update media set status = 'delete_failed', last_error = ?, updated_at = ? where id = ? and ${guard.sql}`,
              params: [error, input.now, input.mediaId, ...guard.params],
            },
          ]
        : []),
      {
        sql: input.terminal
          ? `update outbox_events set attempts = attempts + 1, processed_at = ?, locked_at = null, locked_by = null, last_error = ? where id = (select id from outbox_events where ${eventPredicate} and case when json_valid(payload_json) then json_extract(payload_json, '$.mediaId') end = ? limit 1) and ${guard.sql}`
          : `update outbox_events set attempts = attempts + 1, available_at = ?, locked_at = null, locked_by = null, last_error = ? where id = (select id from outbox_events where ${eventPredicate} and case when json_valid(payload_json) then json_extract(payload_json, '$.mediaId') end = ? limit 1) and ${guard.sql}`,
        params: [
          input.terminal ? input.now : (input.retryAt ?? input.now),
          error,
          input.leaseId,
          MEDIA_DELETE_REQUESTED,
          input.now - DISPATCHER_LEASE_DURATION_MS,
          input.mediaId,
          ...guard.params,
        ],
      },
    ],
  };
}
