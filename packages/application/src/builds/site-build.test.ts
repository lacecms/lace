import type {
  BuildTriggerResult,
  EnqueueSiteBuildInput,
  ProviderDeploymentObservation,
  TrackedSiteBuildCheck,
} from "../ports/builds.js";
import { buildWorkPort } from "../test-support/build-port.js";
import type { UnixMilliseconds } from "@lacecms/domain";
import { actorId, attenuateActor, siteBuildId } from "@lacecms/domain";
import { expect, test, vi } from "vitest";
import {
  dispatcherEventId,
  dispatcherLeaseId,
  dispatcherRetryDelay,
  DISPATCHER_LEASE_DURATION_MS,
  readBuildSite,
  SITE_BUILD_DEBOUNCE_MS,
  siteBuildRetryPolicy,
  SiteBuildDispatcher,
  SiteBuildTracker,
  SiteBuildUseCases,
} from "../index.js";
import { DomainError } from "@lacecms/domain";
import { unixMilliseconds } from "@lacecms/domain";

test("site-build timing follows the fixed architecture defaults", () => {
  expect(SITE_BUILD_DEBOUNCE_MS).toBe(5_000);
  expect(DISPATCHER_LEASE_DURATION_MS).toBe(60_000);
  expect(siteBuildRetryPolicy).toEqual({ baseDelayMs: 5_000, maxAttempts: 8, maxDelayMs: 900_000 });
  expect(dispatcherRetryDelay(siteBuildRetryPolicy, 1, 0)).toBe(0);
  expect(dispatcherRetryDelay(siteBuildRetryPolicy, 1, 0.999)).toBeLessThanOrEqual(5_000);
  expect(dispatcherRetryDelay(siteBuildRetryPolicy, 8, 0.999)).toBeLessThanOrEqual(640_000);
  expect(dispatcherRetryDelay(siteBuildRetryPolicy, 99, 0.999)).toBeLessThanOrEqual(900_000);
});

test("site selection and history are available only to signed-in content readers", async () => {
  const listSiteBuilds = vi.fn(async () => ({ items: [] }));
  const getSiteBuild = vi.fn(async () => null);
  const requestBuild = vi.fn(async () => ({
    eventId: dispatcherEventId("event"),
    coalesced: false,
    targetVersion: 1,
  }));
  const useCases = new SiteBuildUseCases({
    clock: { now: () => unixMilliseconds(42) },
    builds: { listSiteBuilds, getSiteBuild, requestBuild },
  });
  const site = { id: "site", label: "Site" };
  const delegated = attenuateActor(
    { id: actorId("admin"), role: "admin" },
    {
      permissions: ["content:read", "settings:manage"],
      operations: [],
    },
  );
  const prepare = vi.fn(async () => "build-1");
  expect(() => readBuildSite(delegated, site)).toThrow(DomainError);
  expect(() => useCases.list(delegated, { limit: 50 })).toThrow(DomainError);
  expect(() => useCases.get(delegated, "build-1")).toThrow(DomainError);
  expect(() => useCases.retry(delegated, prepare)).toThrow(DomainError);
  for (const port of [listSiteBuilds, getSiteBuild, requestBuild, prepare])
    expect(port).not.toHaveBeenCalled();
  for (const role of ["admin", "editor", "viewer"] as const) {
    const actor = { id: actorId(role), role };
    expect(readBuildSite(actor, site)).toEqual(site);
    await expect(useCases.list(actor, { limit: 50 })).resolves.toEqual({ items: [] });
    await expect(useCases.get(actor, "build-1")).resolves.toBeNull();
  }
});

