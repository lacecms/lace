import { expect } from "vitest";
import {
  applyPreparedConfigurationSynchronization,
  prepareConfigurationSynchronization,
} from "@lacecms/application";
import type { BuildTriggerResult, SiteBuildRequest } from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import config from "../../../../lace.config.js";
import { openLocalCloudflare } from "../d1-test-harness.mjs";
import type { WorkerExecutionContext } from "../worker.js";
import type {
  CloudflareWorker,
  CreateCloudflareWorkerInput,
  WorkerOperationalLogger,
} from "../worker.js";
import type { CloudflareWorkerEnv } from "../settings.js";

/** Input overrides; an explicit `undefined` removes a fixture default. */
export type WorkerFixtureOptions = {
  readonly [Key in keyof CreateCloudflareWorkerInput]?:
    | CreateCloudflareWorkerInput[Key]
    | undefined;
} & {
  readonly buildResult?: BuildTriggerResult;
  readonly env?: { readonly [Key in keyof CloudflareWorkerEnv]?: unknown };
};

export interface WorkerCallInit {
  readonly body?: BodyInit;
  readonly headers?: HeadersInit;
  readonly json?: unknown;
  readonly method?: string;
}

export interface WorkerCallResult {
  readonly body: unknown;
  readonly response: Response;
}

export const origin = "https://cms.lace.test";
export const secret = "worker-auth-secret-that-is-long-enough-for-better-auth";
export const password = "correct horse battery staple";
let fixtureAddress = 0;

export async function createWorkerFixture(
  createWorker: (input: CreateCloudflareWorkerInput) => CloudflareWorker,
  cleanups: Array<() => unknown>,
  options: WorkerFixtureOptions = {},
) {
  const clientAddress = `203.0.113.${++fixtureAddress}`;
  const local = await openLocalCloudflare();
  cleanups.push(local.dispose);
  const logs: Array<Parameters<WorkerOperationalLogger["error"]>[0]> = [];
  const triggers: SiteBuildRequest[] = [];
  let offset = 0;
  const { buildResult, env: extraEnv, ...overrides } = options;
  const input: Record<string, unknown> = {
    buildTrigger: () => ({
      trigger: async (request: SiteBuildRequest) => {
        triggers.push(request);
        return buildResult ?? { status: "succeeded" };
      },
    }),
    clock: { now: () => unixMilliseconds(Date.now() + offset) },
    config,
    logger: { log() {} },
    operationalLogger: { error: (entry: Record<string, string>) => logs.push(entry) },
    postCommitBuildDelayMs: 0,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) delete input[key];
    else input[key] = value;
  }
  const worker = createWorker(input as unknown as CreateCloudflareWorkerInput);
  const env: CloudflareWorkerEnv = {
    DB: local.database,
    LACE_AUTH_SECRET: secret,
    LACE_PUBLIC_BASE_URL: `${origin}/`,
    MEDIA: local.bucket,
    ...extraEnv,
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
  const pending: Array<Promise<unknown>> = [];
  const ctx: WorkerExecutionContext = { waitUntil: (promise) => void pending.push(promise) };
  let cookie: string | undefined;
  const call = async (path: string, init: WorkerCallInit = {}): Promise<WorkerCallResult> => {
    const headers = new Headers(init.headers);
    headers.set("cf-connecting-ip", clientAddress);
    if (cookie !== undefined) headers.set("cookie", cookie);
    if (init.json !== undefined) headers.set("content-type", "application/json");
    const response = await worker.fetch(
      new Request(`${origin}${path}`, {
        body: init.json === undefined ? (init.body ?? null) : JSON.stringify(init.json),
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
    cookie = session.headers.getSetCookie()[0]?.split(";")[0];
    return created.body;
  };
  return {
    get cookie() {
      return cookie;
    },
    advance: (milliseconds: number) => {
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

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
