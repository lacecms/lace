// @ts-nocheck
// TODO(rf2): Type legacy D1/Worker harnesses, binding fakes and recorded adapter calls.
import { afterEach, expect, test, vi } from "vitest";

import { unixMilliseconds } from "@lacecms/domain";
import config from "../../../lace.config.ts";
import {
  CloudflareEnvironmentError,
  SCHEDULED_TRACKING_CHECKS,
  createCloudflareWorker,
  parseCloudflareSettings,
} from "./index.js";
import { countingD1 } from "./test-support/d1-test-harness.js";

import { createWorkerFixture, origin, secret } from "./test-support/worker-harness.js";
const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.unstubAllGlobals();
});

const fakeBucket = { delete() {}, get() {}, head() {}, put() {} };
const fakeDatabase = { batch() {}, prepare() {} };

const workerFixture = (options = {}) =>
  createWorkerFixture(createCloudflareWorker, cleanups, options);

const pagesAccount = "0123456789abcdef0123456789abcdef";
const pagesToken = "pages-read-token-secret";
const trackedHook = "https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/hook-secret";
const pagesEnv = {
  LACE_DEPLOY_HOOK_URL: trackedHook,
  LACE_PAGES_ACCOUNT_ID: pagesAccount,
  LACE_PAGES_API_TOKEN: pagesToken,
  LACE_PAGES_PROJECT_NAME: "my-site",
};

/** A controlled Cloudflare: a deploy hook returning queued IDs and a Pages deployments API. */
function cloudflareStub() {
  const state = { calls: [], deployments: new Map(), hookIds: [] };
  vi.stubGlobal("fetch", async (target, init) => {
    const url = String(target);
    state.calls.push({ authorization: init.headers?.authorization, method: init.method, url });
    if (url === trackedHook) {
      const id = state.hookIds.shift();
      return Response.json(
        id === undefined ? { result: {}, success: true } : { result: { id }, success: true },
      );
    }
    const match = /\/accounts\/([^/]+)\/pages\/projects\/([^/]+)\/deployments\/([^/]+)$/u.exec(url);
    if (match === null || match[1] !== pagesAccount || match[2] !== "my-site")
      return new Response("unexpected", { status: 418 });
    const id = decodeURIComponent(match[3]);
    const behavior = state.deployments.get(id);
    const next = Array.isArray(behavior)
      ? behavior.length > 1
        ? behavior.shift()
        : behavior[0]
      : behavior;
    if (next === undefined) return new Response("missing", { status: 404 });
    if (typeof next === "number") return new Response("status", { status: next });
    const [name, status, extra = {}] = next;
    return Response.json({
      result: {
        env_vars: { LACE_BUILD_TOKEN: { type: "secret_text", value: "pages-env-secret" } },
        id,
        is_skipped: false,
        latest_stage: { name, status },
        ...extra,
      },
      success: true,
    });
  });
  return state;
}

async function trackedFixture(env = {}) {
  const fixture = await workerFixture({ buildTrigger: undefined, env: { ...pagesEnv, ...env } });
  await fixture.signIn();
  const run = async (env = fixture.env, worker = fixture.worker) => {
    await worker.scheduled({}, env, fixture.ctx);
  };
  const dispatch = async () => {
    const requested = await fixture.call("/api/v1/admin/builds", { method: "POST" });
    expect(requested.response.status).toBe(202);
    // Finish the immediate post-commit pass before moving the fixture clock.
    // Dropping these promises races the explicit scheduled dispatch below.
    await fixture.settle();
    fixture.advance(6_000);
    await run();
    return (await fixture.call("/api/v1/admin/site-builds")).body.items[0];
  };
  const build = async (id) => (await fixture.call(`/api/v1/admin/site-builds/${id}`)).body;
  return { ...fixture, build, dispatch, run };
}

