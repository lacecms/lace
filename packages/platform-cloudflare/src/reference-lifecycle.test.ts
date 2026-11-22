import { expect, onTestFinished, test } from "vitest";
import { assertReferenceLifecycleRest, referenceLifecycleConfig } from "@lacecms/test-utils";
import { createCloudflareWorker } from "./index.js";
import {
  D1_MAX_BATCH_STATEMENTS,
  D1_MAX_BOUND_PARAMETERS,
  D1_QUERY_BUDGET,
} from "./d1/database.js";
import { countingD1 } from "./test-support/d1-test-harness.js";
import { createWorkerFixture, origin } from "./test-support/worker-harness.js";

test("Worker REST matches Node reference lifecycle within full request budgets", async () => {
  const cleanups: Array<() => unknown> = [];
  onTestFinished(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
  });
  const fixture = await createWorkerFixture(createCloudflareWorker, cleanups, {
    config: await referenceLifecycleConfig(),
  });
  await fixture.signIn();
  const db = fixture.local.database;
  const counted = countingD1(db);
  const env = { ...fixture.env, DB: counted.binding };
  const fetch = (
    path: string,
    init: RequestInit | undefined,
    binding: typeof fixture.env = env,
  ) => {
    const headers = new Headers(init?.headers);
    headers.set("cookie", fixture.cookie!);
    headers.set("origin", origin);
    headers.set("cf-connecting-ip", "203.0.113.199");
    return fixture.worker.fetch(
      new Request(origin + path, { ...init, headers }),
      binding,
      fixture.ctx,
    );
  };
  const maxima = new Map<string, { queries: number; batch: number; binds: number }>();
  await assertReferenceLifecycleRest(
    {
      request: async (path, init) => {
        Object.assign(counted.stats, { queries: 0, maxBatchStatements: 0, maxParameters: 0 });
        const response = await fetch(path, init);
        await fixture.settle();
        const { queries, maxBatchStatements: batch, maxParameters: binds } = counted.stats;
        expect(queries, path).toBeLessThanOrEqual(D1_QUERY_BUDGET);
        expect(batch, path).toBeLessThanOrEqual(D1_MAX_BATCH_STATEMENTS);
        expect(binds, path).toBeLessThanOrEqual(D1_MAX_BOUND_PARAMETERS);
        const key = `${init?.method} ${path.split("?")[0]!.replace(/\/entries\/[^/]+/u, "/entries/:id")}`;
        const prior = maxima.get(key);
        maxima.set(key, {
          queries: Math.max(queries, prior?.queries ?? 0),
          batch: Math.max(batch, prior?.batch ?? 0),
          binds: Math.max(binds, prior?.binds ?? 0),
        });
        return response;
      },
      raceRequest: (path, init) => fetch(path, init, fixture.env),
      asViewer: async (run) => {
        await db.prepare("update user set role='viewer'").run();
        try {
          await run();
        } finally {
          await db.prepare("update user set role='admin'").run();
        }
      },
    },
    expect,
  );
  await fixture.settle();
  console.info("REL1C Worker request budgets", JSON.stringify(Object.fromEntries(maxima)));
});