test("only administrators can enqueue manual or retry build commands", async () => {
  const calls: EnqueueSiteBuildInput[] = [];
  const useCases = new SiteBuildUseCases({
    clock: { now: () => unixMilliseconds(42) },
    builds: {
      listSiteBuilds: () => {
        throw new Error("Unexpected listSiteBuilds");
      },
      getSiteBuild: () => {
        throw new Error("Unexpected getSiteBuild");
      },
      requestBuild: async (input) => {
        calls.push(input);
        return { coalesced: false, eventId: dispatcherEventId("event-1"), targetVersion: 3 };
      },
    },
  });
  const admin = { id: actorId("admin-1"), role: "admin" as const };
  await expect(useCases.request(admin)).resolves.toMatchObject({ targetVersion: 3 });
  await expect(useCases.retry(admin, "failed-1")).resolves.toMatchObject({ targetVersion: 3 });
  expect(calls).toMatchObject([
    {
      requestedAt: 42,
      events: [
        {
          type: "site.build.requested",
          payload: {
            reason: "manual",
            requestedAt: 42,
            requestedBy: "admin-1",
            publishedSnapshotId: null,
          },
        },
      ],
    },
    {
      events: [
        {
          type: "site.build.requested",
          payload: {
            reason: "retry",
            requestedAt: 42,
            requestedBy: "admin-1",
            publishedSnapshotId: null,
            retryOfBuildId: "failed-1",
          },
        },
      ],
    },
  ]);
  for (const role of ["editor", "viewer"] as const) {
    expect(() => useCases.request({ id: actorId(role), role })).toThrow(DomainError);
    expect(() => useCases.retry({ id: actorId(role), role }, "failed-1")).toThrow(DomainError);
  }
  expect(calls).toHaveLength(2);
});

test("site-build dispatcher maps every trigger result to one truthful lifecycle write", async () => {
  const lease = (id: string) =>
    Object.freeze({
      buildId: siteBuildId(id),
      event: {
        attempts: 0,
        availableAt: unixMilliseconds(0),
        id: dispatcherEventId(id),
        payload: {},
        type: "site.build.requested",
      },
      expiresAt: unixMilliseconds(60_000),
      id: dispatcherLeaseId(`lease-${id}`),
      targetVersion: 3,
    });
  const results: Record<string, BuildTriggerResult> = {
    accepted: { status: "accepted" },
    acceptedWithId: { status: "accepted", providerBuildId: "dep-1" },
    failed: { status: "failed", reason: "source_missing", path: "pnpm-lock.yaml" },
    succeeded: { status: "succeeded" },
    tracking: { status: "tracking", providerBuildId: "dep-2" },
  };
  const writes: [string, unknown][] = [];
  const work = buildWorkPort({
    claimSiteBuilds: async () => Object.keys(results).map(lease),
    renewSiteBuildLease: async () => true,
    recordSiteBuildAccepted: async (input) => {
      writes.push(["accepted", input]);
    },
    recordSiteBuildTracking: async (input) => {
      writes.push(["tracking", input]);
    },
    recordSiteBuildSuccess: async (input) => {
      writes.push(["succeeded", input]);
    },
    recordSiteBuildFailure: async (input) => {
      writes.push(["failed", input]);
    },
    completeTrackedSiteBuild: async () => {
      throw new Error("dispatch never completes tracked builds");
    },
  });
  const dispatcher = new SiteBuildDispatcher({
    clock: { now: () => unixMilliseconds(7) },
    logger: { error: () => undefined },
    random: () => 0,
    trigger: {
      trigger: async ({ buildId }) => {
        const result = results[buildId];
        if (!result) throw new Error("Unknown build");
        return result;
      },
    },
    work,
  });
  await dispatcher.runOnce();
  expect(writes).toEqual([
    ["accepted", { leaseId: "lease-accepted", now: 7 }],
    ["accepted", { leaseId: "lease-acceptedWithId", now: 7, providerBuildId: "dep-1" }],
    [
      "failed",
      {
        leaseId: "lease-failed",
        now: 7,
        path: "pnpm-lock.yaml",
        reason: "source_missing",
        retryAt: 7,
        terminal: false,
      },
    ],
    ["succeeded", { leaseId: "lease-succeeded", now: 7 }],
    ["tracking", { leaseId: "lease-tracking", now: 7, providerBuildId: "dep-2" }],
  ]);
});

