import { parseObject } from "../shared/values.js";
import type { JsonObject } from "@lacecms/content";

export interface OutboxRow {
  readonly attempts: number;
  readonly available_at: number;
  readonly id: string;
  readonly payload_json: string;
  readonly type: string;
}

export const PENDING_SITE_BUILD_SQL =
  "type = 'site.build.requested' and processed_at is null and locked_at is null";

/** Validates a claimed `site.build.requested` payload; `null` marks an invalid event. */
export function siteBuildPayload(payloadJson: string): JsonObject | null {
  let payload: JsonObject;
  try {
    payload = parseObject(payloadJson, "Build payload");
  } catch {
    return null;
  }
  return !Number.isSafeInteger(payload.targetVersion) ||
    Number(payload.targetVersion) < 0 ||
    typeof payload.requestedBy !== "string" ||
    !payload.requestedBy ||
    typeof payload.reason !== "string" ||
    !payload.reason ||
    !Number.isSafeInteger(payload.requestedAt)
    ? null
    : payload;
}
