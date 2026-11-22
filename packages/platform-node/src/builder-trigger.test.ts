import { strict as assert } from "node:assert";
import { siteBuildId, unixMilliseconds } from "@lacecms/domain";
import {
  DISPATCHER_LEASE_DURATION_MS,
  dispatcherEventId,
  dispatcherLeaseId,
} from "@lacecms/application";
import type { SiteBuildDispatchPort, SiteBuildWorkLease } from "@lacecms/application";
import { expect, test } from "vitest";
import { NodeBuilderSiteBuildTrigger, NodeSiteBuildDispatcher } from "./index.js";

const secret = "s".repeat(32);
const input = { buildId: siteBuildId("build-1"), targetVersion: 8 };

function trigger(fetch: typeof globalThis.fetch) {
  return new NodeBuilderSiteBuildTrigger({
    baseUrl: new URL("http://builder:8788/"),
    secret,
    fetch,
  });
}

function lease(attempts: number): SiteBuildWorkLease {
  return {
    id: dispatcherLeaseId("lease"),
    buildId: siteBuildId("build"),
    targetVersion: 1,
    expiresAt: unixMilliseconds(1000),
    event: {
      attempts,
      availableAt: unixMilliseconds(0),
      id: dispatcherEventId("event"),
      payload: {},
      type: "site-build",
    },
  };
}
function workPort(overrides: Partial<SiteBuildDispatchPort>): SiteBuildDispatchPort {
  const unexpected = async (): Promise<never> => {
    throw new Error("Unexpected dispatch operation");
  };
  return {
    claimSiteBuilds: unexpected,
    renewSiteBuildLease: unexpected,
    recordSiteBuildAccepted: unexpected,
    recordSiteBuildTracking: unexpected,
    recordSiteBuildSuccess: unexpected,
    recordSiteBuildFailure: unexpected,
    completeTrackedSiteBuild: unexpected,
    claimTrackedSiteBuildChecks: unexpected,
    recordTrackedSiteBuildCheck: unexpected,
    ...overrides,
  };
}

test("sends only build identity and version with dedicated auth", async () => {
  const calls: { url: string; body: unknown; auth: string | null }[] = [];
  const adapter = trigger(async (url, init) => {
    assert(typeof init?.body === "string");
    calls.push({
      url: String(url),
      body: JSON.parse(init.body),
      auth: new Headers(init.headers).get("authorization"),
    });
    return Response.json({ status: "succeeded", log: "Static build succeeded." });
  });
  expect(await adapter.trigger(input)).toEqual({ status: "succeeded" });
  expect(calls).toEqual([
    { url: "http://builder:8788/build", body: input, auth: `Bearer ${secret}` },
  ]);
});

test("maps fixed failures and treats malformed or unavailable responses as retryable", async () => {
  expect(
    await trigger(async () =>
      Response.json(
        {
          status: "failed" as const,
          reason: "build_failed",
          log: "Static build failed: build_failed.",
        },
        { status: 503 },
      ),
    ).trigger(input),
  ).toEqual({ status: "failed", reason: "build_failed" });
  for (const response of [
    Response.json({ status: "succeeded", path: "/tmp" }),
    Response.json({ status: "failed", reason: "secret" }, { status: 503 }),
    new Response("not json", { status: 200 }),
  ]) {
    expect(await trigger(async () => response).trigger(input)).toEqual({
      status: "failed",
      reason: "trigger_unavailable",
    });
  }
  expect(
    await trigger(async () => {
      throw new Error("secret");
    }).trigger(input),
  ).toEqual({ status: "failed", reason: "trigger_unavailable" });
});

test("dispatcher renews a long trigger and discards a result after lease loss", async () => {
  for (const ownsLease of [true, false]) {
    let renewals = 0;
    let successes = 0;
    const work = workPort({
      claimSiteBuilds: async ({ now }) => [
        { ...lease(0), expiresAt: unixMilliseconds(now + DISPATCHER_LEASE_DURATION_MS) },
      ],
      renewSiteBuildLease: async () => {
        renewals += 1;
        return ownsLease;
      },
      recordSiteBuildSuccess: async () => {
        successes += 1;
      },
    });
    const dispatcher = new NodeSiteBuildDispatcher({
      clock: { now: () => unixMilliseconds(Date.now()) },
      logger: { error: () => undefined },
      leaseRenewIntervalMs: 5,
      trigger: {
        trigger: async () => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return { status: "succeeded" };
        },
      },
      work,
    });
    await dispatcher.runOnce();
    expect(renewals).toBeGreaterThan(0);
    expect(successes).toBe(ownsLease ? 1 : 0);
  }
});

test("preserves source diagnostics and drops unsafe optional paths", async () => {
  for (const path of ["src/linked.astro", "/source/private", "../private", ".env"]) {
    const response = Response.json(
      {
        status: "failed",
        reason: "source_symlink",
        log: "Static build failed: source_symlink.",
        path,
      },
      { status: 503 },
    );
    expect(await trigger(async () => response).trigger(input)).toEqual({
      status: "failed",
      reason: "source_symlink",
      ...(path === "src/linked.astro" ? { path } : {}),
    });
  }
  for (const body of [
    { status: "failed", reason: "source_missing", log: "wrong" },
    {
      status: "failed",
      reason: "source_missing",
      log: "Static build failed: source_missing.",
      path: 3,
    },
    {
      status: "failed",
      reason: "source_missing",
      log: "Static build failed: source_missing.",
      secret: "private",
    },
  ])
    expect(await trigger(async () => Response.json(body, { status: 503 })).trigger(input)).toEqual({
      status: "failed",
      reason: "trigger_unavailable",
    });
});
test("cancels oversized response before buffering it", async () => {
  let cancelled = false;
  const response = new Response(
    new ReadableStream({
      pull(controller) {
        controller.enqueue(new Uint8Array(600));
      },
      cancel() {
        cancelled = true;
      },
    }),
  );
  expect(await trigger(async () => response).trigger(input)).toEqual({
    status: "failed",
    reason: "trigger_unavailable",
  });
  expect(cancelled).toBe(true);
});

test("portable dispatcher preserves reason/path for pending and terminal attempts", async () => {
  for (const attempts of [0, 7]) {
    for (const result of [
      { status: "failed" as const, reason: "source_symlink", path: "src/linked.astro" },
      { status: "failed" as const, reason: "source_missing", path: "/host/private" },
      { status: "failed" as const, reason: "install_failed", path: "src/file" },
      { status: "failed" as const, reason: "secret=unknown", path: "src/file" },
    ]) {
      const failures: Parameters<SiteBuildDispatchPort["recordSiteBuildFailure"]>[0][] = [];
      const logs: { buildId: string; reason: string }[] = [];
      const dispatcher = new NodeSiteBuildDispatcher({
        clock: { now: () => unixMilliseconds(100) },
        logger: { error: (value) => logs.push(value) },
        random: () => 0,
        trigger: { trigger: async () => result },
        work: workPort({
          claimSiteBuilds: async () => [lease(attempts)],
          recordSiteBuildFailure: async (value) => {
            failures.push(value);
          },
        }),
      });
      await dispatcher.runOnce();
      const reason = result.reason === "secret=unknown" ? "provider_failed" : result.reason;
      expect(failures).toEqual([
        {
          leaseId: "lease",
          now: 100,
          reason,
          terminal: attempts === 7,
          ...(attempts === 0 ? { retryAt: 100 } : {}),
          ...(result.reason === "source_symlink" ? { path: result.path } : {}),
        },
      ]);
      expect(logs).toEqual([{ buildId: "build", reason }]);
    }
  }
});
