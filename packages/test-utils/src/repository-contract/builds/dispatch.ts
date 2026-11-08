import { mediaId, unixMilliseconds } from "@lacecms/domain";
import {
  type RepositoryContractCase,
  admin,
  noModels,
  sequence,
  count,
  seedMedia,
  registerContract,
} from "../shared.js";

export const cases: RepositoryContractCase[] = [];
const contract = registerContract(cases);

contract(
  "coalesces manual build requests until claim and queues later work separately",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("build-event"),
      resolveModel: noModels,
    });
    const first = await repository.requestBuild({
      requestedAt: unixMilliseconds(100),
      requestedBy: admin,
    });
    const second = await repository.requestBuild({
      requestedAt: unixMilliseconds(200),
      requestedBy: admin,
    });
    expect(first).toMatchObject({ coalesced: false, targetVersion: 0 });
    expect(second).toMatchObject({ coalesced: true, eventId: first.eventId });
    expect(
      await sql.get("select available_at from outbox_events where id = ?", first.eventId),
    ).toEqual({ available_at: 5_200 });
    expect(
      await repository.claim({
        eventTypes: ["site.build.requested"],
        limit: 1,
        now: unixMilliseconds(5_199),
      }),
    ).toEqual([]);
    const claim = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(5_200) });
    expect(claim).toHaveLength(1);
    expect(claim[0]).toMatchObject({ buildId: first.eventId, targetVersion: 0 });
    expect(await sql.all("select id, status, target_version, started_at from site_builds")).toEqual(
      [{ id: first.eventId, status: "running", target_version: 0, started_at: 5_200 }],
    );
    expect(await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(5_201) })).toEqual(
      [],
    );
    const next = await repository.requestBuild({
      requestedAt: unixMilliseconds(5_201),
      requestedBy: admin,
    });
    expect(next).toMatchObject({ coalesced: false, targetVersion: 0 });
    expect(next.eventId).not.toBe(first.eventId);
    expect(
      await count(sql, "select count(*) as count from outbox_events where processed_at is null"),
    ).toBe(2);
    expect(
      await repository.renewSiteBuildLease({
        leaseId: claim[0]!.id,
        now: unixMilliseconds(45_200),
      }),
    ).toBe(true);
    const duringRenewal = await repository.claimSiteBuilds({
      limit: 1,
      now: unixMilliseconds(65_200),
    });
    expect(duringRenewal).toHaveLength(1);
    expect(duringRenewal[0]!.buildId).toBe(next.eventId);
    const recovered = await repository.claimSiteBuilds({
      limit: 1,
      now: unixMilliseconds(105_200),
    });
    expect(recovered).toHaveLength(1);
    expect(recovered[0]!.buildId).toBe(first.eventId);
    expect(recovered[0]!.id).not.toBe(claim[0]!.id);
    expect(
      await sql.get("select status, started_at from site_builds where id = ?", first.eventId),
    ).toEqual({ status: "running", started_at: 5_200 });
    expect(
      await repository.renewSiteBuildLease({
        leaseId: claim[0]!.id,
        now: unixMilliseconds(105_201),
      }),
    ).toBe(false);
    expect(await count(sql, "select count(*) as count from site_builds")).toBe(2);
  },
);

