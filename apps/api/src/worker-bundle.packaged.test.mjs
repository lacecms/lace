import { afterAll, beforeAll, expect, test } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { buildWorkerBundle } from "./worker-bundle-harness.mjs";

const secret = "bundle-test-auth-secret-that-is-long-enough";
let built;
let bundle;
let config;

beforeAll(async () => {
  built = await buildWorkerBundle();
  ({ bundle, config } = built);
}, 120_000);

afterAll(async () => {
  await built?.dispose();
});

test("Worker configuration enables Better Auth compatibility and declares recovery bindings", () => {
  expect(config.compatibility_flags).toContain("nodejs_compat");
  expect(config.main).toBe("worker/index.ts");
  expect(config.d1_databases).toEqual([expect.objectContaining({ binding: "DB" })]);
  expect(config.r2_buckets).toEqual([expect.objectContaining({ binding: "MEDIA" })]);
  expect(config.assets).toMatchObject({ binding: "ASSETS", run_worker_first: true });
  expect(config.triggers.crons).toEqual(["* * * * *"]);
  expect(Object.keys(config.vars)).toEqual(["LACE_PUBLIC_BASE_URL"]);
});

test("Worker bundle contains no Node SQLite, S3, sharp, or filesystem module", () => {
  const bundledModules = [...bundle.matchAll(/^\/\/ (\S*node_modules\/\S+)$/gmu)].map(
    (match) => match[1],
  );
  expect(bundledModules.length).toBeGreaterThan(0);
  for (const path of bundledModules) {
    expect(path).not.toMatch(/node_modules\/(better-sqlite3|sharp|@aws-sdk\/[^/]+)\//u);
  }
  const specifiers = [
    ...bundle.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)"([^"]+)"/gu),
  ].map((match) => match[1]);
  for (const specifier of specifiers) {
    expect(specifier).not.toMatch(
      /^(node:)?(fs|fs\/promises)$|^better-sqlite3$|^sharp$|^@aws-sdk\//u,
    );
  }
  expect(bundle).not.toContain(secret);
});

test("bundled Worker serves health and Better Auth routes under workerd", async () => {
  const miniflare = new Miniflare(
    convertV4MiniflareOptions({
      bindings: {
        LACE_API_DOCS_ENABLED: "true",
        LACE_AUTH_SECRET: secret,
        LACE_PUBLIC_BASE_URL: "http://localhost:8787/",
      },
      compatibilityDate: config.compatibility_date,
      compatibilityFlags: config.compatibility_flags,
      d1Databases: ["DB"],
      modules: true,
      r2Buckets: ["MEDIA"],
      script: bundle,
    }),
  );
  try {
    const docs = await miniflare.dispatchFetch("http://localhost:8787/api/docs");
    expect(docs.status).toBe(200);
    expect(await docs.text()).toContain("/api/v1/openapi.json");
    const live = await miniflare.dispatchFetch("http://localhost:8787/health/live");
    expect(live.status).toBe(200);
    expect(await live.json()).toEqual({ status: "live" });
    const ready = await miniflare.dispatchFetch("http://localhost:8787/health/ready");
    expect(ready.status).toBe(503);
    expect(await ready.json()).toEqual({ status: "not_ready" });
    const session = await miniflare.dispatchFetch("http://localhost:8787/api/auth/get-session");
    expect(session.status).toBe(200);
    expect(await session.json()).toBeNull();
    const unknown = await miniflare.dispatchFetch("http://localhost:8787/api/v1/unknown");
    expect(unknown.status).toBe(404);
  } finally {
    await miniflare.dispose();
  }
}, 60_000);
