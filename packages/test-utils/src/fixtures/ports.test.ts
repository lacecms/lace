import { expect, test } from "vitest";
import type { SecurityService } from "@lacecms/application";
import { unixMilliseconds } from "@lacecms/domain";
import { allowAllRateLimiter, fakePort, silentLogger } from "./ports.js";

test("an unimplemented member throws an error naming the port and member", async () => {
  const security = fakePort<SecurityService>("SecurityService", {
    listSessions: async () => [],
  });
  expect(() => security.deleteSession({ sessionId: "s", userId: "u" })).toThrow(
    "SecurityService.deleteSession is not implemented by this fake",
  );
  await expect(security.listSessions({ now: unixMilliseconds(0), userId: "u" })).resolves.toEqual(
    [],
  );
});

test("then and symbol reads return undefined, so the fake can be awaited", async () => {
  const port = fakePort<{ run(): void }>("Port", {});
  expect(Reflect.get(port, "then")).toBeUndefined();
  expect(Reflect.get(port, Symbol.toPrimitive)).toBeUndefined();
  await expect(Promise.resolve(port)).resolves.toBe(port);
});

test("an implemented member is called with its arguments", () => {
  const calls: unknown[][] = [];
  const port = fakePort<{ add(left: number, right: number): number }>("Calculator", {
    add: (left, right) => {
      calls.push([left, right]);
      return left + right;
    },
  });
  expect(port.add(2, 3)).toBe(5);
  expect(calls).toEqual([[2, 3]]);
});

test("the silent logger and permissive limiter satisfy their ports", async () => {
  expect(silentLogger.error({ code: "MEDIA_OBJECT_CLEANUP_FAILED", storageKey: "k" })).toBe(
    undefined,
  );
  await expect(
    allowAllRateLimiter.check({ operation: "auth", subject: "s", now: unixMilliseconds(0) }),
  ).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
});