contract(
  "build outcome transitions are lease guarded and reuse one history row",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: noModels });
    const queue = async (at: number) =>
      repository.requestBuild({ requestedAt: unixMilliseconds(at), requestedBy: admin });
    const claim = async (at: number) =>
      (await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(at) }))[0]!;
    const first = await queue(1);
    const lease = await claim(5_001);
    expect(
      await sql.get("select status, started_at from site_builds where id = ?", first.eventId),
    ).toEqual({ status: "running", started_at: 5_001 });
    await repository.recordSiteBuildFailure({
      leaseId: lease.id,
      now: unixMilliseconds(5_002),
      reason: "secret=https://example.test",
      retryAt: unixMilliseconds(10_002),
      terminal: false,
    });
    expect(
      await sql.get("select status, error from site_builds where id = ?", first.eventId),
    ).toEqual({ status: "pending", error: "provider_failed" });
    const recovered = await claim(10_002);
    expect(recovered.buildId).toBe(first.eventId);
    expect(
      await sql.get("select status, started_at from site_builds where id = ?", first.eventId),
    ).toEqual({ status: "running", started_at: 5_001 });
    await expect(
      repository.recordSiteBuildSuccess({ leaseId: lease.id, now: unixMilliseconds(10_003) }),
    ).rejects.toThrow("expired");
    await repository.recordSiteBuildTracking({
      leaseId: recovered.id,
      now: unixMilliseconds(10_003),
      providerBuildId: "provider-1",
    });
    await expect(
      repository.recordSiteBuildTracking({
        leaseId: recovered.id,
        now: unixMilliseconds(10_003),
        providerBuildId: "provider-2",
      }),
    ).rejects.toThrow("expired");
    expect(
      await sql.get(
        "select status, provider_build_id, started_at, provider_check_after from site_builds where id = ?",
        first.eventId,
      ),
    ).toEqual({
      status: "running",
      provider_build_id: "provider-1",
      started_at: 5_001,
      provider_check_after: 10_003,
    });
    for (const now of [10_004, 10_005]) {
      await repository.completeTrackedSiteBuild({
        buildId: recovered.buildId,
        providerBuildId: "provider-1",
        now: unixMilliseconds(now),
        outcome: "succeeded",
      });
    }
    await expect(
      repository.completeTrackedSiteBuild({
        buildId: recovered.buildId,
        providerBuildId: "provider-1",
        now: unixMilliseconds(10_006),
        outcome: "failed",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      repository.completeTrackedSiteBuild({
        buildId: recovered.buildId,
        providerBuildId: "other",
        now: unixMilliseconds(10_006),
        outcome: "succeeded",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(
      await sql.get(
        "select status, completed_at, provider_check_after from site_builds where id = ?",
        first.eventId,
      ),
    ).toEqual({ status: "succeeded", completed_at: 10_004, provider_check_after: null });

    const second = await queue(20_000);
    const terminal = await claim(25_000);
    await repository.recordSiteBuildFailure({
      leaseId: terminal.id,
      now: unixMilliseconds(25_001),
      reason: "trigger_unavailable",
      terminal: true,
    });
    expect(
      await sql.get(
        "select status, completed_at, error from site_builds where id = ?",
        second.eventId,
      ),
    ).toEqual({ status: "failed", completed_at: 25_001, error: "trigger_unavailable" });
    expect(await repository.listSiteBuilds(50)).toMatchObject([
      {
        completedAt: 25_001,
        error: "trigger_unavailable",
        id: second.eventId,
        requestedAt: 20_000,
        startedAt: 25_000,
        status: "failed",
        targetVersion: 0,
      },
      {
        completedAt: 10_004,
        id: first.eventId,
        providerBuildId: "provider-1",
        startedAt: 5_001,
        status: "succeeded",
      },
    ]);
    expect(await repository.getSiteBuild(first.eventId as never)).toMatchObject({
      id: first.eventId,
      providerBuildId: "provider-1",
    });
    expect(await repository.getSiteBuild("missing" as never)).toBeNull();
    expect(
      await sql.get(
        "select attempts, processed_at from outbox_events where id = ?",
        second.eventId,
      ),
    ).toEqual({ attempts: 1, processed_at: 25_001 });
    await sql.run(
      "insert into published_state (singleton_key, version, updated_at) values (1, 9, 25002)",
    );
    const retry = await repository.requestBuild({
      requestedAt: unixMilliseconds(25_003),
      requestedBy: admin,
      retryOfBuildId: second.eventId as never,
    });
    expect(retry).toMatchObject({ coalesced: false, targetVersion: 9 });
    const coalescedRetry = await repository.requestBuild({
      requestedAt: unixMilliseconds(25_004),
      requestedBy: admin,
    });
    expect(coalescedRetry).toMatchObject({ coalesced: true, eventId: retry.eventId });
    const payload = await sql.get<{ payload_json: string }>(
      "select payload_json from outbox_events where id = ?",
      retry.eventId,
    );
    expect(JSON.parse(payload!.payload_json)).toEqual({
      publishedSnapshotId: null,
      reason: "manual",
      requestedAt: 25_004,
      requestedBy: "admin",
      retryOfBuildId: second.eventId,
      targetVersion: 9,
    });
    await expect(
      repository.requestBuild({
        requestedAt: unixMilliseconds(25_005),
        requestedBy: admin,
        retryOfBuildId: first.eventId as never,
      }),
    ).rejects.toThrow("can be retried");
  },
);

contract(
  "provider acceptance, tracked outcomes and retry sources never overstate publication",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("outcome"),
      resolveModel: noModels,
    });
    let clock = 0;
    const dispatch = async () => {
      clock += 10_000;
      const request = await repository.requestBuild({
        requestedAt: unixMilliseconds(clock),
        requestedBy: admin,
      });
      clock += 5_000;
      const [lease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(clock) });
      expect(lease!.buildId).toBe(request.eventId);
      return lease!;
    };
    const status = async (id: string) =>
      sql.get<{
        status: string;
        provider_build_id: string | null;
        completed_at: number | null;
        error: string | null;
      }>("select status, provider_build_id, completed_at, error from site_builds where id = ?", id);

    const bare = await dispatch();
    await repository.recordSiteBuildAccepted({ leaseId: bare.id, now: unixMilliseconds(clock) });
    expect(await status(bare.buildId)).toEqual({
      status: "accepted",
      provider_build_id: null,
      completed_at: clock,
      error: null,
    });
    expect(
      await repository.claimSiteBuilds({ limit: 10, now: unixMilliseconds(clock + 120_000) }),
    ).toEqual([]);

    const identified = await dispatch();
    await repository.recordSiteBuildAccepted({
      leaseId: identified.id,
      now: unixMilliseconds(clock),
      providerBuildId: "dep-accepted",
    });
    expect(await status(identified.buildId)).toMatchObject({
      status: "accepted",
      provider_build_id: "dep-accepted",
    });
    await expect(
      repository.completeTrackedSiteBuild({
        buildId: identified.buildId,
        providerBuildId: "dep-accepted",
        now: unixMilliseconds(clock + 1),
        outcome: "succeeded",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await status(identified.buildId)).toMatchObject({ status: "accepted" });

    const lost = await dispatch();
    await repository.recordSiteBuildTracking({
      leaseId: lost.id,
      now: unixMilliseconds(clock),
      providerBuildId: "dep-lost",
    });
    const lostAt = clock + 1;
    for (let repeat = 0; repeat < 2; repeat += 1)
      await repository.completeTrackedSiteBuild({
        buildId: lost.buildId,
        providerBuildId: "dep-lost",
        now: unixMilliseconds(lostAt + repeat),
        outcome: "unknown",
        reason: "ignored for unknown",
      });
    await expect(
      repository.completeTrackedSiteBuild({
        buildId: lost.buildId,
        providerBuildId: "dep-lost",
        now: unixMilliseconds(lostAt + 5),
        outcome: "succeeded",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await status(lost.buildId)).toEqual({
      status: "unknown",
      provider_build_id: "dep-lost",
      completed_at: lostAt,
      error: null,
    });

    const skipped = await dispatch();
    await repository.recordSiteBuildTracking({
      leaseId: skipped.id,
      now: unixMilliseconds(clock),
      providerBuildId: "dep-skipped",
    });
    await repository.completeTrackedSiteBuild({
      buildId: skipped.buildId,
      providerBuildId: "dep-skipped",
      now: unixMilliseconds(clock + 1),
      outcome: "cancelled",
    });
    const broken = await dispatch();
    await repository.recordSiteBuildTracking({
      leaseId: broken.id,
      now: unixMilliseconds(clock),
      providerBuildId: "dep-broken",
    });
    await repository.completeTrackedSiteBuild({
      buildId: broken.buildId,
      providerBuildId: "dep-broken",
      now: unixMilliseconds(clock + 1),
      outcome: "failed",
      reason: "secret provider text",
    });
    expect(await status(broken.buildId)).toMatchObject({
      status: "failed",
      error: "provider_failed",
    });

    const owned = await dispatch();
    await sql.run(
      "update site_builds set provider_build_id = 'dep-owned' where id = ?",
      owned.buildId,
    );
    await expect(
      repository.completeTrackedSiteBuild({
        buildId: owned.buildId,
        providerBuildId: "dep-owned",
        now: unixMilliseconds(clock),
        outcome: "succeeded",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await status(owned.buildId)).toMatchObject({ status: "running" });
    await expect(
      repository.recordSiteBuildAccepted({
        leaseId: owned.id,
        now: unixMilliseconds(clock),
        providerBuildId: "",
      }),
    ).rejects.toThrow("Provider build ID is invalid.");

    for (const source of [owned.buildId, "missing"])
      await expect(
        repository.requestBuild({
          requestedAt: unixMilliseconds(clock),
          requestedBy: admin,
          retryOfBuildId: source as never,
        }),
      ).rejects.toThrow("can be retried");
    const unprocessed = await count(
      sql,
      "select count(*) as count from outbox_events where processed_at is null and locked_at is null",
    );
    expect(unprocessed).toBe(0);
    for (const source of [bare, lost, skipped, broken]) {
      const receipt = await repository.requestBuild({
        requestedAt: unixMilliseconds(clock),
        requestedBy: admin,
        retryOfBuildId: source.buildId,
      });
      expect(receipt.eventId).not.toBe(source.buildId);
    }
    expect(await status(bare.buildId)).toMatchObject({ status: "accepted" });
    expect(await status(lost.buildId)).toMatchObject({ status: "unknown" });
    expect(await status(skipped.buildId)).toMatchObject({ status: "cancelled" });
    expect((await repository.getSiteBuild(skipped.buildId))?.status).toBe("cancelled");
  },
);

contract(
  "tracking checks are leased, provider guarded and record stages without touching other builds",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("track"),
      resolveModel: noModels,
    });
    let clock = 0;
    const track = async (providerBuildId: string) => {
      clock += 10_000;
      await repository.requestBuild({ requestedAt: unixMilliseconds(clock), requestedBy: admin });
      clock += 5_000;
      const [lease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(clock) });
      await repository.recordSiteBuildTracking({
        leaseId: lease!.id,
        now: unixMilliseconds(clock),
        providerBuildId,
      });
      return { buildId: lease!.buildId, startedAt: clock };
    };
    const row = async (id: string) =>
      sql.get(
        "select status, provider_stage, provider_checked_at, provider_check_after, error from site_builds where id = ?",
        id,
      );
    const a = await track("dep-a");
    const b = await track("dep-b");
    // A running build still owned by dispatch is never offered for checks.
    clock += 10_000;
    await repository.requestBuild({ requestedAt: unixMilliseconds(clock), requestedBy: admin });
    clock += 5_000;
    const [owned] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(clock) });
    await sql.run(
      "update site_builds set provider_build_id = 'dep-owned', provider_check_after = 0 where id = ?",
      owned!.buildId,
    );

    const now = unixMilliseconds(clock);
    await expect(
      repository.claimTrackedSiteBuildChecks({ leaseMs: 60_000, limit: 0, now }),
    ).rejects.toThrow("Tracking claim limit is invalid.");
    const first = await repository.claimTrackedSiteBuildChecks({ leaseMs: 60_000, limit: 25, now });
    expect(first).toEqual([
      { buildId: a.buildId, providerBuildId: "dep-a", trackingStartedAt: a.startedAt },
      { buildId: b.buildId, providerBuildId: "dep-b", trackingStartedAt: b.startedAt },
    ]);
    // The check lease makes each build exclusive until it expires.
    expect(
      await repository.claimTrackedSiteBuildChecks({ leaseMs: 60_000, limit: 25, now }),
    ).toEqual([]);
    expect(await row(a.buildId)).toMatchObject({ provider_check_after: clock + 60_000 });

    expect(
      await repository.recordTrackedSiteBuildCheck({
        buildId: a.buildId,
        checkAfter: unixMilliseconds(clock + 30_000),
        now,
        providerBuildId: "dep-a",
        stage: "build",
      }),
    ).toBe(true);
    expect(
      await repository.recordTrackedSiteBuildCheck({
        buildId: a.buildId,
        checkAfter: unixMilliseconds(clock + 1),
        now,
        providerBuildId: "dep-b",
        stage: "deploy",
      }),
    ).toBe(false);
    expect(await row(a.buildId)).toEqual({
      status: "running",
      provider_stage: "build",
      provider_checked_at: clock,
      provider_check_after: clock + 30_000,
      error: null,
    });
    // A transient check moves only the next due time.
    expect(
      await repository.recordTrackedSiteBuildCheck({
        buildId: a.buildId,
        checkAfter: unixMilliseconds(clock + 45_000),
        now: unixMilliseconds(clock + 1),
        providerBuildId: "dep-a",
      }),
    ).toBe(true);
    expect(await row(a.buildId)).toMatchObject({
      provider_stage: "build",
      provider_checked_at: clock,
      provider_check_after: clock + 45_000,
    });

    await repository.completeTrackedSiteBuild({
      buildId: b.buildId,
      now: unixMilliseconds(clock + 2),
      outcome: "succeeded",
      providerBuildId: "dep-b",
      stage: "deploy",
    });
    expect(await row(b.buildId)).toEqual({
      status: "succeeded",
      provider_stage: "deploy",
      provider_checked_at: clock + 2,
      provider_check_after: null,
      error: null,
    });
    expect(await repository.getSiteBuild(b.buildId)).toMatchObject({
      providerCheckedAt: clock + 2,
      providerStage: "deploy",
      status: "succeeded",
    });
    expect(await row(a.buildId)).toMatchObject({ status: "running", provider_stage: "build" });
    // Terminal rows never accept check records and are never due again.
    expect(
      await repository.recordTrackedSiteBuildCheck({
        buildId: b.buildId,
        checkAfter: unixMilliseconds(clock + 3),
        now: unixMilliseconds(clock + 3),
        providerBuildId: "dep-b",
        stage: "build",
      }),
    ).toBe(false);

    // After the lease and next check, A is due again with its last successful check.
    const later = unixMilliseconds(clock + 120_000);
    expect(
      await repository.claimTrackedSiteBuildChecks({ leaseMs: 60_000, limit: 25, now: later }),
    ).toEqual([
      {
        buildId: a.buildId,
        lastCheckedAt: clock,
        providerBuildId: "dep-a",
        trackingStartedAt: a.startedAt,
      },
    ]);
    await repository.completeTrackedSiteBuild({
      buildId: a.buildId,
      now: later,
      outcome: "unknown",
      providerBuildId: "dep-a",
      reason: "tracking_timeout",
    });
    await repository.completeTrackedSiteBuild({
      buildId: a.buildId,
      now: unixMilliseconds(later + 1),
      outcome: "unknown",
      providerBuildId: "dep-a",
      reason: "tracking_timeout",
      stage: "deploy",
    });
    await expect(
      repository.completeTrackedSiteBuild({
        buildId: a.buildId,
        now: unixMilliseconds(later + 2),
        outcome: "succeeded",
        providerBuildId: "dep-a",
        stage: "deploy",
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    expect(await row(a.buildId)).toEqual({
      status: "unknown",
      provider_stage: "build",
      provider_checked_at: clock,
      provider_check_after: null,
      error: "tracking_timeout",
    });
    expect(await repository.getSiteBuild(a.buildId)).toMatchObject({ error: "tracking_timeout" });
    expect(
      await repository.claimTrackedSiteBuildChecks({
        leaseMs: 60_000,
        limit: 25,
        now: unixMilliseconds(later + 600_000),
      }),
    ).toEqual([]);
    expect(await row(owned!.buildId)).toMatchObject({ status: "running" });
  },
);

contract(
  "tracked completions store only their outcome's closed reasons",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("reason"),
      resolveModel: noModels,
    });
    let clock = 0;
    const cases = [
      ["failed", "provider_deploy_failed", "provider_deploy_failed"],
      ["failed", "tracking_timeout", "provider_failed"],
      ["cancelled", "provider_skipped", "provider_skipped"],
      ["cancelled", "provider_build_failed", null],
      ["unknown", "tracking_forbidden", "tracking_forbidden"],
      ["unknown", "provider_cancelled", null],
      ["succeeded", "provider_failed", null],
    ] as const;
    for (const [outcome, reason, stored] of cases) {
      clock += 10_000;
      await repository.requestBuild({ requestedAt: unixMilliseconds(clock), requestedBy: admin });
      clock += 5_000;
      const [lease] = await repository.claimSiteBuilds({ limit: 1, now: unixMilliseconds(clock) });
      await repository.recordSiteBuildTracking({
        leaseId: lease!.id,
        now: unixMilliseconds(clock),
        providerBuildId: `dep-${clock}`,
      });
      await repository.completeTrackedSiteBuild({
        buildId: lease!.buildId,
        now: unixMilliseconds(clock),
        outcome,
        providerBuildId: `dep-${clock}`,
        reason,
      });
      expect(
        await sql.get("select status, error from site_builds where id = ?", lease!.buildId),
      ).toEqual({ status: outcome, error: stored });
    }
  },
);

