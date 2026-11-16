import type { BuildEnqueueInput } from "../write-plan/build-enqueue.js";
import { buildEnqueueStatements } from "../write-plan/build-enqueue.js";
import { RETRYABLE_SITE_BUILD_STATUS_SQL } from "./site-builds.js";

/** Admit an explicit retry only when its source is eligible. */
export function requestBuildWritePlan(
  input: BuildEnqueueInput,
): import("../write-plan/plan.js").WritePlan<"retry-rejected"> {
  return {
    admission:
      input.retryOfBuildId === undefined
        ? { sql: "1", params: [] }
        : {
            sql: `exists (select 1 from site_builds where id = ? and status in ${RETRYABLE_SITE_BUILD_STATUS_SQL})`,
            params: [input.retryOfBuildId],
          },
    diagnostics: {},
    diagnose: () => "retry-rejected",
    statements: (guard) => buildEnqueueStatements(guard, input),
  };
}
