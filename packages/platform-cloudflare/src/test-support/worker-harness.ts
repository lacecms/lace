// @ts-nocheck
// TODO(rf2): Type legacy Worker binding fixtures, partial options and recorded calls.
import { expect } from "vitest";
import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import config from "../../../../lace.config.ts";
import { openLocalCloudflare } from "../d1-test-harness.mjs";

export const origin = "https://cms.lace.test";
export const secret = "worker-auth-secret-that-is-long-enough-for-better-auth";
export const password = "correct horse battery staple";
let fixtureAddress = 0;

export async function createWorkerFixture(createWorker, cleanups, options = {}) {
  const clientAddress = `203.0.113.${++fixtureAddress}`;
  const local = await openLocalCloudflare();
  cleanups.push(local.dispose);
  const logs = [];
  const triggers = [];
  let offset = 0;
  const worker = createWorker({
    buildTrigger: () => ({
      trigger: async (input) => {
        triggers.push(input);
        return options.buildResult ?? { status: "succeeded" };
      },
    }),
    clock: { now: () => unixMilliseconds(Date.now() + offset) },
    config,
    logger: { log() {} },
    operationalLogger: { error: (entry) => logs.push(entry) },
    postCommitBuildDelayMs: 0,
    ...options,
  });
  const env = {
    DB: local.database,
    LACE_AUTH_SECRET: secret,
    LACE_PUBLIC_BASE_URL: `${origin}/`,
    MEDIA: local.bucket,
    ...options.env,
  };
  const runtime = worker.runtime(env);
  const prepared = await prepareConfigurationSynchronization({
    models: config.runtime.content,
    state: runtime.repository,
  });
  let value = 0;
  await applyPreparedConfigurationSynchronization({
    clock: { now: () => unixMilliseconds(100) },
    ids: { next: () => `sync-${++value}` },
    models: config.runtime.content,
    prepared,
    target: runtime.repository,
  });
  const pending = [];
  const ctx = { waitUntil: (promise) => pending.push(promise) };
  let cookie;
  const call = async (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", clientAddress);
    if (cookie !== undefined) headers.set("cookie", cookie);
    if (init.json !== undefined) headers.set("content-type", "application/json");
    const response = await worker.fetch(
      new Request(`${origin}${path}`, {
        body: init.json === undefined ? init.body : JSON.stringify(init.json),
        headers,
        method: init.method ?? "GET",
      }),
      env,
      ctx,
    );
    const text = await response.text();
    return { body: text.length === 0 ? undefined : safeJson(text), response };
  };
  const signIn = async () => {
    const setup = await runtime.security.createSetupToken();
    const created = await call("/api/v1/setup/admin", {
      json: { email: "admin@lace.test", password, token: setup.token },
      method: "POST",
    });
    expect(created.response.status).toBe(201);
    const session = await worker.fetch(
      new Request(`${origin}/api/auth/sign-in/email`, {
        body: JSON.stringify({ email: "admin@lace.test", password }),
        headers: { "content-type": "application/json", origin, "cf-connecting-ip": clientAddress },
        method: "POST",
      }),
      env,
      ctx,
    );
    expect(session.status).toBe(200);
    expect(session.headers.get("set-cookie")).toContain("Secure");
    cookie = session.headers.getSetCookie()[0].split(";")[0];
    return created.body;
  };
  return {
    get cookie() {
      return cookie;
    },
    advance: (milliseconds) => {
      offset += milliseconds;
    },
    call,
    ctx,
    env,
    local,
    logs,
    pending,
    runtime,
    settle: async () => {
      while (pending.length > 0) await Promise.all(pending.splice(0));
    },
    signIn,
    triggers,
    worker,
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