contract(
  "a stray event for a terminal build is finished without dispatch",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: noModels });
    await sql.run(
      "insert into site_builds (id, reason, status, target_version, requested_by, requested_at, started_at, completed_at) values ('stray', 'manual', 'accepted', 0, 'admin', 1, 1, 2)",
    );
    await sql.run(
      `insert into outbox_events (id, type, payload_json, available_at, created_at) values ('stray', 'site.build.requested', '{"publishedSnapshotId":null,"reason":"manual","requestedAt":1,"requestedBy":"admin","targetVersion":0}', 1, 1)`,
    );
    expect(await repository.claimSiteBuilds({ limit: 10, now: unixMilliseconds(10) })).toEqual([]);
    expect(
      await sql.get("select processed_at, locked_by from outbox_events where id = 'stray'"),
    ).toEqual({ processed_at: 10, locked_by: null });
    expect(
      await sql.get("select status, started_at, completed_at from site_builds where id = 'stray'"),
    ).toEqual({ status: "accepted", started_at: 1, completed_at: 2 });
  },
);

contract(
  "marks malformed build events invalid without creating history",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: noModels });
    await sql.run(
      "insert into outbox_events (id, type, payload_json, available_at, created_at) values ('bad-build', 'site.build.requested', '{}', 1, 1)",
    );
    expect(await repository.claimSiteBuilds({ limit: 10, now: unixMilliseconds(2) })).toEqual([]);
    expect(
      await sql.get("select attempts, last_error, processed_at, locked_by from outbox_events"),
    ).toEqual({ attempts: 1, last_error: "invalid_build_event", locked_by: null, processed_at: 2 });
    expect(await count(sql, "select count(*) as count from site_builds")).toBe(0);
  },
);

