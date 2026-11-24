import { MEDIA_DELETE_REQUESTED, outboxEvents } from "@lacecms/contracts/outbox";
import { mediaId, unixMilliseconds, normalizeBuildFailure } from "@lacecms/domain";
import {
  defaultDispatcherRetryPolicy,
  dispatcherRetryDelay,
  siteBuildRetryPolicy,
} from "./retry-policy.js";
import type { Clock } from "../ports/infrastructure.js";
import type { DispatcherLeasePort, DispatcherRetryPolicy } from "../ports/outbox.js";
import { type MediaDeletionDispatchPort, type ObjectStorage } from "../ports/media.js";
import {
  type SiteBuildDispatchPort,
  type SiteBuildTrigger,
  type SiteBuildWorkLease,
} from "../ports/builds.js";
import { DISPATCHER_LEASE_DURATION_MS } from "../shared/limits.js";
import type { ThumbnailStorage } from "../ports/media-thumbnails.js";
import { mediaThumbnailKey } from "../shared/media-thumbnail-key.js";

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
    for (const [index, lease] of leases.entries()) await this.dispatchLease(lease, index > 0);
  }

  private async dispatchLease(lease: SiteBuildWorkLease, deferred: boolean): Promise<void> {
    let expiresAt = lease.expiresAt;
    if (deferred) {
      const now = this.options.clock.now();
      try {
        if (!(await this.options.work.renewSiteBuildLease({ leaseId: lease.id, now }))) return;
      } catch {
        return;
      }
      // The durable renewal starts from the time sent with the request.
      expiresAt = unixMilliseconds(now + DISPATCHER_LEASE_DURATION_MS);
    }
    if (this.options.clock.now() >= expiresAt) return;

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
        ...(result.providerBuildId === undefined
          ? {}
          : { providerBuildId: result.providerBuildId }),
      });
      return;
    }
    if (result.status === "tracking") {
      await this.options.work.recordSiteBuildTracking({
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
  readonly thumbnails?: Pick<ThumbnailStorage, "delete">;
  readonly work: DispatcherLeasePort & MediaDeletionDispatchPort;
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
      eventTypes: [MEDIA_DELETE_REQUESTED],
      limit,
      now: claimedAt,
    });
    for (const lease of leases) await this.dispatchLease(lease);
  }

  private async dispatchLease(
    lease: Awaited<ReturnType<DispatcherLeasePort["claim"]>>[number],
  ): Promise<void> {
    if (lease.event.type !== MEDIA_DELETE_REQUESTED) return;
    const payload = outboxEvents[MEDIA_DELETE_REQUESTED].decode(lease.event.payload);
    if (payload === null) {
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
    const id = mediaId(payload.mediaId);
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
      await this.options.thumbnails?.delete(mediaThumbnailKey(id));
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
