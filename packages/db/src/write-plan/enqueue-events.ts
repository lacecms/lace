import { SITE_BUILD_DEBOUNCE_MS } from "@lacecms/application";
import {
  MEDIA_DELETE_REQUESTED,
  SITE_BUILD_REQUESTED,
  outboxEvents,
  type OutboxEnqueuePayload,
  type RegisteredOutboxType,
} from "@lacecms/contracts/outbox";
import { unixMilliseconds } from "@lacecms/domain";
import type { WritePlanGuard, WritePlanStatement } from "./plan.js";

export const PENDING_SITE_BUILD_SQL = `type = '${SITE_BUILD_REQUESTED}' and processed_at is null and locked_at is null`;

type EnqueueEvent = {
  [Type in RegisteredOutboxType]: {
    readonly type: Type;
    readonly eventId: string;
    readonly guard: WritePlanGuard;
    readonly payload: OutboxEnqueuePayload<Type>;
  } & (Type extends typeof SITE_BUILD_REQUESTED
    ? { readonly requireEnqueue: boolean }
    : { readonly requestedAt: number });
}[RegisteredOutboxType];

/** Validate request-owned fields and compile event writes into the producer's atomic plan. */
export function enqueueEvents(events: readonly EnqueueEvent[]): readonly WritePlanStatement[] {
  return events.flatMap((event): readonly WritePlanStatement[] => {
    switch (event.type) {
      case SITE_BUILD_REQUESTED:
        return enqueueBuild(event);
      case MEDIA_DELETE_REQUESTED: {
        const payload = outboxEvents[event.type].parseEnqueue(event.payload);
        const at = unixMilliseconds(event.requestedAt);
        return [
          {
            checkpoint: "media.outbox",
            outbox: true,
            sql: `insert into outbox_events (id, type, payload_json, attempts, available_at, created_at) select ?, ?, ?, 0, ?, ? where ${event.guard.sql}`,
            params: [
              event.eventId,
              event.type,
              JSON.stringify(payload),
              at,
              at,
              ...event.guard.params,
            ],
            expectedChanges: 1,
          },
        ];
      }
    }
  });
}

function enqueueBuild(
  input: Extract<EnqueueEvent, { type: typeof SITE_BUILD_REQUESTED }>,
): readonly WritePlanStatement[] {
  const { guard, requireEnqueue } = input;
  const request = outboxEvents[input.type].parseEnqueue(input.payload);
  const payload = JSON.stringify(request);
  const version = "coalesce((select version from published_state where singleton_key = 1), 0)";
  const newPayload = `json_set(?, '$.targetVersion', ${version})`;
  // CASE prevents SQLite from evaluating JSON functions on a malformed row.
  const inheritsRetry = `case when json_valid(payload_json) then json_type(payload_json, '$.retryOfBuildId') = 'text' and json_extract(payload_json, '$.retryOfBuildId') <> '' else 0 end`;
  const mergedPayload =
    request.retryOfBuildId === undefined
      ? `case when (${inheritsRetry}) then json_set(${newPayload}, '$.retryOfBuildId', json_extract(payload_json, '$.retryOfBuildId')) else ${newPayload} end`
      : newPayload;
  const mergedParams = request.retryOfBuildId === undefined ? [payload, payload] : [payload];
  // When the enclosing mutation requires a rebuild, skip the insert only
  // for pending work. A conflicting ID on other rows must abort the write.
  const insert = requireEnqueue
    ? "insert into outbox_events"
    : "insert or ignore into outbox_events";
  const skipPending = requireEnqueue
    ? ` and not exists (select 1 from outbox_events where ${PENDING_SITE_BUILD_SQL})`
    : "";
  const coalesce = requireEnqueue ? "changes() = 0" : "id <> ?";
  return [
    {
      checkpoint: "build-outbox",
      outbox: true,
      sql: `${insert} (id, type, payload_json, attempts, available_at, created_at) select ?, ?, ${newPayload}, 0, ?, ? where ${guard.sql}${skipPending}`,
      params: [
        input.eventId,
        SITE_BUILD_REQUESTED,
        payload,
        request.requestedAt + SITE_BUILD_DEBOUNCE_MS,
        request.requestedAt,
        ...guard.params,
      ],
    },
    {
      outbox: true,
      sql: `update outbox_events set payload_json = ${mergedPayload}, available_at = ? where ${PENDING_SITE_BUILD_SQL} and ${coalesce} and ${guard.sql}`,
      params: [
        ...mergedParams,
        request.requestedAt + SITE_BUILD_DEBOUNCE_MS,
        ...(requireEnqueue ? [] : [input.eventId]),
        ...guard.params,
      ],
    },
    {
      slot: "queue",
      sql: `select ? as event_id, (select id from outbox_events where ${PENDING_SITE_BUILD_SQL}) as pending_id, ${version} as version`,
      params: [input.eventId],
    },
  ];
}
