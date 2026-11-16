import type { EnqueueSiteBuildInput } from "@lacecms/application";
import { SITE_BUILD_REQUESTED } from "@lacecms/contracts/outbox";
import { enqueueRequests } from "../write-plan/enqueue-events.js";
import { RETRYABLE_SITE_BUILD_STATUS_SQL } from "./site-builds.js";

/** Admit an explicit retry only when its source is eligible. */
export function requestBuildWritePlan(
  input: EnqueueSiteBuildInput,
  eventIds: readonly string[],
): import("../write-plan/plan.js").WritePlan<"retry-rejected"> {
  const build = input.events.find((event) => event.type === SITE_BUILD_REQUESTED);
  if (build === undefined) throw new Error("Build request is missing");
  const retryOfBuildId = build.payload.retryOfBuildId;
  return {
    admission:
      retryOfBuildId === undefined
        ? { sql: "1", params: [] }
        : {
            sql: `exists (select 1 from site_builds where id = ? and status in ${RETRYABLE_SITE_BUILD_STATUS_SQL})`,
            params: [retryOfBuildId],
          },
    diagnostics: {},
    diagnose: () => "retry-rejected",
    statements: (guard) => enqueueRequests(input.events, eventIds, guard),
  };
}