test("Pages tracking settings are all-or-none, bounded and never echoed", () => {
  const base = {
    DB: fakeDatabase,
    LACE_AUTH_SECRET: secret,
    LACE_PUBLIC_BASE_URL: `${origin}/`,
    MEDIA: fakeBucket,
  };
  expect(parseCloudflareSettings(base)).not.toHaveProperty("pagesTracking");
  const tracked = parseCloudflareSettings({ ...base, ...pagesEnv });
  expect(tracked.pagesTracking).toMatchObject({
    accountId: pagesAccount,
    apiToken: pagesToken,
    projectName: "my-site",
    timeoutMs: 3_600_000,
  });
  expect(tracked.pagesTracking.apiBaseUrl.href).toBe("https://api.cloudflare.com/client/v4/");
  const development = parseCloudflareSettings({
    ...base,
    ...pagesEnv,
    LACE_ENVIRONMENT: "development",
    LACE_PAGES_API_BASE_URL: "http://127.0.0.1:9100/client/v4/",
    LACE_PAGES_TRACKING_TIMEOUT_MINUTES: "1440",
  });
  expect(development.pagesTracking.timeoutMs).toBe(86_400_000);
  expect(development.pagesTracking.apiBaseUrl.href).toBe("http://127.0.0.1:9100/client/v4/");
  const issues = (env) => {
    try {
      parseCloudflareSettings({ ...base, ...env });
    } catch (error) {
      expect(error).toBeInstanceOf(CloudflareEnvironmentError);
      expect(JSON.stringify(error.issues)).not.toContain(pagesToken);
      expect(error.message).not.toContain(pagesToken);
      return error.issues.map((issue) => `${issue.variable}:${issue.reason}`).sort();
    }
    return [];
  };
  expect(issues({ LACE_PAGES_ACCOUNT_ID: pagesAccount })).toEqual([
    "LACE_PAGES_API_TOKEN:missing",
    "LACE_PAGES_PROJECT_NAME:missing",
  ]);
  expect(
    issues({
      LACE_PAGES_ACCOUNT_ID: "ABC",
      LACE_PAGES_API_TOKEN: `${pagesToken} with space`,
      LACE_PAGES_PROJECT_NAME: "My_Site",
    }),
  ).toEqual([
    "LACE_PAGES_ACCOUNT_ID:invalid",
    "LACE_PAGES_API_TOKEN:invalid",
    "LACE_PAGES_PROJECT_NAME:invalid",
  ]);
  for (const minutes of ["4", "1441", "7.5", "soon"])
    expect(issues({ ...pagesEnv, LACE_PAGES_TRACKING_TIMEOUT_MINUTES: minutes })).toEqual([
      "LACE_PAGES_TRACKING_TIMEOUT_MINUTES:invalid",
    ]);
  expect(
    issues({ ...pagesEnv, LACE_PAGES_API_BASE_URL: "https://stub.example.test/client/v4/" }),
  ).toEqual(["LACE_PAGES_API_BASE_URL:invalid"]);
  for (const url of [
    "http://stub.example.test/",
    "https://stub.example.test/v4",
    "ftp://127.0.0.1/",
  ])
    expect(
      issues({ ...pagesEnv, LACE_ENVIRONMENT: "development", LACE_PAGES_API_BASE_URL: url }),
    ).toEqual(["LACE_PAGES_API_BASE_URL:invalid"]);
});

