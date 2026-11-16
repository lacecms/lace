import { parseObject } from "../shared/values.js";
import type { JsonObject } from "@lacecms/content";

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
