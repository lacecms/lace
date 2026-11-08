import { unixMilliseconds } from "@lacecms/domain";
import type { SensitiveRateLimiter } from "@lacecms/application";
import { expect, test } from "vitest";
import { SensitiveRequestRateLimiter } from "../index.js";

function harness(allowed = true) {
  const checks: Parameters<SensitiveRateLimiter["check"]>[0][] = [];
  const limiter = new SensitiveRequestRateLimiter(
    {
      check: async (input) => {
        checks.push(input);
        return { allowed, retryAfterSeconds: allowed ? 0 : 9 };
      },
    },
    { now: () => unixMilliseconds(42) },
    () => "203.0.113.7",
  );
  return { checks, limiter };
}

test("allows requests outside the sensitive routes without counting them", async () => {
  const { checks, limiter } = harness();
  await expect(
    limiter.check({ request: new Request("https://lace.test/api/v1/public/entries") }),
  ).resolves.toBe(true);
  expect(checks).toEqual([]);
});

test("counts a client-scoped route by the trusted address and returns the decision", async () => {
  const { checks, limiter } = harness(false);
  await expect(
    limiter.check({
      request: new Request("https://lace.test/api/v1/setup/admin", { method: "POST" }),
    }),
  ).resolves.toEqual({ allowed: false, retryAfterSeconds: 9 });
  expect(checks).toEqual([{ now: 42, operation: "setup", subject: "203.0.113.7" }]);
});

test("counts an actor-scoped route per actor and skips it without one", async () => {
  const { checks, limiter } = harness();
  const request = () => new Request("https://lace.test/mcp", { method: "POST" });
  await expect(limiter.check({ request: request() })).resolves.toBe(true);
  expect(checks).toEqual([]);
  await limiter.check({ actor: { id: "editor" }, request: request() });
  expect(checks).toEqual([{ now: 42, operation: "mcp", subject: "actor:editor" }]);
});