contract(
  "claims media deletion work exclusively and finalizes or exposes terminal failure",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({
      nextId: sequence("event"),
      resolveModel: noModels,
    });
    const insert = async (id: string, attempts = 0) => {
      await seedMedia(sql, id, "deleting");
      await sql.run(
        "insert into outbox_events (id, type, payload_json, attempts, available_at, created_at) values (?, 'media.delete.requested', ?, ?, 1, 1)",
        `outbox-${id}`,
        JSON.stringify({ mediaId: id }),
        attempts,
      );
    };
    const claim = async (now: number) =>
      repository.claim({
        eventTypes: ["media.delete.requested"],
        limit: 1,
        now: unixMilliseconds(now),
      });
    await insert("media-success");
    const first = await claim(1);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      event: { attempts: 0, payload: { mediaId: "media-success" } },
      expiresAt: 60_001,
    });
    await expect(claim(2)).resolves.toEqual([]);
    await expect(
      repository.completeMediaDeletion({
        completedAt: unixMilliseconds(2),
        leaseId: first[0]!.id,
        mediaId: mediaId("other-media"),
      }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(repository.loadDeletingMedia(mediaId("media-success"))).resolves.toMatchObject({
      status: "deleting",
    });
    await repository.completeMediaDeletion({
      completedAt: unixMilliseconds(2),
      leaseId: first[0]!.id,
      mediaId: mediaId("media-success"),
    });
    expect(await count(sql, "select count(*) as count from media")).toBe(0);
    expect(await sql.get("select processed_at, locked_by from outbox_events")).toEqual({
      locked_by: null,
      processed_at: 2,
    });
    await expect(
      repository.completeMediaDeletion({
        completedAt: unixMilliseconds(3),
        leaseId: first[0]!.id,
        mediaId: mediaId("media-success"),
      }),
    ).rejects.toThrow("expired");

    await insert("media-retry");
    const retryLease = await claim(3);
    await repository.failMediaDeletion({
      failedAt: unixMilliseconds(4),
      leaseId: retryLease[0]!.id,
      mediaId: mediaId("media-retry"),
      retryAt: unixMilliseconds(100),
      sanitizedError: "temporary",
      terminal: false,
    });
    expect(
      await sql.get(
        "select attempts, available_at, last_error, locked_by from outbox_events where id = 'outbox-media-retry'",
      ),
    ).toEqual({ attempts: 1, available_at: 100, last_error: "temporary", locked_by: null });
    expect((await repository.loadMedia("media-retry"))?.status).toBe("deleting");

    await insert("media-terminal", 7);
    const terminal = await claim(5);
    expect(terminal[0]!.event.id).toBe("outbox-media-terminal");
    await repository.failMediaDeletion({
      failedAt: unixMilliseconds(6),
      leaseId: terminal[0]!.id,
      mediaId: mediaId("media-terminal"),
      sanitizedError: "endpoint\nsecret",
      terminal: true,
    });
    expect(
      await sql.get("select status, last_error from media where id = 'media-terminal'"),
    ).toEqual({ last_error: "endpoint secret", status: "delete_failed" });
    await repository.retryDeletion({
      mediaId: mediaId("media-terminal"),
      requestedAt: unixMilliseconds(7),
      requestedBy: admin,
    });
    expect(
      await sql.get("select status, last_error from media where id = 'media-terminal'"),
    ).toEqual({ last_error: null, status: "deleting" });
    await expect(repository.loadDeletingMedia(mediaId("missing"))).resolves.toBeNull();
  },
);

