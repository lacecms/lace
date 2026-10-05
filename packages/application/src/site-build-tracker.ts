import {
  DomainError,
  siteBuildTrackingPolicy,
  unixMilliseconds,
  type SiteBuildFailureReason,
  type SiteBuildProviderStage,
  type TrackedSiteBuildOutcome,
  type UnixMilliseconds,
} from "@lacecms/domain";
import type {
  Clock,
  ProviderDeploymentObservation,
  ProviderDeploymentReader,
  SiteBuildDispatchPort,
  TrackedSiteBuildCheck,
} from "./index.js";

export interface SiteBuildTrackerOptions {
  readonly clock: Clock;
  readonly logger: { error(entry: { readonly buildId: string; readonly reason: string }): void };
  /** Absent when tracking is not configured: due tracked builds end `unknown`. */
  readonly reader?: ProviderDeploymentReader;
  /** Overall deadline from tracking start; defaults to the policy's 60 minutes. */
  readonly timeoutMs?: number;
  readonly work: SiteBuildDispatchPort;
}

interface Completion {
  readonly outcome: TrackedSiteBuildOutcome;
  readonly reason?: SiteBuildFailureReason;
  readonly stage?: SiteBuildProviderStage;
}

const DEFAULT_TIMEOUT_MS = siteBuildTrackingPolicy.defaultTimeoutMinutes * 60_000;

/**
 * Polls tracked provider deployments from durable `site_builds` state. Every
 * check ends in a proven outcome, a later check, or `unknown` at the deadline,
 * so no tracked build stays `running` indefinitely.
 */
export class SiteBuildTracker {
  private readonly timeoutMs: number;

  public constructor(private readonly options: SiteBuildTrackerOptions) {
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1)
      throw new TypeError("Tracking timeout is invalid.");
  }

  public async runOnce(limit = 5): Promise<void> {
    const checks = await this.options.work.claimTrackedSiteBuildChecks({
      leaseMs: siteBuildTrackingPolicy.checkLeaseMs,
      limit,
      now: this.options.clock.now(),
    });
    for (const check of checks) {
      try {
        await this.check(check);
      } catch (error) {
        this.options.logger.error({
          buildId: check.buildId,
          reason:
            error instanceof DomainError && error.code === "CONTENT_INVALID_STATE"
              ? "tracking_conflict"
              : "tracking_failed",
        });
      }
    }
  }

  private async check(check: TrackedSiteBuildCheck): Promise<void> {
    if (this.options.reader === undefined) {
      await this.complete(check, { outcome: "unknown", reason: "tracking_unconfigured" });
      return;
    }
    let observation: ProviderDeploymentObservation;
    try {
      observation = await this.options.reader.read(check.providerBuildId);
    } catch {
      observation = { kind: "transient" };
    }
    const now = this.options.clock.now();
    const deadline = check.trackingStartedAt + this.timeoutMs;
    switch (observation.kind) {
      case "outcome":
        await this.complete(check, {
          outcome: observation.outcome,
          stage: observation.stage,
          ...(observation.reason === undefined ? {} : { reason: observation.reason }),
        });
        return;
      case "forbidden":
        await this.complete(check, { outcome: "unknown", reason: "tracking_forbidden" });
        return;
      case "rejected":
        await this.complete(check, { outcome: "unknown", reason: "tracking_rejected" });
        return;
      case "not_found":
        if (now - check.trackingStartedAt >= siteBuildTrackingPolicy.notFoundGraceMs) {
          await this.complete(check, { outcome: "unknown", reason: "tracking_not_found" });
          return;
        }
        break;
      default:
        break;
    }
    const stage = observation.kind === "progress" ? observation.stage : undefined;
    if (now >= deadline) {
      await this.complete(check, {
        outcome: "unknown",
        reason: "tracking_timeout",
        ...(stage === undefined ? {} : { stage }),
      });
      return;
    }
    const delay =
      stage === undefined ? this.backoff(check, now) : siteBuildTrackingPolicy.pollIntervalMs;
    await this.options.work.recordTrackedSiteBuildCheck({
      buildId: check.buildId,
      checkAfter: unixMilliseconds(Math.min(now + delay, deadline)),
      now,
      providerBuildId: check.providerBuildId,
      ...(stage === undefined ? {} : { stage }),
    });
  }

  /** Roughly doubles the gap since the last successful read, within policy bounds. */
  private backoff(check: TrackedSiteBuildCheck, now: UnixMilliseconds): number {
    const gap = now - (check.lastCheckedAt ?? check.trackingStartedAt);
    return Math.min(
      siteBuildTrackingPolicy.maxBackoffMs,
      Math.max(siteBuildTrackingPolicy.pollIntervalMs, gap),
    );
  }

  private async complete(check: TrackedSiteBuildCheck, completion: Completion): Promise<void> {
    if (completion.outcome !== "succeeded")
      this.options.logger.error({
        buildId: check.buildId,
        reason: completion.reason ?? completion.outcome,
      });
    await this.options.work.completeTrackedSiteBuild({
      buildId: check.buildId,
      now: this.options.clock.now(),
      outcome: completion.outcome,
      providerBuildId: check.providerBuildId,
      ...(completion.reason === undefined ? {} : { reason: completion.reason }),
      ...(completion.stage === undefined ? {} : { stage: completion.stage }),
    });
  }
}