function trackingFixture({
  checks,
  observations,
  reader = "fake",
  timeoutMs,
  nowAt = 0,
}: {
  checks: TrackedSiteBuildCheck[];
  observations: Record<string, ProviderDeploymentObservation | Error>;
  reader?: "fake" | null;
  timeoutMs?: number;
  nowAt?: number;
}) {
  const writes: [string, unknown][] = [];
  const logs: { readonly buildId: string; readonly reason: string }[] = [];
  let now = nowAt;
  const work = buildWorkPort({
    claimTrackedSiteBuildChecks: async (input) => {
      writes.push(["claim", input]);
      return checks;
    },
    recordTrackedSiteBuildCheck: async (input) => {
      writes.push(["check", input]);
      return true;
    },
    completeTrackedSiteBuild: async (input) => {
      writes.push(["complete", input]);
      if (input.buildId === "conflict")
        throw new DomainError("CONTENT_INVALID_STATE", "Build already has a different outcome.");
    },
  });
  const tracker = new SiteBuildTracker({
    clock: { now: () => unixMilliseconds(now) },
    logger: { error: (entry) => logs.push(entry) },
    ...(reader === null
      ? {}
      : {
          reader: {
            read: async (id) => {
              const value = observations[id];
              if (value instanceof Error) throw value;
              if (!value) throw new Error("Missing observation");
              return value;
            },
          },
        }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    work,
  });
  return {
    logs,
    setNow: (value: number) => {
      now = value;
    },
    tracker,
    writes,
  };
}

const check = (
  id: string,
  extra: { trackingStartedAt?: number; lastCheckedAt?: number } = {},
): TrackedSiteBuildCheck => ({
  buildId: siteBuildId(id),
  providerBuildId: `dep-${id}`,
  // A negative origin models a deadline that began before the synthetic clock.
  trackingStartedAt: (extra.trackingStartedAt ?? 0) as UnixMilliseconds,
  ...(extra.lastCheckedAt === undefined
    ? {}
    : { lastCheckedAt: unixMilliseconds(extra.lastCheckedAt) }),
});

test("site-build tracker maps observations to proven outcomes and later checks", async () => {
  const fixture = trackingFixture({
    checks: [
      check("ok"),
      check("broken"),
      check("skipped"),
      check("denied"),
      check("rejected"),
      check("building", { lastCheckedAt: 50_000 }),
      check("thrown"),
      check("conflict"),
      check("young-missing"),
    ],
    nowAt: 100_000,
    observations: {
      "dep-ok": { kind: "outcome", outcome: "succeeded", stage: "deploy" },
      "dep-broken": {
        kind: "outcome",
        outcome: "failed",
        reason: "provider_build_failed",
        stage: "build",
      },
      "dep-skipped": {
        kind: "outcome",
        outcome: "cancelled",
        reason: "provider_skipped",
        stage: "queued",
      },
      "dep-denied": { kind: "forbidden" },
      "dep-rejected": { kind: "rejected" },
      "dep-building": { kind: "progress", stage: "build" },
      "dep-thrown": new Error("secret token"),
      "dep-conflict": { kind: "outcome", outcome: "succeeded", stage: "deploy" },
      "dep-young-missing": { kind: "not_found" },
    },
  });
  await fixture.tracker.runOnce(9);
  const [claim, ...rest] = fixture.writes;
  expect(claim).toEqual(["claim", { leaseMs: 60_000, limit: 9, now: 100_000 }]);
  const base = { now: 100_000 };
  expect(rest).toEqual([
    [
      "complete",
      { ...base, buildId: "ok", outcome: "succeeded", providerBuildId: "dep-ok", stage: "deploy" },
    ],
    [
      "complete",
      {
        ...base,
        buildId: "broken",
        outcome: "failed",
        providerBuildId: "dep-broken",
        reason: "provider_build_failed",
        stage: "build",
      },
    ],
    [
      "complete",
      {
        ...base,
        buildId: "skipped",
        outcome: "cancelled",
        providerBuildId: "dep-skipped",
        reason: "provider_skipped",
        stage: "queued",
      },
    ],
    [
      "complete",
      {
        ...base,
        buildId: "denied",
        outcome: "unknown",
        providerBuildId: "dep-denied",
        reason: "tracking_forbidden",
      },
    ],
    [
      "complete",
      {
        ...base,
        buildId: "rejected",
        outcome: "unknown",
        providerBuildId: "dep-rejected",
        reason: "tracking_rejected",
      },
    ],
    [
      "check",
      {
        ...base,
        buildId: "building",
        checkAfter: 130_000,
        providerBuildId: "dep-building",
        stage: "build",
      },
    ],
    // Transient: the gap since tracking start (100 s) becomes the next delay.
    ["check", { ...base, buildId: "thrown", checkAfter: 200_000, providerBuildId: "dep-thrown" }],
    [
      "complete",
      {
        ...base,
        buildId: "conflict",
        outcome: "succeeded",
        providerBuildId: "dep-conflict",
        stage: "deploy",
      },
    ],
    // Not found inside the 5-minute grace is retried like a transient error.
    [
      "check",
      {
        ...base,
        buildId: "young-missing",
        checkAfter: 200_000,
        providerBuildId: "dep-young-missing",
      },
    ],
  ]);
  expect(fixture.logs).toContainEqual({ buildId: "conflict", reason: "tracking_conflict" });
  expect(fixture.logs).toContainEqual({ buildId: "broken", reason: "provider_build_failed" });
  expect(JSON.stringify(fixture.logs)).not.toContain("secret");
});

test("site-build tracker enforces grace, backoff bounds and the overall deadline", async () => {
  const minute = 60_000;
  const fixture = trackingFixture({
    checks: [
      check("old-missing"),
      check("outage", { lastCheckedAt: 50 * minute }),
      check("long-outage", { trackingStartedAt: 0, lastCheckedAt: 1 * minute }),
      check("near-deadline", { trackingStartedAt: -55 * minute + 20_000 }),
    ],
    nowAt: 54 * minute,
    observations: {
      "dep-old-missing": { kind: "not_found" },
      "dep-outage": { kind: "transient" },
      "dep-long-outage": { kind: "transient" },
      "dep-near-deadline": { kind: "transient" },
    },
  });
  await fixture.tracker.runOnce();
  expect(fixture.writes.slice(1)).toEqual([
    [
      "complete",
      {
        buildId: "old-missing",
        now: 54 * minute,
        outcome: "unknown",
        providerBuildId: "dep-old-missing",
        reason: "tracking_not_found",
      },
    ],
    // Gap of 4 minutes since the last successful read; capped by the deadline at 60 minutes.
    [
      "check",
      {
        buildId: "outage",
        checkAfter: 58 * minute,
        now: 54 * minute,
        providerBuildId: "dep-outage",
      },
    ],
    // Gap of 53 minutes is bounded to the 10-minute backoff, then to the deadline.
    [
      "check",
      {
        buildId: "long-outage",
        checkAfter: 60 * minute,
        now: 54 * minute,
        providerBuildId: "dep-long-outage",
      },
    ],
    [
      "complete",
      {
        buildId: "near-deadline",
        now: 54 * minute,
        outcome: "unknown",
        providerBuildId: "dep-near-deadline",
        reason: "tracking_timeout",
      },
    ],
  ]);

  const late = trackingFixture({
    checks: [check("slow")],
    nowAt: 30 * minute,
    observations: { "dep-slow": { kind: "progress", stage: "deploy" } },
    timeoutMs: 30 * minute,
  });
  await late.tracker.runOnce();
  expect(late.writes[1]).toEqual([
    "complete",
    {
      buildId: "slow",
      now: 30 * minute,
      outcome: "unknown",
      providerBuildId: "dep-slow",
      reason: "tracking_timeout",
      stage: "deploy",
    },
  ]);

  const unconfigured = trackingFixture({
    checks: [check("orphan")],
    reader: null,
    observations: {},
  });
  await unconfigured.tracker.runOnce();
  expect(unconfigured.writes[1]).toEqual([
    "complete",
    {
      buildId: "orphan",
      now: 0,
      outcome: "unknown",
      providerBuildId: "dep-orphan",
      reason: "tracking_unconfigured",
    },
  ]);
  expect(() => trackingFixture({ checks: [], observations: {}, timeoutMs: 0 })).toThrow(
    "Tracking timeout is invalid.",
  );
});
