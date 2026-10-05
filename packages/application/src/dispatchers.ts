import { mediaId, unixMilliseconds, normalizeBuildFailure } from "@lacecms/domain";
import {
  defaultDispatcherRetryPolicy,
  dispatcherRetryDelay,
  siteBuildRetryPolicy,
  type Clock,
  type DispatcherLeasePort,
  type DispatcherRetryPolicy,
  type MediaDeletionDispatchPort,
  type ObjectStorage,
  type SiteBuildDispatchPort,
  type SiteBuildTrigger,
  type SiteBuildWorkLease,
} from "./index.js";

type TimerHandle = unknown;

/** Timer globals exist in every supported runtime but not in this package's portable lib types. */
const timers = globalThis as unknown as {
  clearInterval(handle: TimerHandle): void;
  setInterval(callback: () => void, intervalMs: number): TimerHandle;
};

/** Node timers keep a process alive unless released; Worker timers have no such handle. */
function unrefTimer(handle: TimerHandle): void {
  const candidate = handle as { readonly unref?: () => void } | null;
  if (typeof candidate?.unref === "function") candidate.unref();
}

export interface SiteBuildDispatcherOptions {
  readonly clock: Clock;
  readonly logger: { error(entry: { readonly buildId: string; readonly reason: string }): void };
  readonly policy?: DispatcherRetryPolicy;
  readonly random?: () => number;
  readonly leaseRenewIntervalMs?: number;
  readonly trigger: SiteBuildTrigger;
  readonly work: SiteBuildDispatchPort;
}

/** One recoverable pass; process scheduling belongs to the deployment composition. */
export class SiteBuildDispatcher {
  private readonly policy: DispatcherRetryPolicy;
  private readonly random: () => number;

  public constructor(private readonly options: SiteBuildDispatcherOptions) {
    this.policy = options.policy ?? siteBuildRetryPolicy;
    this.random = options.random ?? Math.random;
  }

  public async runOnce(limit = 10): Promise<void> {
    const leases = await this.options.work.claimSiteBuilds({
      limit,
      now: this.options.clock.now(),
    });
    for (const lease of leases) await this.dispatchLease(lease);
  }

  private async dispatchLease(lease: SiteBuildWorkLease): Promise<void> {
    let result: Awaited<ReturnType<SiteBuildTrigger["trigger"]>>;
    let lostLease = false;
    let pendingRenewal: Promise<void> = Promise.resolve();
    const interval = timers.setInterval(() => {
      pendingRenewal = pendingRenewal.then(async () => {
        if (lostLease) return;
        try {
          if (
            !(await this.options.work.renewSiteBuildLease({
              leaseId: lease.id,
              now: this.options.clock.now(),
            }))
          )
            lostLease = true;
        } catch {
          lostLease = true;
        }
      });
    }, this.options.leaseRenewIntervalMs ?? 20_000);
    unrefTimer(interval);
    try {
      result = await this.options.trigger.trigger({
        buildId: lease.buildId,
        targetVersion: lease.targetVersion,
      });
    } catch {
      timers.clearInterval(interval);
      await pendingRenewal;
      if (lostLease) return;
      await this.fail(lease, "trigger_unavailable");
      return;
    }
    timers.clearInterval(interval);
    await pendingRenewal;
    if (lostLease) return;
    if (result.status === "accepted") {
      await this.options.work.recordSiteBuildAccepted({
        leaseId: lease.id,
        now: this.options.clock.now(),
        providerBuildId: result.providerBuildId,
      });
      return;
    }
    if (result.status === "succeeded") {
      await this.options.work.recordSiteBuildSuccess({
        leaseId: lease.id,
        now: this.options.clock.now(),
      });
      return;
    }
    await this.fail(lease, result.reason, result.path);
  }

