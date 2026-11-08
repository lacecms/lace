import { MAX_PAGE_SIZE } from "@lacecms/content";
import {
  DISPATCHER_LEASE_DURATION_MS,
  dispatcherEventId,
  dispatcherLeaseId,
} from "@lacecms/application";
import type {
  BuildQueueReceipt,
  DispatcherLeaseId,
  EnqueueSiteBuildInput,
  SiteBuildCommandPort,
  SiteBuildDispatchPort,
  SiteBuildWorkLease,
  TrackedSiteBuildCheck,
} from "@lacecms/application";
import {
  failure,
  sanitizeBuildReason,
  encodeBuildError,
  CLAIMABLE_SITE_BUILD_STATUS_SQL,
  RETRYABLE_SITE_BUILD_REFUSAL,
  RETRYABLE_SITE_BUILD_STATUS_SQL,
  assertProviderBuildId,
  assertTrackingClaim,
  DUE_TRACKED_SITE_BUILDS_SQL,
  LEASE_TRACKED_SITE_BUILD_SQL,
  trackedCompletionStage,
  trackedOutcomeError,
  trackedSiteBuildCheck,
  trackedSiteBuildCheckUpdate,
  siteBuildPayload,
} from "@lacecms/db";
import type { DueTrackedSiteBuildRow, OutboxRow } from "@lacecms/db";
import { siteBuildId, unixMilliseconds } from "@lacecms/domain";
import type {
  SiteBuildId,
  SiteBuildProviderStage,
  TrackedSiteBuildOutcome,
  UnixMilliseconds,
} from "@lacecms/domain";
import { D1_MAX_CLAIMS_PER_CALL } from "../d1/database.js";
import { GUARD_SQL, MutationBatch } from "./batch.js";
import { D1RepositoryBase } from "./base.js";

const LEASED_SITE_BUILD_SQL =
  "select id from outbox_events where locked_by = ? and type = 'site.build.requested' and processed_at is null and locked_at > ?";

