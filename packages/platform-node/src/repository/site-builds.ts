import { MAX_PAGE_SIZE } from "@lacecms/content";
import {
  DISPATCHER_LEASE_DURATION_MS,
  MAX_SITE_BUILD_CLAIMS_PER_CALL,
  dispatcherEventId,
  dispatcherLeaseId,
} from "@lacecms/application";
import type {
  BuildQueueReceipt,
  EnqueueSiteBuildInput,
  SiteBuildCommandPort,
  SiteBuildDispatchPort,
  SiteBuildWorkLease,
} from "@lacecms/application";
import {
  failure,
  sanitizeBuildReason,
  encodeBuildError,
  CLAIMABLE_SITE_BUILD_STATUS_SQL,
  RETRYABLE_SITE_BUILD_REFUSAL,
  assertProviderBuildId,
  assertTrackingClaim,
  DUE_TRACKED_SITE_BUILDS_SQL,
  LEASE_TRACKED_SITE_BUILD_SQL,
  trackedCompletionStage,
  trackedOutcomeError,
  trackedSiteBuildCheck,
  trackedSiteBuildCheckUpdate,
  RETRYABLE_SITE_BUILD_STATUS_SQL,
  siteBuildPayload,
} from "@lacecms/db";
import type { DueTrackedSiteBuildRow, OutboxRow } from "@lacecms/db";
import { siteBuildId, unixMilliseconds } from "@lacecms/domain";
import { NodeRepositoryBase } from "./base.js";

