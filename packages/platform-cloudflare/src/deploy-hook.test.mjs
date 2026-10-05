import { expect, test } from "vitest";
import { DEPLOY_HOOK_MAX_RESPONSE_BYTES, DeployHookSiteBuildTrigger } from "../dist/index.js";

const url = new URL("https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/hook-secret");
const input = { buildId: "build-1", targetVersion: 3 };

function trigger(respond, timeoutMs) {
  const calls = [];
  const adapter = new DeployHookSiteBuildTrigger({
    fetch: async (target, init) => {
      calls.push({ init, target: String(target) });
      return respond(init);
    },
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
    url,
  });
  return { adapter, calls };
}

test("sends one bodiless POST without following redirects", async () => {
  const { adapter, calls } = trigger(() =>
    Response.json({ errors: [], messages: [], result: { id: "dep-1" }, success: true }),
  );
  expect(await adapter.trigger(input)).toEqual({ providerBuildId: "dep-1", status: "accepted" });
  expect(calls).toHaveLength(1);
  expect(calls[0].target).toBe(url.href);
  expect(calls[0].init).toMatchObject({ method: "POST", redirect: "manual" });
  expect(calls[0].init.body).toBeUndefined();
  expect(calls[0].init.headers).toEqual({ accept: "application/json" });
  expect(calls[0].init.signal).toBeInstanceOf(AbortSignal);
});

test("a 2xx response without a valid deployment ID is acceptance, never success", async () => {
  for (const response of [
    () => new Response(null, { status: 204 }),
    () => new Response("queued", { status: 200 }),
    () => Response.json({ success: true, result: {} }),
    () => Response.json({ success: true, result: { id: "has spaces" } }),
    () => Response.json({ success: true, result: { id: "x".repeat(201) } }),
    () => Response.json({ id: "top-level-is-ignored" }),
    () => Response.json([1, 2]),
    () => new Response("x".repeat(DEPLOY_HOOK_MAX_RESPONSE_BYTES + 1), { status: 200 }),
  ]) {
    expect(await trigger(response).adapter.trigger(input)).toEqual({ status: "accepted" });
  }
});

test("provider rejections and redirects are provider failures", async () => {
  for (const response of [
    () => Response.json({ errors: [{ code: 1 }], success: false }),
    () => new Response(null, { status: 302, headers: { location: "https://elsewhere.test/" } }),
    () => new Response("not found", { status: 404 }),
    () => new Response("unauthorized", { status: 401 }),
  ]) {
    expect(await trigger(response).adapter.trigger(input)).toEqual({
      reason: "provider_failed",
      status: "failed",
    });
  }
});

test("throttling, server errors, network failures, and timeouts are retryable", async () => {
  for (const status of [408, 425, 429, 500, 503]) {
    expect(await trigger(() => new Response("busy", { status })).adapter.trigger(input)).toEqual({
      reason: "trigger_unavailable",
      status: "failed",
    });
  }
  expect(
    await trigger(() => {
      throw new Error(`network failure for ${url.href}`);
    }).adapter.trigger(input),
  ).toEqual({ reason: "trigger_unavailable", status: "failed" });
  const hanging = trigger(
    (init) =>
      new Promise((_resolve, reject) =>
        init.signal.addEventListener("abort", () => reject(init.signal.reason)),
      ),
    20,
  );
  const started = Date.now();
  expect(await hanging.adapter.trigger(input)).toEqual({
    reason: "trigger_unavailable",
    status: "failed",
  });
  expect(Date.now() - started).toBeLessThan(2_000);
});

test("results never contain the hook URL and settings are validated", async () => {
  const results = [
    await trigger(() => {
      throw new Error(url.href);
    }).adapter.trigger(input),
    await trigger(() => new Response(url.href, { status: 500 })).adapter.trigger(input),
  ];
  expect(JSON.stringify(results)).not.toContain("hook-secret");
  expect(() => new DeployHookSiteBuildTrigger({ timeoutMs: 0, url })).toThrow(TypeError);
  expect(() => new DeployHookSiteBuildTrigger({ timeoutMs: 60_001, url })).toThrow(TypeError);
  expect(
    () => new DeployHookSiteBuildTrigger({ url: new URL("http://hooks.example.test/") }),
  ).toThrow(TypeError);
});

test("with tracking configured an identified acceptance is tracked, an anonymous one is not", async () => {
  const tracked = (respond) =>
    new DeployHookSiteBuildTrigger({ fetch: async () => respond(), tracked: true, url });
  expect(
    await tracked(() => Response.json({ result: { id: "dep-7" }, success: true })).trigger(input),
  ).toEqual({ providerBuildId: "dep-7", status: "tracking" });
  expect(await tracked(() => Response.json({ result: {}, success: true })).trigger(input)).toEqual({
    status: "accepted",
  });
  expect(await tracked(() => Response.json({ success: false })).trigger(input)).toEqual({
    reason: "provider_failed",
    status: "failed",
  });
});
