import { expect, test } from "vitest";
import { PAGES_API_MAX_RESPONSE_BYTES, PagesDeploymentStatusReader } from "../dist/index.js";

const token = "pages-read-token-secret";
const account = "0123456789abcdef0123456789abcdef";

function reader(respond, options = {}) {
  const calls = [];
  const adapter = new PagesDeploymentStatusReader({
    accountId: account,
    apiToken: token,
    fetch: async (target, init) => {
      calls.push({ init, target: String(target) });
      return respond(init);
    },
    projectName: "my-site",
    ...options,
  });
  return { adapter, calls };
}

const deployment = (latestStage, extra = {}) =>
  Response.json({
    errors: [],
    messages: [],
    result: {
      build_config: { build_command: "pnpm build" },
      env_vars: { LACE_BUILD_TOKEN: { type: "secret_text", value: "leaky" } },
      id: "dep-1",
      is_skipped: false,
      latest_stage: latestStage,
      ...extra,
    },
    success: true,
  });

test("reads the exact deployment with a bearer token and no redirects", async () => {
  const { adapter, calls } = reader(() => deployment({ name: "deploy", status: "success" }));
  expect(await adapter.read("dep-1")).toEqual({
    kind: "outcome",
    outcome: "succeeded",
    stage: "deploy",
  });
  expect(calls).toHaveLength(1);
  expect(calls[0].target).toBe(
    `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/my-site/deployments/dep-1`,
  );
  expect(calls[0].init).toMatchObject({ method: "GET", redirect: "manual" });
  expect(calls[0].init.headers).toEqual({
    accept: "application/json",
    authorization: `Bearer ${token}`,
  });
  expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
  const stub = reader(() => deployment({ name: "build", status: "active" }), {
    apiBaseUrl: new URL("http://127.0.0.1:9000/client/v4/"),
  });
  await stub.adapter.read("a/b");
  expect(stub.calls[0].target).toBe(
    `http://127.0.0.1:9000/client/v4/accounts/${account}/pages/projects/my-site/deployments/a%2Fb`,
  );
});

test("stage results map to closed observations and only deploy success proves publication", async () => {
  const cases = [
    [{ name: "queued", status: "active" }, {}, { kind: "progress", stage: "queued" }],
    [{ name: "build", status: "idle" }, {}, { kind: "progress", stage: "build" }],
    [{ name: "build", status: "success" }, {}, { kind: "progress", stage: "build" }],
    [{ name: "deploy", status: "active" }, {}, { kind: "progress", stage: "deploy" }],
    [
      { name: "build", status: "failure" },
      {},
      { kind: "outcome", outcome: "failed", reason: "provider_build_failed", stage: "build" },
    ],
    [
      { name: "deploy", status: "failure" },
      {},
      { kind: "outcome", outcome: "failed", reason: "provider_deploy_failed", stage: "deploy" },
    ],
    [
      { name: "clone_repo", status: "failure" },
      {},
      { kind: "outcome", outcome: "failed", reason: "provider_failed", stage: "clone_repo" },
    ],
    [
      { name: "build", status: "canceled" },
      {},
      { kind: "outcome", outcome: "cancelled", reason: "provider_cancelled", stage: "build" },
    ],
    [
      { name: "queued", status: "skipped" },
      {},
      { kind: "outcome", outcome: "cancelled", reason: "provider_skipped", stage: "queued" },
    ],
    [
      { name: "queued", status: "idle" },
      { is_skipped: true },
      { kind: "outcome", outcome: "cancelled", reason: "provider_skipped", stage: "queued" },
    ],
    [{ name: "upload", status: "success" }, {}, { kind: "transient" }],
    [{ name: "deploy", status: "done" }, {}, { kind: "transient" }],
    [null, {}, { kind: "transient" }],
  ];
  for (const [stage, extra, expected] of cases)
    expect(
      await reader(() => deployment(stage, extra)).adapter.read("dep-1"),
      JSON.stringify(stage),
    ).toEqual(expected);
});

test("HTTP failures map to permission, missing, rejection or transient observations", async () => {
  const cases = [
    [() => new Response("no", { status: 401 }), { kind: "forbidden" }],
    [() => new Response("no", { status: 403 }), { kind: "forbidden" }],
    [() => new Response("no", { status: 404 }), { kind: "not_found" }],
    [() => new Response("bad", { status: 400 }), { kind: "rejected" }],
    [
      () => new Response(null, { status: 302, headers: { location: "https://elsewhere.test/" } }),
      { kind: "rejected" },
    ],
    [() => new Response("slow", { status: 429 }), { kind: "transient" }],
    [() => new Response("down", { status: 503 }), { kind: "transient" }],
    [() => new Response("timeout", { status: 408 }), { kind: "transient" }],
    [
      () => {
        throw new TypeError("network");
      },
      { kind: "transient" },
    ],
    [() => new Response("not json", { status: 200 }), { kind: "transient" }],
    [() => Response.json({ success: false, errors: [{ code: 8000007 }] }), { kind: "transient" }],
    [
      () =>
        Response.json({
          result: { id: "dep-other", latest_stage: { name: "deploy", status: "success" } },
          success: true,
        }),
      { kind: "transient" },
    ],
    [
      () => new Response("x".repeat(PAGES_API_MAX_RESPONSE_BYTES + 1), { status: 200 }),
      { kind: "transient" },
    ],
  ];
  for (const [respond, expected] of cases)
    expect(await reader(respond).adapter.read("dep-1")).toEqual(expected);
});

test("observations never carry provider response data", async () => {
  const observation = await reader(() =>
    deployment({ name: "build", status: "failure" }),
  ).adapter.read("dep-1");
  const text = JSON.stringify(observation);
  expect(text).not.toContain("leaky");
  expect(text).not.toContain("pnpm build");
  expect(text).not.toContain(token);
  expect(
    () =>
      new PagesDeploymentStatusReader({
        accountId: account,
        apiToken: token,
        projectName: "my-site",
        timeoutMs: 0,
      }),
  ).toThrow("Pages API timeout is invalid.");
});

test("a hanging Pages request aborts within its configured deadline", async () => {
  let aborted = false;
  const { adapter } = reader(
    (init) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          aborted = true;
          reject(init.signal.reason);
        });
      }),
    { timeoutMs: 20 },
  );
  const started = Date.now();
  expect(await adapter.read("dep-1")).toEqual({ kind: "transient" });
  expect(aborted).toBe(true);
  expect(Date.now() - started).toBeLessThan(2000);
});