/** Node site-build queueing, leasing and provider tracking. */
export class NodeSiteBuilds
  extends NodeRepositoryBase
  implements SiteBuildCommandPort, SiteBuildDispatchPort
{
  public async requestBuild(input: EnqueueSiteBuildInput): Promise<BuildQueueReceipt> {
    try {
      return this.connection.transaction(() => {
        if (input.retryOfBuildId !== undefined) {
          const prior = this.connection
            .prepare(
              `select 1 as retryable from site_builds where id = ? and status in ${RETRYABLE_SITE_BUILD_STATUS_SQL}`,
            )
            .get(input.retryOfBuildId) as { retryable: number } | undefined;
          if (prior === undefined) failure(RETRYABLE_SITE_BUILD_REFUSAL);
        }
        const state = this.connection
          .prepare("select version from published_state where singleton_key = 1")
          .get() as { version: number } | undefined;
        return this.enqueueSiteBuild({
          reason: input.retryOfBuildId === undefined ? "manual" : "retry",
          requestedAt: input.requestedAt,
          requestedBy: input.requestedBy.id,
          ...(input.retryOfBuildId === undefined ? {} : { retryOfBuildId: input.retryOfBuildId }),
          snapshotId: null,
          targetVersion: state?.version ?? 0,
        });
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async claimSiteBuilds(input: {
    readonly limit: number;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
  }): Promise<readonly SiteBuildWorkLease[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > MAX_PAGE_SIZE)
      throw new TypeError("Build claim limit is invalid.");
    try {
      return this.connection.transaction(() => {
        const rows = this.connection
          .prepare(
            "select id, type, payload_json, attempts, available_at from outbox_events where type = 'site.build.requested' and processed_at is null and available_at <= ? and (locked_at is null or locked_at <= ?) order by available_at asc, id asc limit ?",
          )
          .all(
            input.now,
            input.now - DISPATCHER_LEASE_DURATION_MS,
            Math.min(input.limit, MAX_SITE_BUILD_CLAIMS_PER_CALL),
          ) as readonly OutboxRow[];
        const leases: SiteBuildWorkLease[] = [];
        for (const row of rows) {
          const leaseId = dispatcherLeaseId(this.nextId());
          const claimed = this.connection
            .prepare(
              "update outbox_events set locked_at = ?, locked_by = ? where id = ? and payload_json = ? and processed_at is null and (locked_at is null or locked_at <= ?)",
            )
            .run(
              input.now,
              leaseId,
              row.id,
              row.payload_json,
              input.now - DISPATCHER_LEASE_DURATION_MS,
            );
          if (claimed.changes !== 1) continue;
          const payload = siteBuildPayload(row.payload_json);
          if (payload === null) {
            this.connection
              .prepare(
                "update outbox_events set attempts = attempts + 1, processed_at = ?, locked_at = null, locked_by = null, last_error = 'invalid_build_event' where id = ? and locked_by = ?",
              )
              .run(input.now, row.id, leaseId);
            continue;
          }
          const snapshotId =
            typeof payload.publishedSnapshotId === "string" ? payload.publishedSnapshotId : null;
          this.connection
            .prepare(
              "insert or ignore into site_builds (id, reason, status, target_version, published_snapshot_id, requested_by, requested_at, started_at) values (?, ?, 'running', ?, (select id from content_snapshots where id = ?), ?, ?, ?)",
            )
            .run(
              row.id,
              payload.reason,
              payload.targetVersion,
              snapshotId,
              payload.requestedBy,
              payload.requestedAt,
              input.now,
            );
          // pending → running after a retry, or running → running when an
          // orphaned claim is recovered; the first start time is kept.
          const started = this.connection
            .prepare(
              `update site_builds set status = 'running', started_at = coalesce(started_at, ?) where id = ? and status in ${CLAIMABLE_SITE_BUILD_STATUS_SQL}`,
            )
            .run(input.now, row.id);
          if (started.changes !== 1) {
            // Defensive: a terminal build never runs again; finish its stray event.
            this.connection
              .prepare(
                "update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ? and locked_by = ?",
              )
              .run(input.now, row.id, leaseId);
            continue;
          }
          leases.push(
            Object.freeze({
              buildId: siteBuildId(row.id),
              event: Object.freeze({
                attempts: row.attempts,
                availableAt: unixMilliseconds(row.available_at),
                id: dispatcherEventId(row.id),
                payload,
                type: row.type,
              }),
              expiresAt: unixMilliseconds(input.now + DISPATCHER_LEASE_DURATION_MS),
              id: leaseId,
              targetVersion: Number(payload.targetVersion),
            }),
          );
        }
        return Object.freeze(leases);
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async renewSiteBuildLease(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
  }): Promise<boolean> {
    try {
      const renewed = this.connection
        .prepare(
          "update outbox_events set locked_at = ? where locked_by = ? and type = 'site.build.requested' and processed_at is null and locked_at > ?",
        )
        .run(input.now, input.leaseId, input.now - DISPATCHER_LEASE_DURATION_MS);
      return renewed.changes === 1;
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  private requireLeasedSiteBuild(leaseId: string, now: number): string {
    const row = this.connection
      .prepare(
        "select id from outbox_events where locked_by = ? and type = 'site.build.requested' and processed_at is null and locked_at > ?",
      )
      .get(leaseId, now - DISPATCHER_LEASE_DURATION_MS) as { id: string } | undefined;
    if (row === undefined) failure("Dispatcher lease is missing or expired.");
    return row.id;
  }

  public async recordSiteBuildAccepted(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly providerBuildId?: string;
  }): Promise<void> {
    if (input.providerBuildId !== undefined) assertProviderBuildId(input.providerBuildId);
    this.finishLeasedSiteBuild(
      input,
      "Build cannot be accepted.",
      "update site_builds set status = 'accepted', provider_build_id = ?, started_at = coalesce(started_at, ?), completed_at = ?, error = null where id = ? and status = 'running'",
      [input.providerBuildId ?? null, input.now, input.now],
    );
  }

  public async recordSiteBuildTracking(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly providerBuildId: string;
  }): Promise<void> {
    assertProviderBuildId(input.providerBuildId);
    this.finishLeasedSiteBuild(
      input,
      "Build cannot be tracked.",
      "update site_builds set provider_build_id = ?, provider_check_after = ?, error = null where id = ? and status = 'running'",
      [input.providerBuildId, input.now],
    );
  }

  /** Applies a lease-guarded `running` transition and completes its event atomically. */
  private finishLeasedSiteBuild(
    input: {
      readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
      readonly now: import("@lacecms/domain").UnixMilliseconds;
    },
    refusal: string,
    update: string,
    parameters: readonly (number | string | null)[],
  ): void {
    try {
      this.connection.transaction(() => {
        const id = this.requireLeasedSiteBuild(input.leaseId, input.now);
        const updated = this.connection.prepare(update).run(...parameters, id);
        if (updated.changes !== 1) failure(refusal);
        this.connection
          .prepare(
            "update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ? and locked_by = ?",
          )
          .run(input.now, id, input.leaseId);
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async recordSiteBuildSuccess(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
  }): Promise<void> {
    this.finishLeasedSiteBuild(
      input,
      "Build cannot be completed.",
      "update site_builds set status = 'succeeded', started_at = coalesce(started_at, ?), completed_at = ?, error = null where id = ? and status = 'running'",
      [input.now, input.now],
    );
  }

  public async recordSiteBuildFailure(input: {
    readonly leaseId: import("@lacecms/application").DispatcherLeaseId;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly reason: string;
    readonly path?: string;
    readonly retryAt?: import("@lacecms/domain").UnixMilliseconds;
    readonly terminal: boolean;
  }): Promise<void> {
    const reason = sanitizeBuildReason(input.reason);
    const error = encodeBuildError(input.reason, input.path);
    try {
      this.connection.transaction(() => {
        const id = this.requireLeasedSiteBuild(input.leaseId, input.now);
        if (input.terminal) {
          const updated = this.connection
            .prepare(
              "update site_builds set status = 'failed', started_at = coalesce(started_at, ?), completed_at = ?, error = ? where id = ? and status = 'running'",
            )
            .run(input.now, input.now, error, id);
          if (updated.changes !== 1) failure("Build cannot be failed.");
        } else {
          const updated = this.connection
            .prepare(
              "update site_builds set status = 'pending', error = ? where id = ? and status = 'running'",
            )
            .run(error, id);
          if (updated.changes !== 1) failure("Build cannot be retried.");
        }
        this.connection
          .prepare(
            "update outbox_events set attempts = attempts + 1, available_at = ?, processed_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ? and locked_by = ?",
          )
          .run(
            input.retryAt ?? input.now,
            input.terminal ? input.now : null,
            reason,
            id,
            input.leaseId,
          );
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async completeTrackedSiteBuild(input: {
    readonly buildId: import("@lacecms/domain").SiteBuildId;
    readonly providerBuildId: string;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly outcome: import("@lacecms/domain").TrackedSiteBuildOutcome;
    readonly reason?: string;
    readonly stage?: import("@lacecms/domain").SiteBuildProviderStage;
  }): Promise<void> {
    const error = trackedOutcomeError(input.outcome, input.reason);
    const [stage, checkedAt] = trackedCompletionStage(input.stage, input.now);
    try {
      this.connection.transaction(() => {
        const row = this.connection
          .prepare(
            "select b.status, b.provider_build_id, b.error, e.processed_at from site_builds b left join outbox_events e on e.id = b.id where b.id = ?",
          )
          .get(input.buildId) as
          | {
              status: string;
              provider_build_id: string | null;
              error: string | null;
              processed_at: number | null;
            }
          | undefined;
        if (row === undefined || row.provider_build_id !== input.providerBuildId)
          failure("Provider build does not match.");
        if (row.status === input.outcome && row.error === error) return;
        if (row.status !== "running") failure("Build already has a different terminal outcome.");
        if (row.processed_at === null) failure("Build is still owned by dispatch.");
        this.connection
          .prepare(
            "update site_builds set status = ?, completed_at = ?, error = ?, provider_check_after = null, provider_stage = coalesce(?, provider_stage), provider_checked_at = coalesce(?, provider_checked_at) where id = ? and status = 'running' and provider_build_id = ?",
          )
          .run(
            input.outcome,
            input.now,
            error,
            stage,
            checkedAt,
            input.buildId,
            input.providerBuildId,
          );
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async claimTrackedSiteBuildChecks(input: {
    readonly limit: number;
    readonly leaseMs: number;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
  }): Promise<readonly import("@lacecms/application").TrackedSiteBuildCheck[]> {
    assertTrackingClaim(input);
    try {
      return this.connection.transaction(() => {
        const rows = this.connection
          .prepare(DUE_TRACKED_SITE_BUILDS_SQL)
          .all(input.now, input.limit) as DueTrackedSiteBuildRow[];
        const lease = this.connection.prepare(LEASE_TRACKED_SITE_BUILD_SQL);
        return Object.freeze(
          rows
            .filter(
              (row) =>
                lease.run(
                  input.now + input.leaseMs,
                  row.id,
                  row.provider_build_id,
                  row.provider_check_after,
                ).changes === 1,
            )
            .map(trackedSiteBuildCheck),
        );
      })();
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }

  public async recordTrackedSiteBuildCheck(input: {
    readonly buildId: import("@lacecms/domain").SiteBuildId;
    readonly providerBuildId: string;
    readonly now: import("@lacecms/domain").UnixMilliseconds;
    readonly checkAfter: import("@lacecms/domain").UnixMilliseconds;
    readonly stage?: import("@lacecms/domain").SiteBuildProviderStage;
  }): Promise<boolean> {
    const update = trackedSiteBuildCheckUpdate(input);
    try {
      return this.connection.prepare(update.sql).run(...update.params).changes === 1;
    } catch (error) {
      this.throwWriteError(error, false);
    }
  }
}
