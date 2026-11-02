// @ts-nocheck
// TODO(rf2): Type partial build ports, tracker observations and recorded dispatcher calls.
import { expect, test } from "vitest";
import {
  dispatcherEventId,
  dispatcherLeaseId,
  dispatcherRetryDelay,
  DISPATCHER_LEASE_DURATION_MS,
  SITE_BUILD_DEBOUNCE_MS,
  siteBuildRetryPolicy,
  SiteBuildDispatcher,
  SiteBuildTracker,
  SiteBuildUseCases,
} from "./index.js";
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

test("only administrators can enqueue manual or retry build commands", async () => {
  const calls = [];
  const useCases = new SiteBuildUseCases({
    clock: { now: () => unixMilliseconds(42) },
    builds: {
      requestBuild: async (input) => {
        calls.push(input);
        return { coalesced: false, eventId: dispatcherEventId("event-1"), targetVersion: 3 };
      },
    },
  });
  const admin = { id: "admin-1", role: "admin" };
  await expect(useCases.request(admin)).resolves.toMatchObject({ targetVersion: 3 });
  await expect(useCases.retry(admin, "failed-1")).resolves.toMatchObject({ targetVersion: 3 });
  expect(calls).toMatchObject([{ requestedAt: 42 }, { retryOfBuildId: "failed-1" }]);
  for (const role of ["editor", "viewer"]) {
    expect(() => useCases.request({ id: role, role })).toThrow(DomainError);
    expect(() => useCases.retry({ id: role, role }, "failed-1")).toThrow(DomainError);
  }
  expect(calls).toHaveLength(2);
});

test("site-build dispatcher maps every trigger result to one truthful lifecycle write", async () => {
  const lease = (id) =>
    Object.freeze({
      buildId: id,
      event: { attempts: 0, availableAt: 0, id, payload: {}, type: "site.build.requested" },
      expiresAt: 60_000,
      id: dispatcherLeaseId(`lease-${id}`),
      targetVersion: 3,
    });
  const results = {
    accepted: { status: "accepted" },
    acceptedWithId: { status: "accepted", providerBuildId: "dep-1" },
    failed: { status: "failed", reason: "source_missing", path: "pnpm-lock.yaml" },
    succeeded: { status: "succeeded" },
    tracking: { status: "tracking", providerBuildId: "dep-2" },
  };
  const writes = [];
  const work = {
    claimSiteBuilds: async () => Object.keys(results).map(lease),
    renewSiteBuildLease: async () => true,
    recordSiteBuildAccepted: async (input) => writes.push(["accepted", input]),
    recordSiteBuildTracking: async (input) => writes.push(["tracking", input]),
    recordSiteBuildSuccess: async (input) => writes.push(["succeeded", input]),
    recordSiteBuildFailure: async (input) => writes.push(["failed", input]),
    completeTrackedSiteBuild: async () => {
      throw new Error("dispatch never completes tracked builds");
    },
  };
  const dispatcher = new SiteBuildDispatcher({
    clock: { now: () => 7 },
    logger: { error: () => undefined },
    random: () => 0,
    trigger: { trigger: async ({ buildId }) => results[buildId] },
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

function trackingFixture({ checks, observations, reader = "fake", timeoutMs, nowAt = 0 }) {
  const writes = [];
  const logs = [];
  let now = nowAt;
  const work = {
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
  };
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
              return value;
            },
          },
        }),
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    work,
  });
  return {
    logs,
    setNow: (value) => {
      now = value;
    },
    tracker,
    writes,
  };
}

const check = (id, extra = {}) => ({
  buildId: id,
  providerBuildId: `dep-${id}`,
  trackingStartedAt: 0,
  ...extra,
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
