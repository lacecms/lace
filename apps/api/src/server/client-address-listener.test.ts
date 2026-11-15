import { expect, test } from "vitest";
import * as platform from "@lacecms/platform-node";
import { openNodeTestRuntime } from "@lacecms/platform-node/test";
import { loadProjectConfig } from "../config/project-config.js";
import { startNodeServer } from "./node-server.js";

test("Node listener retains the peer for chunked and ordinary sign-in requests", async () => {
  const harness = await openNodeTestRuntime(platform, {
    config: await loadProjectConfig(),
    runtimeDefaults: true,
    storage: {
      createReadUrl: async () => "memory://media",
      delete: async () => {},
      get: async () => null,
      put: async (input) => ({ contentType: input.contentType, key: input.key, size: 0 }),
    },
  });
  const server = await startNodeServer({
    runtime: harness.runtime,
    settings: { ...harness.settings, port: 0 },
  });
  try {
    const body = JSON.stringify({ email: "user@example.test", password: "invalid" });
    for (const streamed of [true, false]) {
      const response = await fetch(new URL("/api/auth/sign-in/email", server.url), {
        method: "POST",
        headers: {
          origin: "https://lace.test",
          "content-type": "application/json",
          "x-forwarded-for": "192.0.2.1",
        },
        body: streamed
          ? new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(body));
                controller.close();
              },
            })
          : body,
        ...(streamed ? { duplex: "half" } : {}),
      } as RequestInit);
      expect(response.status).toBe(401);
    }
    const rows = harness.runtime.database.connection
      .prepare("select request_count from rate_limit_buckets")
      .all();
    expect(rows).toEqual([{ request_count: 2 }]);
  } finally {
    await server.close();
    await harness.close();
  }
});
