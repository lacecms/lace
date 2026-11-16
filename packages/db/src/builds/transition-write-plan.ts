import { SITE_BUILD_REQUESTED } from "@lacecms/contracts/outbox";
import { DISPATCHER_LEASE_DURATION_MS } from "@lacecms/application";
import type { SiteBuildProviderStage, TrackedSiteBuildOutcome } from "@lacecms/domain";
import type { WritePlan, WritePlanGroup } from "../write-plan/plan.js";
import {
  assertProviderBuildId,
  encodeBuildError,
  sanitizeBuildReason,
  trackedCompletionStage,
  trackedOutcomeError,
  trackedSiteBuildCheckUpdate,
  LEASE_TRACKED_SITE_BUILD_SQL,
} from "./site-builds.js";
import type { DueTrackedSiteBuildRow } from "./site-builds.js";

export type BuildLeaseMiss = "lease" | "build";
type Lease = { readonly leaseId: string; readonly now: number };
const leaseSql =
  "select id from outbox_events where locked_by = ? and type = ? and processed_at is null and locked_at > ?";
export function renewSiteBuildPlan(input: Lease): WritePlanGroup {
  return {
    statements: [
      {
        sql: "update outbox_events set locked_at = ? where locked_by = ? and type = ? and processed_at is null and locked_at > ?",
        params: [
          input.now,
          input.leaseId,
          SITE_BUILD_REQUESTED,
          input.now - DISPATCHER_LEASE_DURATION_MS,
        ],
      },
    ],
  };
}

type TriggerOutcome =
  | { readonly kind: "accepted"; readonly providerBuildId?: string }
  | { readonly kind: "tracking"; readonly providerBuildId: string }
  | { readonly kind: "success" }
  | {
      readonly kind: "failure";
      readonly reason: string;
      readonly path?: string;
      readonly retryAt?: number;
      readonly terminal: boolean;
    };
export function siteBuildOutcomePlan(
  input: Lease,
  outcome: TriggerOutcome,
): WritePlan<BuildLeaseMiss> {
  if (
    (outcome.kind === "accepted" || outcome.kind === "tracking") &&
    outcome.providerBuildId !== undefined
  )
    assertProviderBuildId(outcome.providerBuildId);
  const leaseParams = [
    input.leaseId,
    SITE_BUILD_REQUESTED,
    input.now - DISPATCHER_LEASE_DURATION_MS,
  ];
  const id = `(${leaseSql})`;
  let update: string;
  let params: readonly unknown[];
  if (outcome.kind === "accepted") {
    update =
      "status = 'accepted', provider_build_id = ?, started_at = coalesce(started_at, ?), completed_at = ?, error = null";
    params = [outcome.providerBuildId ?? null, input.now, input.now];
  } else if (outcome.kind === "tracking") {
    update = "provider_build_id = ?, provider_check_after = ?, error = null";
    params = [outcome.providerBuildId, input.now];
  } else if (outcome.kind === "success") {
    update =
      "status = 'succeeded', started_at = coalesce(started_at, ?), completed_at = ?, error = null";
    params = [input.now, input.now];
  } else if (outcome.terminal) {
    update = "status = 'failed', started_at = coalesce(started_at, ?), completed_at = ?, error = ?";
    params = [input.now, input.now, encodeBuildError(outcome.reason, outcome.path)];
  } else {
    update = "status = 'pending', error = ?";
    params = [encodeBuildError(outcome.reason, outcome.path)];
  }
  return {
    admission: { sql: "1", params: [] },
    admissionOutcome: {
      sql: `case when not exists (${leaseSql}) then 0 when not exists (select 1 from site_builds where id = ${id} and status = 'running') then 2 else 1 end`,
      params: [...leaseParams, ...leaseParams],
    },
    diagnostics: {},
    diagnose: () => "lease",
    diagnoseOutcome: (code) => (code === 0 ? "lease" : "build"),
    statements: (guard) => [
      {
        sql: `update site_builds set ${update} where id = ${id} and status = 'running' and ${guard.sql}`,
        params: [...params, ...leaseParams, ...guard.params],
      },
      ...(outcome.kind === "failure"
        ? [
            {
              sql: `update outbox_events set attempts = attempts + 1, available_at = ?, processed_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ${id} and ${guard.sql}`,
              params: [
                outcome.retryAt ?? input.now,
                outcome.terminal ? input.now : null,
                sanitizeBuildReason(outcome.reason),
                ...leaseParams,
                ...guard.params,
              ],
            },
          ]
        : [
            {
              sql: `update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ${id} and ${guard.sql}`,
              params: [input.now, ...leaseParams, ...guard.params],
            },
          ]),
    ],
  };
}

type TrackedInput = {
  readonly buildId: string;
  readonly providerBuildId: string;
  readonly now: number;
  readonly outcome: TrackedSiteBuildOutcome;
  readonly reason?: string;
  readonly stage?: SiteBuildProviderStage;
};
export type TrackedMiss = "provider" | "terminal" | "owned";
export function completeTrackedBuildPlan(input: TrackedInput): WritePlanGroup {
  const error = trackedOutcomeError(input.outcome, input.reason);
  const [stage, checkedAt] = trackedCompletionStage(input.stage, input.now);
  return {
    statements: [
      {
        sql: "update site_builds set status = ?, completed_at = ?, error = ?, provider_check_after = null, provider_stage = coalesce(?, provider_stage), provider_checked_at = coalesce(?, provider_checked_at) where id = ? and status = 'running' and provider_build_id = ? and exists (select 1 from outbox_events where id = site_builds.id and processed_at is not null)",
        params: [
          input.outcome,
          input.now,
          error,
          stage,
          checkedAt,
          input.buildId,
          input.providerBuildId,
        ],
      },
    ],
  };
}

/** A zero-row conditional completion is classified against the latest state. */
export function trackedCompletionDiagnostic(input: TrackedInput) {
  const error = trackedOutcomeError(input.outcome, input.reason);
  return {
    query: {
      sql: "select b.status, b.provider_build_id, b.error, e.processed_at from site_builds b left join outbox_events e on e.id = b.id where b.id = ?",
      params: [input.buildId],
    },
    diagnose(
      row:
        | {
            status: string;
            provider_build_id: string | null;
            error: string | null;
            processed_at: number | null;
          }
        | undefined,
    ): TrackedMiss | "replay" | "retry" {
      if (row === undefined || row.provider_build_id !== input.providerBuildId) return "provider";
      if (row.status === input.outcome && row.error === error) return "replay";
      if (row.status !== "running") return "terminal";
      return row.processed_at === null ? "owned" : "retry";
    },
  };
}

export function trackedClaimsPlan(
  rows: readonly DueTrackedSiteBuildRow[],
  now: number,
  leaseMs: number,
): WritePlanGroup {
  return {
    statements: rows.map((row) => ({
      sql: LEASE_TRACKED_SITE_BUILD_SQL,
      params: [now + leaseMs, row.id, row.provider_build_id, row.provider_check_after],
    })),
  };
}
export function trackedCheckPlan(
  input: Parameters<typeof trackedSiteBuildCheckUpdate>[0],
): WritePlanGroup {
  return { statements: [trackedSiteBuildCheckUpdate(input)] };
}