test("tracked Pages deployments reach proven outcomes from the exact deployment", async () => {
  const stub = cloudflareStub();
  const fixture = await trackedFixture();
  stub.hookIds.push("dep-ok", "dep-build", "dep-deploy", "dep-cancel", "dep-skip", "dep-denied");
  stub.deployments.set("dep-ok", [
    ["build", "active"],
    ["build", "success"],
    ["deploy", "success"],
  ]);
  stub.deployments.set("dep-build", [["build", "failure"]]);
  stub.deployments.set("dep-deploy", [["deploy", "failure"]]);
  stub.deployments.set("dep-cancel", [["build", "canceled"]]);
  stub.deployments.set("dep-skip", [["queued", "idle", { is_skipped: true }]]);
  stub.deployments.set("dep-denied", [403]);

  const ok = await fixture.dispatch();
  expect(ok).toMatchObject({
    providerBuildId: "dep-ok",
    providerStage: "build",
    status: "running",
  });
  expect(ok.providerCheckedAt).toBeTypeOf("string");
  fixture.advance(31_000);
  await fixture.run();
  expect(await fixture.build(ok.id)).toMatchObject({ providerStage: "build", status: "running" });
  fixture.advance(31_000);
  await fixture.run();
  const succeeded = await fixture.build(ok.id);
  expect(succeeded).toMatchObject({ providerStage: "deploy", status: "succeeded" });
  expect(succeeded).not.toHaveProperty("error");
  expect(succeeded.completedAt).toBeTypeOf("string");

  const outcomes = [];
  for (let index = 0; index < 5; index += 1) {
    const build = await fixture.dispatch();
    outcomes.push([build.providerBuildId, build.status, build.error, build.providerStage]);
  }
  expect(outcomes).toEqual([
    ["dep-build", "failed", "provider_build_failed", "build"],
    ["dep-deploy", "failed", "provider_deploy_failed", "deploy"],
    ["dep-cancel", "cancelled", "provider_cancelled", "build"],
    ["dep-skip", "cancelled", "provider_skipped", "queued"],
    ["dep-denied", "unknown", "tracking_forbidden", undefined],
  ]);
  const pagesCalls = stub.calls.filter((call) => call.method === "GET");
  expect(pagesCalls.every((call) => call.authorization === `Bearer ${pagesToken}`)).toBe(true);
  const hookCalls = stub.calls.filter((call) => call.method === "POST");
  expect(hookCalls.every((call) => call.authorization === undefined)).toBe(true);
  const attempts = await fixture.local.database
    .prepare("select max(attempts) as attempts from outbox_events")
    .first();
  expect(attempts.attempts).toBe(0);
  const stored = JSON.stringify(
    (await fixture.local.database.prepare("select * from site_builds").all()).results,
  );
  const history = JSON.stringify((await fixture.call("/api/v1/admin/site-builds")).body);
  for (const leaked of [pagesToken, "pages-env-secret", "hook-secret"]) {
    expect(stored).not.toContain(leaked);
    expect(history).not.toContain(leaked);
    expect(JSON.stringify(fixture.logs)).not.toContain(leaked);
  }
});

test("transient outages back off, parallel builds stay separate and late results change nothing", async () => {
  const stub = cloudflareStub();
  const fixture = await trackedFixture({ LACE_PAGES_TRACKING_TIMEOUT_MINUTES: "5" });
  stub.hookIds.push("dep-a", "dep-b", "dep-slow");
  stub.deployments.set("dep-a", [503, 429, ["deploy", "success"]]);
  stub.deployments.set("dep-b", [
    ["build", "active"],
    ["deploy", "success"],
  ]);
  stub.deployments.set("dep-slow", [["deploy", "active"]]);
  const a = await fixture.dispatch();
  const b = await fixture.dispatch();
  expect(a).toMatchObject({ providerBuildId: "dep-a", status: "running" });
  expect(a).not.toHaveProperty("providerStage");
  expect(b).toMatchObject({ providerBuildId: "dep-b", providerStage: "build", status: "running" });
  const due = async (id) =>
    (
      await fixture.local.database
        .prepare("select provider_check_after from site_builds where id = ?")
        .bind(id)
        .first()
    ).provider_check_after;
  const firstDue = await due(a.id);
  fixture.advance(31_000);
  await fixture.run();
  // A's second outage waits longer than its first; B finished independently.
  expect(await fixture.build(b.id)).toMatchObject({
    providerBuildId: "dep-b",
    status: "succeeded",
  });
  expect(await fixture.build(a.id)).toMatchObject({ providerBuildId: "dep-a", status: "running" });
  expect((await due(a.id)) - firstDue).toBeGreaterThan(31_000);
  fixture.advance(120_000);
  await fixture.run();
  expect(await fixture.build(a.id)).toMatchObject({ providerStage: "deploy", status: "succeeded" });

  const slow = await fixture.dispatch();
  expect(slow).toMatchObject({ providerStage: "deploy", status: "running" });
  for (let minute = 0; minute < 6; minute += 1) {
    fixture.advance(60_000);
    await fixture.run();
  }
  expect(await fixture.build(slow.id)).toMatchObject({
    error: "tracking_timeout",
    providerStage: "deploy",
    status: "unknown",
  });
  const callsAtTimeout = stub.calls.length;
  stub.deployments.set("dep-slow", [["deploy", "success"]]);
  fixture.advance(600_000);
  await fixture.run();
  expect(stub.calls.length).toBe(callsAtTimeout);
  expect(await fixture.build(slow.id)).toMatchObject({
    error: "tracking_timeout",
    status: "unknown",
  });
});

