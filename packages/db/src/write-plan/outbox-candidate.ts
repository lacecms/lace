import { DISPATCHER_LEASE_DURATION_MS } from "@lacecms/application";
import type { WritePlanGuard } from "./plan.js";

/** Match the exact persisted payload observed by the candidate read. */
export function outboxCandidateGuard(
  row: { readonly id: string; readonly type: string; readonly payload_json: string },
  now: number,
): WritePlanGuard {
  return {
    sql: "id = ? and type = ? and payload_json = ? and processed_at is null and available_at <= ? and (locked_at is null or locked_at <= ?)",
    params: [row.id, row.type, row.payload_json, now, now - DISPATCHER_LEASE_DURATION_MS],
  };
}