/** D1 site-build queueing, leasing and provider tracking. */
export class D1SiteBuilds
  extends D1RepositoryBase
  implements SiteBuildCommandPort, SiteBuildDispatchPort
{
  public async requestBuild(input: EnqueueSiteBuildInput): Promise<BuildQueueReceipt> {
    const batch = this.batch();
    const token = this.guard(
      batch,
      input.requestedAt,
      input.retryOfBuildId === undefined
        ? { params: [], sql: "1 = 1" }
        : {
            params: [input.retryOfBuildId],
            sql: `exists (select 1 from site_builds where id = ? and status in ${RETRYABLE_SITE_BUILD_STATUS_SQL})`,
          },
    );
    const enqueue = this.addSiteBuildEnqueue(
      batch,
      { params: [token], sql: GUARD_SQL },
      {
        reason: input.retryOfBuildId === undefined ? "manual" : "retry",
        requestedAt: input.requestedAt,
        requestedBy: input.requestedBy.id,
        retryOfBuildId: input.retryOfBuildId ?? null,
        snapshotId: null,
      },
    );
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) failure(RETRYABLE_SITE_BUILD_REFUSAL);
    return this.queueReceipt(results, enqueue);
  }

  public async claimSiteBuilds(input: {
    readonly limit: number;
    readonly now: UnixMilliseconds;
  }): Promise<readonly SiteBuildWorkLease[]> {
    if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > MAX_PAGE_SIZE)
      throw new TypeError("Build claim limit is invalid.");
    const expired = input.now - DISPATCHER_LEASE_DURATION_MS;
    const rows = await this.all<OutboxRow>(
      "select id, type, payload_json, attempts, available_at from outbox_events where type = 'site.build.requested' and processed_at is null and available_at <= ? and (locked_at is null or locked_at <= ?) order by available_at asc, id asc limit ?",
      input.now,
      expired,
      Math.min(input.limit, D1_MAX_CLAIMS_PER_CALL),
    );
    if (rows.length === 0) return Object.freeze([]);
    const batch = this.batch();
    const claims = rows.map((row) => {
      const leaseId = dispatcherLeaseId(this.nextId());
      const payload = siteBuildPayload(row.payload_json);
      const index = batch.add(
        "update outbox_events set locked_at = ?, locked_by = ? where id = ? and payload_json = ? and processed_at is null and (locked_at is null or locked_at <= ?)",
        input.now,
        leaseId,
        row.id,
        row.payload_json,
        expired,
      );
      let started: number | undefined;
      if (payload === null) {
        batch.add(
          "update outbox_events set attempts = attempts + 1, processed_at = ?, locked_at = null, locked_by = null, last_error = 'invalid_build_event' where id = ? and locked_by = ?",
          input.now,
          row.id,
          leaseId,
        );
      } else {
        batch.add(
          "insert or ignore into site_builds (id, reason, status, target_version, published_snapshot_id, requested_by, requested_at, started_at) select ?, ?, 'running', ?, (select id from content_snapshots where id = ?), ?, ?, ? where exists (select 1 from outbox_events where id = ? and locked_by = ?)",
          row.id,
          payload.reason,
          payload.targetVersion,
          typeof payload.publishedSnapshotId === "string" ? payload.publishedSnapshotId : null,
          payload.requestedBy,
          payload.requestedAt,
          input.now,
          row.id,
          leaseId,
        );
        // pending → running after a retry, or running → running when an
        // orphaned claim is recovered; the first start time is kept.
        started = batch.add(
          `update site_builds set status = 'running', started_at = coalesce(started_at, ?) where id = ? and status in ${CLAIMABLE_SITE_BUILD_STATUS_SQL} and exists (select 1 from outbox_events where id = ? and locked_by = ?)`,
          input.now,
          row.id,
          row.id,
          leaseId,
        );
        // Defensive: a terminal build never runs again; finish its stray event.
        batch.add(
          `update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ? and locked_by = ? and exists (select 1 from site_builds where id = ? and status not in ${CLAIMABLE_SITE_BUILD_STATUS_SQL})`,
          input.now,
          row.id,
          leaseId,
          row.id,
        );
      }
      return { index, leaseId, payload, row, started };
    });
    const results = await this.execute(batch, false);
    const leases: SiteBuildWorkLease[] = [];
    for (const { index, leaseId, payload, row, started } of claims) {
      if (
        payload === null ||
        started === undefined ||
        results[index]!.meta.changes !== 1 ||
        results[started]!.meta.changes !== 1
      )
        continue;
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
  }

  public async renewSiteBuildLease(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
  }): Promise<boolean> {
    return (
      (await this.run(
        "update outbox_events set locked_at = ? where locked_by = ? and type = 'site.build.requested' and processed_at is null and locked_at > ?",
        input.now,
        input.leaseId,
        input.now - DISPATCHER_LEASE_DURATION_MS,
      )) === 1
    );
  }

  public async recordSiteBuildAccepted(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly providerBuildId?: string;
  }): Promise<void> {
    if (input.providerBuildId !== undefined) assertProviderBuildId(input.providerBuildId);
    await this.finishLeasedSiteBuild(
      input,
      "Build cannot be accepted.",
      "update site_builds set status = 'accepted', provider_build_id = ?, started_at = coalesce(started_at, ?), completed_at = ?, error = null",
      [input.providerBuildId ?? null, input.now, input.now],
    );
  }

  public async recordSiteBuildTracking(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly providerBuildId: string;
  }): Promise<void> {
    assertProviderBuildId(input.providerBuildId);
    await this.finishLeasedSiteBuild(
      input,
      "Build cannot be tracked.",
      "update site_builds set provider_build_id = ?, provider_check_after = ?, error = null",
      [input.providerBuildId, input.now],
    );
  }

  public async recordSiteBuildSuccess(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
  }): Promise<void> {
    await this.finishLeasedSiteBuild(
      input,
      "Build cannot be completed.",
      "update site_builds set status = 'succeeded', started_at = coalesce(started_at, ?), completed_at = ?, error = null",
      [input.now, input.now],
    );
  }

  /** One guarded batch: the `running` build transition plus event completion. */
  private async finishLeasedSiteBuild(
    input: { readonly leaseId: DispatcherLeaseId; readonly now: UnixMilliseconds },
    refusal: string,
    update: string,
    parameters: readonly (number | string | null)[],
  ): Promise<void> {
    await this.transitionSiteBuild(input, refusal, (batch, id, token) => {
      batch.add(`${update} where id = ? and ${GUARD_SQL}`, ...parameters, id, token);
      batch.add(
        `update outbox_events set processed_at = ?, locked_at = null, locked_by = null where id = ? and ${GUARD_SQL}`,
        input.now,
        id,
        token,
      );
    });
  }

  public async recordSiteBuildFailure(input: {
    readonly leaseId: DispatcherLeaseId;
    readonly now: UnixMilliseconds;
    readonly reason: string;
    readonly path?: string;
    readonly retryAt?: UnixMilliseconds;
    readonly terminal: boolean;
  }): Promise<void> {
    const reason = sanitizeBuildReason(input.reason);
    const error = encodeBuildError(input.reason, input.path);
    await this.transitionSiteBuild(
      input,
      input.terminal ? "Build cannot be failed." : "Build cannot be retried.",
      (batch, id, token) => {
        if (input.terminal) {
          batch.add(
            `update site_builds set status = 'failed', started_at = coalesce(started_at, ?), completed_at = ?, error = ? where id = ? and ${GUARD_SQL}`,
            input.now,
            input.now,
            error,
            id,
            token,
          );
        } else {
          batch.add(
            `update site_builds set status = 'pending', error = ? where id = ? and ${GUARD_SQL}`,
            error,
            id,
            token,
          );
        }
        batch.add(
          `update outbox_events set attempts = attempts + 1, available_at = ?, processed_at = ?, locked_at = null, locked_by = null, last_error = ? where id = ? and ${GUARD_SQL}`,
          input.retryAt ?? input.now,
          input.terminal ? input.now : null,
          reason,
          id,
          token,
        );
      },
    );
  }

  public async completeTrackedSiteBuild(input: {
    readonly buildId: SiteBuildId;
    readonly providerBuildId: string;
    readonly now: UnixMilliseconds;
    readonly outcome: TrackedSiteBuildOutcome;
    readonly reason?: string;
    readonly stage?: SiteBuildProviderStage;
  }): Promise<void> {
    const error = trackedOutcomeError(input.outcome, input.reason);
    const [stage, checkedAt] = trackedCompletionStage(input.stage, input.now);
    const assertTransition = async (): Promise<boolean> => {
      const row = await this.first<{
        readonly error: string | null;
        readonly processed_at: number | null;
        readonly provider_build_id: string | null;
        readonly status: string;
      }>(
        "select b.status, b.provider_build_id, b.error, e.processed_at from site_builds b left join outbox_events e on e.id = b.id where b.id = ?",
        input.buildId,
      );
      if (row === undefined || row.provider_build_id !== input.providerBuildId)
        failure("Provider build does not match.");
      if (row.status === input.outcome && row.error === error) return false;
      if (row.status !== "running") failure("Build already has a different terminal outcome.");
      if (row.processed_at === null) failure("Build is still owned by dispatch.");
      return true;
    };
    if (!(await assertTransition())) return;
    const changed = await this.run(
      "update site_builds set status = ?, completed_at = ?, error = ?, provider_check_after = null, provider_stage = coalesce(?, provider_stage), provider_checked_at = coalesce(?, provider_checked_at) where id = ? and status = 'running' and provider_build_id = ? and exists (select 1 from outbox_events where id = site_builds.id and processed_at is not null)",
      input.outcome,
      input.now,
      error,
      stage,
      checkedAt,
      input.buildId,
      input.providerBuildId,
    );
    if (changed !== 1 && (await assertTransition()))
      failure("Build already has a different terminal outcome.");
  }

  /** One select and one guarded lease batch: two D1 queries per call. */
  public async claimTrackedSiteBuildChecks(input: {
    readonly limit: number;
    readonly leaseMs: number;
    readonly now: UnixMilliseconds;
  }): Promise<readonly TrackedSiteBuildCheck[]> {
    assertTrackingClaim(input);
    const rows = await this.all<DueTrackedSiteBuildRow>(
      DUE_TRACKED_SITE_BUILDS_SQL,
      input.now,
      input.limit,
    );
    if (rows.length === 0) return Object.freeze([]);
    const batch = this.batch();
    for (const row of rows)
      batch.add(
        LEASE_TRACKED_SITE_BUILD_SQL,
        input.now + input.leaseMs,
        row.id,
        row.provider_build_id,
        row.provider_check_after,
      );
    const results = await this.execute(batch, false);
    return Object.freeze(
      rows.filter((_row, index) => results[index]!.meta.changes === 1).map(trackedSiteBuildCheck),
    );
  }

  public async recordTrackedSiteBuildCheck(input: {
    readonly buildId: SiteBuildId;
    readonly providerBuildId: string;
    readonly now: UnixMilliseconds;
    readonly checkAfter: UnixMilliseconds;
    readonly stage?: SiteBuildProviderStage;
  }): Promise<boolean> {
    const update = trackedSiteBuildCheckUpdate(input);
    return (await this.run(update.sql, ...update.params)) === 1;
  }

  /** Applies a lease-guarded pending-build transition and ends the lease atomically. */
  private async transitionSiteBuild(
    input: { readonly leaseId: DispatcherLeaseId; readonly now: UnixMilliseconds },
    refusal: string,
    statements: (batch: MutationBatch, buildId: string, token: string) => void,
  ): Promise<void> {
    const leased = await this.first<{ readonly id: string }>(
      LEASED_SITE_BUILD_SQL,
      input.leaseId,
      input.now - DISPATCHER_LEASE_DURATION_MS,
    );
    if (leased === undefined) failure("Dispatcher lease is missing or expired.");
    const batch = this.batch();
    const token = this.guard(batch, input.now, {
      params: [leased.id, input.leaseId, input.now - DISPATCHER_LEASE_DURATION_MS, leased.id],
      sql: "exists (select 1 from outbox_events where id = ? and locked_by = ? and type = 'site.build.requested' and processed_at is null and locked_at > ?) and exists (select 1 from site_builds where id = ? and status = 'running')",
    });
    statements(batch, leased.id, token);
    this.releaseGuard(batch, token);
    const results = await this.execute(batch, false);
    if (results[0]!.meta.changes !== 1) {
      const current = await this.first(
        LEASED_SITE_BUILD_SQL,
        input.leaseId,
        input.now - DISPATCHER_LEASE_DURATION_MS,
      );
      if (current === undefined) failure("Dispatcher lease is missing or expired.");
      failure(refusal);
    }
  }
}