test("tracking survives Worker restarts, ignores hooks without IDs and ends when removed", async () => {
  const stub = cloudflareStub();
  const fixture = await trackedFixture();
  stub.hookIds.push("dep-restart");
  stub.deployments.set("dep-restart", [
    ["build", "active"],
    ["deploy", "success"],
  ]);
  const tracked = await fixture.dispatch();
  expect(tracked.status).toBe("running");
  // An invocation claims the check and dies before recording it.
  fixture.advance(31_000);
  const claimed = await fixture.runtime.repository.claimTrackedSiteBuildChecks({
    leaseMs: 60_000,
    limit: 5,
    now: unixMilliseconds(Date.now() + 31_000 + 6_000),
  });
  expect(claimed).toHaveLength(1);
  const restarted = createCloudflareWorker({
    clock: { now: () => unixMilliseconds(Date.now() + 37_000 + 61_000) },
    config,
    logger: { log() {} },
    operationalLogger: { error: (entry) => fixture.logs.push(entry) },
  });
  const restartedEnv = { ...fixture.env };
  await restarted.scheduled({}, restartedEnv, fixture.ctx);
  expect(await fixture.build(tracked.id)).toMatchObject({
    providerStage: "deploy",
    status: "succeeded",
  });

  const anonymous = await fixture.dispatch();
  expect(anonymous).toMatchObject({ status: "accepted" });
  expect(anonymous).not.toHaveProperty("providerBuildId");

  stub.hookIds.push("dep-orphan");
  stub.deployments.set("dep-orphan", [["queued", "active"]]);
  const orphan = await fixture.dispatch();
  expect(orphan.status).toBe("running");
  const untracked = { ...fixture.env };
  for (const name of Object.keys(pagesEnv))
    if (name !== "LACE_DEPLOY_HOOK_URL") delete untracked[name];
  fixture.advance(31_000);
  const before = stub.calls.length;
  await fixture.run(untracked);
  expect(stub.calls.length).toBe(before);
  expect(await fixture.build(orphan.id)).toMatchObject({
    error: "tracking_unconfigured",
    status: "unknown",
  });
  expect(fixture.logs).toContainEqual({
    buildId: orphan.id,
    component: "site-build-tracking",
    reason: "tracking_unconfigured",
  });
});

test("a scheduled run with many due tracked builds stays within 50 D1 queries", async () => {
  const stub = cloudflareStub();
  const fixture = await trackedFixture();
  const ids = [];
  for (let index = 0; index < SCHEDULED_TRACKING_CHECKS + 2; index += 1) {
    ids.push(`dep-${index}`);
    stub.hookIds.push(`dep-${index}`);
    stub.deployments.set(`dep-${index}`, [["build", "active"]]);
    await fixture.dispatch();
  }
  for (const id of ids) stub.deployments.set(id, [["deploy", "success"]]);
  await fixture.call("/api/v1/admin/builds", { method: "POST" });
  fixture.pending.splice(0);
  stub.hookIds.push("dep-new");
  stub.deployments.set("dep-new", [["build", "active"]]);
  fixture.advance(60_000);
  const counted = countingD1(fixture.local.database);
  const before = stub.calls.filter((call) => call.method === "GET").length;
  await fixture.run({ ...fixture.env, DB: counted.binding });
  expect(counted.stats.queries).toBeLessThanOrEqual(50);
  expect(stub.calls.filter((call) => call.method === "GET").length - before).toBe(
    SCHEDULED_TRACKING_CHECKS,
  );
  const history = (await fixture.call("/api/v1/admin/site-builds")).body.items;
  expect(history.filter((build) => build.status === "succeeded")).toHaveLength(
    SCHEDULED_TRACKING_CHECKS,
  );
  expect(history.filter((build) => build.status === "running")).toHaveLength(3);
});
