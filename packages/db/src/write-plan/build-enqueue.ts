import { SITE_BUILD_REQUESTED, outboxEvents } from "@lacecms/contracts/outbox";
import type { OutboxEnqueuePayload } from "@lacecms/contracts/outbox";
import { enqueueEvents } from "./enqueue-events.js";
import type { WritePlanGuard, WritePlanStatement } from "./plan.js";

export { PENDING_SITE_BUILD_SQL } from "./enqueue-events.js";

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

function buildPayload({
  snapshotId,
  reason,
  requestedAt,
  requestedBy,
  retryOfBuildId,
}: BuildEnqueueInput): OutboxEnqueuePayload<typeof SITE_BUILD_REQUESTED> {
  return {
    publishedSnapshotId: snapshotId,
    reason,
    requestedAt,
    requestedBy,
    ...(retryOfBuildId === undefined ? {} : { retryOfBuildId }),
  };
}

/** Serialize the registered request-owned fields. */
export function buildRequestPayload(input: BuildEnqueueInput): string {
  return JSON.stringify(outboxEvents[SITE_BUILD_REQUESTED].parseEnqueue(buildPayload(input)));
}

/** Keep the build-specific entry used by the existing write plans. */
export function buildEnqueueStatements(
  guard: WritePlanGuard,
  input: BuildEnqueueInput,
  requireEnqueue = false,
): readonly WritePlanStatement[] {
  return enqueueEvents([
    {
      type: SITE_BUILD_REQUESTED,
      eventId: input.eventId,
      payload: buildPayload(input),
      guard,
      requireEnqueue,
    },
  ]);
}
