import { expect, test } from "vitest";
import {
  DeterministicClock,
  DeterministicIdGenerator,
  DeterministicTokenHasher,
  InMemoryCache,
  InMemoryDispatcherLeasePort,
  InMemoryObjectStorage,
  InMemorySiteBuildTrigger,
} from "../index.js";
import { unixMilliseconds, siteBuildId } from "@lacecms/domain";
import {
  defaultDispatcherRetryPolicy,
  dispatcherRetryDelay,
  dispatcherEventId,
  opaqueTokenSecret,
} from "@lacecms/application";

import { stream, read } from "../test-support/fixtures.js";

test("provides deterministic infrastructure fakes with detached values", async () => {
  const clock = new DeterministicClock(unixMilliseconds(10));
  expect(clock.advanceBy(5)).toBe(15);
  const ids = new DeterministicIdGenerator("test");
  expect([ids.next(), ids.next()]).toEqual(["test-1", "test-2"]);

  const storage = new InMemoryObjectStorage();
  await storage.put({ body: stream("hello"), contentType: "text/plain", key: "media/a" });
  const stored = await storage.get("media/a");
  expect(stored).toBeDefined();
  if (stored === null) throw new Error("Expected stored bytes");
  expect(await read(stored)).toBe("hello");
  expect(await storage.createReadUrl("media/a")).toBe("memory-object://media%2Fa");
  await storage.delete("media/a");
  expect(await storage.get("media/a")).toBeNull();

  const cache = new InMemoryCache();
  expect(await cache.get("missing")).toBeNull();
  await cache.set("data", { nested: { value: 1 } });
  const cached = (await cache.get("data")) as { nested: { value: number } };
  cached.nested.value = 2;
  expect(await cache.get("data")).toEqual({ nested: { value: 1 } });

  const tokens = new DeterministicTokenHasher();
  const verifier = await tokens.hash(opaqueTokenSecret("build-secret"));
  expect(verifier).not.toContain("build-secret");
  await expect(tokens.verify(opaqueTokenSecret("build-secret"), verifier)).resolves.toBe(true);
  await expect(tokens.verify(opaqueTokenSecret("wrong"), verifier)).resolves.toBe(false);

  const trigger = new InMemorySiteBuildTrigger({ status: "failed", reason: "trigger_unavailable" });
  expect(await trigger.trigger({ buildId: siteBuildId("build-1"), targetVersion: 2 })).toEqual({
    status: "failed",
    reason: "trigger_unavailable",
  });
  expect(trigger.requests).toHaveLength(1);
  await expect(
    new InMemorySiteBuildTrigger().trigger({ buildId: siteBuildId("build-2"), targetVersion: 2 }),
  ).resolves.toEqual({ status: "succeeded" });
  await expect(
    new InMemorySiteBuildTrigger({ status: "accepted", providerBuildId: "provider-1" }).trigger({
      buildId: siteBuildId("build-3"),
      targetVersion: 2,
    }),
  ).resolves.toEqual({ status: "accepted", providerBuildId: "provider-1" });
});

test("leases one dispatcher event exclusively until it is completed", async () => {
  const leases = new InMemoryDispatcherLeasePort();
  leases.enqueue({
    attempts: 0,
    availableAt: unixMilliseconds(10),
    id: dispatcherEventId("event-1"),
    payload: { target: "site" },
    type: "build",
  });
  const first = await leases.claim({ eventTypes: ["build"], limit: 1, now: unixMilliseconds(10) });
  expect(first).toHaveLength(1);
  await expect(
    leases.claim({ eventTypes: ["build"], limit: 1, now: unixMilliseconds(11) }),
  ).resolves.toEqual([]);
  const lease = first[0];
  expect(lease).toBeDefined();
  if (lease === undefined) throw new Error("Expected lease");
  await leases.complete({
    completedAt: unixMilliseconds(15),
    leaseId: lease.id,
    outcome: "succeeded",
  });
  await expect(
    leases.claim({ eventTypes: ["build"], limit: 1, now: unixMilliseconds(16) }),
  ).resolves.toEqual([]);
});

test("recovers expired leases and calculates bounded full-jitter retries", async () => {
  const leases = new InMemoryDispatcherLeasePort();
  leases.enqueue({
    attempts: 0,
    availableAt: unixMilliseconds(1),
    id: dispatcherEventId("event-retry"),
    payload: {},
    type: "media.delete.requested",
  });
  const first = await leases.claim({
    eventTypes: ["media.delete.requested"],
    limit: 1,
    now: unixMilliseconds(1),
  });
  const recovered = await leases.claim({
    eventTypes: ["media.delete.requested"],
    limit: 1,
    now: unixMilliseconds(60_001),
  });
  expect(recovered).toHaveLength(1);
  const lease = first[0];
  expect(lease).toBeDefined();
  if (lease === undefined) throw new Error("Expected lease");
  await expect(
    leases.complete({
      completedAt: unixMilliseconds(60_001),
      leaseId: lease.id,
      outcome: "succeeded",
    }),
  ).rejects.toThrow("expired");
  expect(dispatcherRetryDelay(defaultDispatcherRetryPolicy, 1, 0)).toBe(0);
  expect(dispatcherRetryDelay(defaultDispatcherRetryPolicy, 1, 0.999)).toBeLessThanOrEqual(1_000);
  expect(dispatcherRetryDelay(defaultDispatcherRetryPolicy, 99, 0.999)).toBeLessThanOrEqual(
    defaultDispatcherRetryPolicy.maxDelayMs,
  );
});