  private async fail(lease: SiteBuildWorkLease, reason: string, path?: string): Promise<void> {
    const failedAt = this.options.clock.now();
    const failedAttempt = lease.event.attempts + 1;
    const terminal = failedAttempt >= this.policy.maxAttempts;
    const failure = normalizeBuildFailure(reason, path);
    const safeReason = failure.reason;
    this.options.logger.error({ buildId: lease.buildId, reason: safeReason });
    await this.options.work.recordSiteBuildFailure({
      leaseId: lease.id,
      now: failedAt,
      ...failure,
      terminal,
      ...(terminal
        ? {}
        : {
            retryAt: unixMilliseconds(
              failedAt + dispatcherRetryDelay(this.policy, failedAttempt, this.random()),
            ),
          }),
    });
  }
}

const MEDIA_DELETION_EVENT = "media.delete.requested";

export interface MediaDeletionDispatcherLogger {
  error(entry: {
    readonly eventId: string;
    readonly mediaId?: string;
    readonly reason: string;
  }): void;
}

export interface MediaDeletionDispatcherOptions {
  readonly clock: Clock;
  readonly logger: MediaDeletionDispatcherLogger;
  readonly policy?: DispatcherRetryPolicy;
  readonly random?: () => number;
  readonly storage: ObjectStorage;
  readonly work: DispatcherLeasePort & MediaDeletionDispatchPort;
}

function mediaIdFromPayload(payload: Record<string, unknown>): string | undefined {
  return typeof payload.mediaId === "string" && payload.mediaId.length > 0
    ? payload.mediaId
    : undefined;
}

function sanitizedReason(_error: unknown): string {
  return "storage_unavailable";
}

/** Processes a bounded non-overlapping batch; scheduling belongs to the composition root. */
export class MediaDeletionDispatcher {
  private readonly policy: DispatcherRetryPolicy;
  private readonly random: () => number;

  public constructor(private readonly options: MediaDeletionDispatcherOptions) {
    this.policy = options.policy ?? defaultDispatcherRetryPolicy;
    this.random = options.random ?? Math.random;
  }

  public async runOnce(limit = 10): Promise<void> {
    const claimedAt = this.options.clock.now();
    const leases = await this.options.work.claim({
      eventTypes: [MEDIA_DELETION_EVENT],
      limit,
      now: claimedAt,
    });
    for (const lease of leases) await this.dispatchLease(lease);
  }

  private async dispatchLease(
    lease: Awaited<ReturnType<DispatcherLeasePort["claim"]>>[number],
  ): Promise<void> {
    const rawMediaId = mediaIdFromPayload(lease.event.payload);
    if (rawMediaId === undefined) {
      this.options.logger.error({
        eventId: lease.event.id,
        reason: "invalid_media_deletion_event",
      });
      await this.options.work.complete({
        completedAt: this.options.clock.now(),
        leaseId: lease.id,
        outcome: "succeeded",
      });
      return;
    }
    const id = mediaId(rawMediaId);
    const media = await this.options.work.loadDeletingMedia(id);
    if (media === null) {
      await this.options.work.complete({
        completedAt: this.options.clock.now(),
        leaseId: lease.id,
        outcome: "succeeded",
      });
      return;
    }
    try {
      await this.options.storage.delete(media.storageKey);
      await this.options.work.completeMediaDeletion({
        completedAt: this.options.clock.now(),
        leaseId: lease.id,
        mediaId: id,
      });
    } catch (error) {
      const failedAt = this.options.clock.now();
      const failedAttempt = lease.event.attempts + 1;
      const terminal = failedAttempt >= this.policy.maxAttempts;
      const reason = sanitizedReason(error);
      this.options.logger.error({ eventId: lease.event.id, mediaId: id, reason });
      await this.options.work.failMediaDeletion({
        failedAt,
        leaseId: lease.id,
        mediaId: id,
        sanitizedError: reason,
        terminal,
        ...(terminal
          ? {}
          : {
              retryAt: unixMilliseconds(
                failedAt + dispatcherRetryDelay(this.policy, failedAttempt, this.random()),
              ),
            }),
      });
    }
  }
}
