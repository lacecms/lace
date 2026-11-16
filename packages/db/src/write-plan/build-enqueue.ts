import type { WritePlanGuard, WritePlanStatement } from "./plan.js";

export { PENDING_SITE_BUILD_SQL } from "./enqueue-events.js";

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
