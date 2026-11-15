import { SITE_BUILD_DEBOUNCE_MS } from "@lacecms/application";
import type { WritePlanGuard, WritePlanStatement } from "./plan.js";
export const PENDING_SITE_BUILD_SQL =
  "type = 'site.build.requested' and processed_at is null and locked_at is null";

/** Public state and outbox statements share the version committed by the plan. */
export function publicBuildStatements(
  guard: WritePlanGuard,
  input: {
    readonly eventId: string;
    readonly requestedAt: number;
    readonly requestedBy: string;
    readonly snapshotId: string | null;
  },
): readonly WritePlanStatement[] {
  return [
    publicStateIncrementStatement(guard, input.requestedAt),
    ...buildEnqueueStatements(guard, { ...input, reason: "publication" }).filter(
      (statement) => statement.slot !== "queue",
    ),
    {
      slot: "build",
      sql: "select coalesce((select version from published_state where singleton_key=1),0) as version",
      params: [],
    },
  ];
}

export function publicStateIncrementStatement(
  guard: WritePlanGuard,
  requestedAt: number,
): WritePlanStatement {
  return {
    checkpoint: "public-state",
    sql: `insert into published_state (singleton_key, version, updated_at) select 1, 1, ? where ${guard.sql} on conflict(singleton_key) do update set version=version+1, updated_at=excluded.updated_at`,
    params: [requestedAt, ...guard.params],
  };
}

export interface BuildEnqueueInput {
  readonly eventId: string;
  readonly requestedAt: number;
  readonly requestedBy: string;
  readonly reason: string;
  readonly snapshotId: string | null;
  readonly retryOfBuildId?: string;
}

/** Serialize request-owned fields before entering the atomic write. */
export function buildRequestPayload(input: BuildEnqueueInput): string {
  return JSON.stringify({
    publishedSnapshotId: input.snapshotId,
    reason: input.reason,
    requestedAt: input.requestedAt,
    requestedBy: input.requestedBy,
    ...(input.retryOfBuildId === undefined ? {} : { retryOfBuildId: input.retryOfBuildId }),
  });
}

/** Enqueue or coalesce against the version and retry lineage inside the atomic unit. */
export function buildEnqueueStatements(
  guard: WritePlanGuard,
  input: BuildEnqueueInput,
  requireEnqueue = false,
): readonly WritePlanStatement[] {
  const payload = buildRequestPayload(input);
  const version = "coalesce((select version from published_state where singleton_key = 1), 0)";
  const newPayload = `json_set(?, '$.targetVersion', ${version})`;
  const mergedPayload =
    input.retryOfBuildId === undefined
      ? `case when json_type(payload_json, '$.retryOfBuildId') = 'text' then json_set(${newPayload}, '$.retryOfBuildId', json_extract(payload_json, '$.retryOfBuildId')) else ${newPayload} end`
      : newPayload;
  const mergedParams = input.retryOfBuildId === undefined ? [payload, payload] : [payload];
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
      sql: `${insert} (id, type, payload_json, attempts, available_at, created_at) select ?, 'site.build.requested', ${newPayload}, 0, ?, ? where ${guard.sql}${skipPending}`,
      params: [
        input.eventId,
        payload,
        input.requestedAt + SITE_BUILD_DEBOUNCE_MS,
        input.requestedAt,
        ...guard.params,
      ],
    },
    {
      outbox: true,
      sql: `update outbox_events set payload_json = ${mergedPayload}, available_at = ? where ${PENDING_SITE_BUILD_SQL} and ${coalesce} and ${guard.sql}`,
      params: [
        ...mergedParams,
        input.requestedAt + SITE_BUILD_DEBOUNCE_MS,
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
