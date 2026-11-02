// @ts-nocheck
// TODO(rf2): Type legacy D1/Worker harnesses, binding fakes and recorded adapter calls.
import { afterEach, expect, test } from "vitest";
import { CloudflareKvCache, NoopCloudflareCache } from "./index.js";
import { openLocalCloudflare } from "./d1-test-harness.mjs";

const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

test("KV cache round-trips JSON values and deletes them", async () => {
  const local = await openLocalCloudflare();
  cleanups.push(local.dispose);
  const cache = new CloudflareKvCache(local.kv);
  await expect(cache.get("missing")).resolves.toBeNull();
  await cache.set("key", { nested: [1, "two"] });
  await expect(cache.get("key")).resolves.toEqual({ nested: [1, "two"] });
  await cache.set("falsy", 0);
  await expect(cache.get("falsy")).resolves.toBe(0);
  await cache.delete("key");
  await expect(cache.get("key")).resolves.toBeNull();
  await local.kv.put("malformed", "{not json");
  await expect(cache.get("malformed")).resolves.toBeNull();
  await local.kv.put("foreign", JSON.stringify([1, 2]));
  await expect(cache.get("foreign")).resolves.toBeNull();
});

test("failing KV bindings and the no-op cache behave as misses", async () => {
  const fail = async () => {
    throw new Error("kv unavailable");
  };
  const cache = new CloudflareKvCache({ delete: fail, get: fail, put: fail });
  await expect(cache.get("key")).resolves.toBeNull();
  await expect(cache.set("key", 1)).resolves.toBeUndefined();
  await expect(cache.delete("key")).resolves.toBeUndefined();
  const noop = new NoopCloudflareCache();
  await noop.set("key", 1);
  await expect(noop.get("key")).resolves.toBeNull();
});