contract(
  "retires the outbox lease after a completed or failed dispatcher attempt",
  async (runtime, expect) => {
    const { repository, sql } = await runtime.open({ resolveModel: noModels });
    for (const id of ["one", "two"]) {
      await sql.run(
        "insert into outbox_events (id, type, payload_json, attempts, available_at, created_at) values (?, 'custom.event', '{}', 0, 1, 1)",
        id,
      );
    }
    const leases = await repository.claim({
      eventTypes: ["custom.event"],
      limit: 10,
      now: unixMilliseconds(10),
    });
    expect(leases.map((lease) => lease.event.id)).toEqual(["one", "two"]);
    await repository.complete({
      completedAt: unixMilliseconds(11),
      leaseId: leases[0]!.id,
      outcome: "succeeded",
    });
    await repository.retry({
      error: "line\nbreak",
      failedAt: unixMilliseconds(11),
      leaseId: leases[1]!.id,
      retryAt: unixMilliseconds(50),
    });
    await expect(
      repository.complete({
        completedAt: unixMilliseconds(12),
        leaseId: leases[0]!.id,
        outcome: "succeeded",
      }),
    ).rejects.toThrow("expired");
    expect(
      await sql.all(
        "select id, attempts, available_at, processed_at, last_error from outbox_events order by id",
      ),
    ).toEqual([
      { attempts: 0, available_at: 1, id: "one", last_error: null, processed_at: 11 },
      { attempts: 1, available_at: 50, id: "two", last_error: "line break", processed_at: null },
    ]);
    await expect(
      repository.claim({ eventTypes: [], limit: 1, now: unixMilliseconds(1) }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
    await expect(
      repository.claim({ eventTypes: ["custom.event"], limit: 0, now: unixMilliseconds(1) }),
    ).rejects.toMatchObject({ code: "CONTENT_INVALID_STATE" });
  },
);
