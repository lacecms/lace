import { SITE_BUILD_REQUESTED, outboxEvents } from "@lacecms/contracts/outbox";

/** Decode a stored build request, including legacy version 1 rows. */
export function siteBuildPayload(payloadJson: string) {
  return outboxEvents[SITE_BUILD_REQUESTED].decodeJson(payloadJson);
}
