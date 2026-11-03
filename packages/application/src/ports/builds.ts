import type {
  Actor,
  SiteBuildFailureReason,
  SiteBuildId,
  SiteBuildProviderStage,
  SiteBuildStatus,
  TrackedSiteBuildOutcome,
  UnixMilliseconds,
} from "@lacecms/domain";
import type { DispatcherEventId, DispatcherLeaseId } from "../shared/brands.js";
import type { DispatcherLease } from "./infrastructure.js";

export interface SiteBuildRequest {
  readonly buildId: SiteBuildId;
  readonly targetVersion: number;
}

/**
 * `succeeded` is proven publication only. `accepted` is untracked provider
 * acceptance; `tracking` means this runtime will track the exact deployment.
 */
export type BuildTriggerResult =
  | Readonly<{ readonly status: "accepted"; readonly providerBuildId?: string }>
  | Readonly<{ readonly status: "tracking"; readonly providerBuildId: string }>
  | Readonly<{ readonly status: "succeeded" }>
  | Readonly<{ readonly status: "failed"; readonly reason: string; readonly path?: string }>;

export interface SiteBuildTrigger {
  trigger(input: SiteBuildRequest): Promise<BuildTriggerResult>;
}

export interface BuildQueueReceipt {
  readonly coalesced: boolean;
  readonly eventId: DispatcherEventId;
  readonly targetVersion: number;
}

export interface EnqueueSiteBuildInput {
  readonly requestedAt: UnixMilliseconds;
  readonly requestedBy: Actor;
  readonly retryOfBuildId?: SiteBuildId;
}

export interface SiteBuildCommandPort {
  requestBuild(input: EnqueueSiteBuildInput): Promise<BuildQueueReceipt>;
}

/** Persisted build history visible to authenticated admin sessions. */
export interface SiteBuildRecord {
  readonly id: SiteBuildId;
  readonly reason: string;
  readonly status: SiteBuildStatus;
  readonly targetVersion: number;
  readonly requestedBy: string;
  readonly requestedAt: UnixMilliseconds;
  readonly startedAt?: UnixMilliseconds;
  readonly completedAt?: UnixMilliseconds;
  readonly providerBuildId?: string;
  readonly providerStage?: SiteBuildProviderStage;
  readonly providerCheckedAt?: UnixMilliseconds;
  readonly error?: string;
  readonly errorPath?: string;
}

export interface SiteBuildReadPort {
  listSiteBuilds(limit: number): Promise<readonly SiteBuildRecord[]>;
  getSiteBuild(buildId: SiteBuildId): Promise<SiteBuildRecord | null>;
}

export interface SiteBuildWorkLease extends DispatcherLease {
  readonly buildId: SiteBuildId;
  readonly targetVersion: number;
}

export interface SiteBuildDispatchPort {
  claimSiteBuilds(input: {
    readonly limit: number;
    readonly now: UnixMilliseconds;
  }): Promise<readonly SiteBuildWorkLease[]>;
  renewSiteBuildLease(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
  }): Promise<boolean>;
  /** Untracked provider acceptance: terminal `accepted`, optional provider ID. */
  recordSiteBuildAccepted(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly providerBuildId?: string;
  }): Promise<void>;
  /** Tracked provider acceptance: the build stays `running` and its event completes. */
  recordSiteBuildTracking(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly providerBuildId: string;
  }): Promise<void>;
  recordSiteBuildSuccess(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
  }): Promise<void>;
  recordSiteBuildFailure(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly reason: string;
    readonly path?: string;
    readonly retryAt?: UnixMilliseconds;
    readonly terminal: boolean;
  }): Promise<void>;
  /**
   * Ends a tracked deployment for the exact build and provider ID; idempotent
   * for the same outcome and never reopens a terminal build. A supplied stage
   * is recorded with the completion time as the last check.
   */
  completeTrackedSiteBuild(input: {
    readonly buildId: SiteBuildId;
    readonly providerBuildId: string;
    readonly now: UnixMilliseconds;
    readonly outcome: TrackedSiteBuildOutcome;
    readonly reason?: string;
    readonly stage?: SiteBuildProviderStage;
  }): Promise<void>;
  /**
   * Leases due tracked builds (`running`, provider ID, completed event) by
   * moving their next check to `now + leaseMs`; each is returned to one caller.
   */
  claimTrackedSiteBuildChecks(input: {
    readonly limit: number;
    readonly leaseMs: number;
    readonly now: UnixMilliseconds;
  }): Promise<readonly TrackedSiteBuildCheck[]>;
  /**
   * Schedules the next check of a still-running tracked build. With a stage the
   * observation is recorded as the last successful check at `now`.
   */
  recordTrackedSiteBuildCheck(input: {
    readonly buildId: SiteBuildId;
    readonly providerBuildId: string;
    readonly now: UnixMilliseconds;
    readonly checkAfter: UnixMilliseconds;
    readonly stage?: SiteBuildProviderStage;
  }): Promise<boolean>;
}

/** One leased check of a tracked provider deployment. */
export interface TrackedSiteBuildCheck {
  readonly buildId: SiteBuildId;
  readonly providerBuildId: string;
  /** Completion time of the build's outbox event: when tracking began. */
  readonly trackingStartedAt: UnixMilliseconds;
  /** Last successful provider read, when one happened. */
  readonly lastCheckedAt?: UnixMilliseconds;
}

/** Closed facts read from a provider about one exact deployment. */
export type ProviderDeploymentObservation =
  | Readonly<{ kind: "progress"; stage: SiteBuildProviderStage }>
  | Readonly<{
      kind: "outcome";
      outcome: "succeeded" | "failed" | "cancelled";
      reason?: SiteBuildFailureReason;
      stage: SiteBuildProviderStage;
    }>
  | Readonly<{ kind: "forbidden" }>
  | Readonly<{ kind: "not_found" }>
  | Readonly<{ kind: "rejected" }>
  | Readonly<{ kind: "transient" }>;

/** Reads a provider deployment; never returns provider text or credentials. */
export interface ProviderDeploymentReader {
  read(providerBuildId: string): Promise<ProviderDeploymentObservation>;
}
