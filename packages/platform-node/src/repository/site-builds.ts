import type {
  BuildQueueReceipt,
  EnqueueSiteBuildInput,
  SiteBuildCommandPort,
  SiteBuildDispatchPort,
} from "@lacecms/application";
import { dispatcherEventId } from "@lacecms/application";
import {
  failure,
  RETRYABLE_SITE_BUILD_REFUSAL,
  requestBuildWritePlan,
  siteBuildCandidates,
  siteBuildClaimPlan,
  claimedSiteBuilds,
  renewSiteBuildPlan,
  siteBuildOutcomePlan,
  completeTrackedBuildPlan,
  trackedCompletionDiagnostic,
  trackedClaimsPlan,
  trackedCheckPlan,
  assertTrackingClaim,
  DUE_TRACKED_SITE_BUILDS_SQL,
  trackedSiteBuildCheck,
} from "@lacecms/db";
import type { DueTrackedSiteBuildRow, OutboxRow, WritePlan, WritePlanGroup } from "@lacecms/db";
import { NodeRepositoryBase } from "./base.js";
import { executeWritePlan, executeWritePlanGroup } from "./write-plan.js";

type Input<K extends keyof SiteBuildDispatchPort> = Parameters<SiteBuildDispatchPort[K]>[0];

/** Site-build queueing, leasing and provider tracking. */
export class NodeSiteBuilds
  extends NodeRepositoryBase
  implements SiteBuildCommandPort, SiteBuildDispatchPort
{
  public async requestBuild(input: EnqueueSiteBuildInput): Promise<BuildQueueReceipt> {
    try {
      const plan = requestBuildWritePlan({
        eventId: this.nextId(),
        reason: input.retryOfBuildId === undefined ? "manual" : "retry",
        requestedAt: input.requestedAt,
        requestedBy: input.requestedBy.id,
        snapshotId: null,
        ...(input.retryOfBuildId === undefined ? {} : { retryOfBuildId: input.retryOfBuildId }),
      });
      const result = executeWritePlan(this.connection, plan, this.options.beforeMutation);
      if (result.kind === "rejected") failure(RETRYABLE_SITE_BUILD_REFUSAL);
      const row = result.slots.queue?.[0] as
        | { event_id: string; pending_id: string | null; version: number }
        | undefined;
      if (row?.pending_id == null) failure("Build request could not be queued.");
      return {
        coalesced: row.pending_id !== row.event_id,
        eventId: dispatcherEventId(row.pending_id),
        targetVersion: row.version,
      };
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async claimSiteBuilds(input: Input<"claimSiteBuilds">) {
    let candidates: ReturnType<typeof siteBuildClaimPlan>["candidates"] = [];
    try {
      const result = executeWritePlanGroup(this.connection, () => {
        const query = siteBuildCandidates(input);
        const rows = this.connection
          .prepare(query.sql)
          .all(...query.params) as readonly OutboxRow[];
        const prepared = siteBuildClaimPlan(
          rows,
          rows.map(() => this.nextId()),
          input.now,
        );
        candidates = prepared.candidates;
        return prepared.plan;
      });
      return claimedSiteBuilds(candidates, result.changes);
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }
  public async renewSiteBuildLease(input: Input<"renewSiteBuildLease">): Promise<boolean> {
    return (await this.group(renewSiteBuildPlan(input))).changes[0] === 1;
  }
  public async recordSiteBuildAccepted(input: Input<"recordSiteBuildAccepted">): Promise<void> {
    await this.outcome(
      input,
      {
        kind: "accepted",
        ...(input.providerBuildId === undefined ? {} : { providerBuildId: input.providerBuildId }),
      },
      "Build cannot be accepted.",
    );
  }
  public async recordSiteBuildTracking(input: Input<"recordSiteBuildTracking">): Promise<void> {
    await this.outcome(
      input,
      { kind: "tracking", providerBuildId: input.providerBuildId },
      "Build cannot be tracked.",
    );
  }
  public async recordSiteBuildSuccess(input: Input<"recordSiteBuildSuccess">): Promise<void> {
    await this.outcome(input, { kind: "success" }, "Build cannot be completed.");
  }
  public async recordSiteBuildFailure(input: Input<"recordSiteBuildFailure">): Promise<void> {
    await this.outcome(
      input,
      {
        kind: "failure",
        reason: input.reason,
        terminal: input.terminal,
        ...(input.path === undefined ? {} : { path: input.path }),
        ...(input.retryAt === undefined ? {} : { retryAt: input.retryAt }),
      },
      input.terminal ? "Build cannot be failed." : "Build cannot be retried.",
    );
  }
  private async outcome(
    input: { readonly leaseId: string; readonly now: number },
    outcome: Parameters<typeof siteBuildOutcomePlan>[1],
    refusal: string,
  ): Promise<void> {
    const result = await this.plan(siteBuildOutcomePlan(input, outcome), input.now);
    if (result.kind === "rejected")
      failure(result.reason === "lease" ? "Dispatcher lease is missing or expired." : refusal);
  }
  public async completeTrackedSiteBuild(input: Input<"completeTrackedSiteBuild">): Promise<void> {
    const plan = completeTrackedBuildPlan(input);
    const diagnostic = trackedCompletionDiagnostic(input);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if ((await this.group(plan)).changes[0] === 1) return;
      const row = this.connection
        .prepare(diagnostic.query.sql)
        .get(...diagnostic.query.params) as Parameters<typeof diagnostic.diagnose>[0];
      const reason = diagnostic.diagnose(row);
      if (reason === "replay") return;
      if (reason === "provider") failure("Provider build does not match.");
      if (reason === "terminal") failure("Build already has a different terminal outcome.");
      if (reason === "owned") failure("Build is still owned by dispatch.");
    }
    failure("Build already has a different terminal outcome.");
  }
  public async claimTrackedSiteBuildChecks(input: Input<"claimTrackedSiteBuildChecks">) {
    assertTrackingClaim(input);
    let rows: readonly DueTrackedSiteBuildRow[] = [];
    try {
      const result = executeWritePlanGroup(this.connection, () => {
        rows = this.connection
          .prepare(DUE_TRACKED_SITE_BUILDS_SQL)
          .all(input.now, input.limit) as DueTrackedSiteBuildRow[];
        return trackedClaimsPlan(rows, input.now, input.leaseMs);
      });
      return Object.freeze(
        rows.filter((_, index) => result.changes[index] === 1).map(trackedSiteBuildCheck),
      );
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }
  public async recordTrackedSiteBuildCheck(
    input: Input<"recordTrackedSiteBuildCheck">,
  ): Promise<boolean> {
    return (await this.group(trackedCheckPlan(input))).changes[0] === 1;
  }
  private async group(plan: WritePlanGroup) {
    try {
      return executeWritePlanGroup(this.connection, plan);
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }
  private async plan<Miss>(plan: WritePlan<Miss>, _now: number) {
    try {
      return executeWritePlan(this.connection, plan, this.options.beforeMutation);
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }
}
