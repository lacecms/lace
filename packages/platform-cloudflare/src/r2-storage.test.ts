// @ts-nocheck
// TODO(rf2): Type legacy D1/Worker harnesses, binding fakes and recorded adapter calls.
import { afterEach, expect, test } from "vitest";
import { MAX_MEDIA_BYTES } from "@lacecms/application";
import { CloudflareObjectStorageError, CloudflareR2ObjectStorage } from "./index.js";
import { openLocalCloudflare } from "./d1-test-harness.mjs";

const cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const settings = { publicBaseUrl: new URL("https://cms.example.test/base/"), timeoutMs: 1_000 };

async function* chunks(...values) {
  for (const value of values) yield value;
}

async function collect(stream) {
  const parts = [];
  for await (const chunk of stream) parts.push(...chunk);
  return new Uint8Array(parts);
}

async function localStorage() {
  const local = await openLocalCloudflare();
  cleanups.push(local.dispose);
  return { bucket: local.bucket, storage: new CloudflareR2ObjectStorage(local.bucket, settings) };
}

test("R2 storage round-trips objects, distinguishes missing and empty, and deletes idempotently", async () => {
  const { bucket, storage } = await localStorage();
  await expect(
    storage.put({
      body: chunks(new Uint8Array([1, 2]), new Uint8Array([3])),
      contentType: "image/png",
      key: "media/one",
    }),
  ).resolves.toEqual({ contentType: "image/png", key: "media/one", size: 3 });
  expect((await bucket.head("media/one")).httpMetadata.contentType).toBe("image/png");
  expect(await collect(await storage.get("media/one"))).toEqual(new Uint8Array([1, 2, 3]));
  await storage.put({ body: chunks(), contentType: "image/png", key: "media/empty" });
  const empty = await storage.get("media/empty");
  expect(empty).not.toBeNull();
  expect(await collect(empty)).toEqual(new Uint8Array());
  await expect(storage.get("media/missing")).resolves.toBeNull();
  await storage.delete("media/one");
  await storage.delete("media/one");
  await expect(storage.get("media/one")).resolves.toBeNull();
  await expect(storage.createReadUrl("media/one")).resolves.toBe(
    "https://cms.example.test/base/api/v1/public/media/one",
  );
});

test("R2 storage rejects oversized bodies before writing", async () => {
  const { bucket, storage } = await localStorage();
  await expect(
    storage.put({
      body: chunks(new Uint8Array(MAX_MEDIA_BYTES), new Uint8Array(1)),
      contentType: "image/png",
      key: "media/big",
    }),
  ).rejects.toBeInstanceOf(CloudflareObjectStorageError);
  expect(await bucket.head("media/big")).toBeNull();
});

test("R2 failures and timeouts are sanitized", async () => {
  const failing = new CloudflareR2ObjectStorage(
    {
      delete: async () => {
        throw new Error("bucket lace-media secret detail");
      },
      get: async () => {
        throw new Error("bucket lace-media secret detail");
      },
      head: async () => null,
      put: async () => {
        throw new Error("bucket lace-media secret detail");
      },
    },
    settings,
  );
  for (const operation of [
    () => failing.get("media/x"),
    () => failing.delete("media/x"),
    () => failing.put({ body: chunks(new Uint8Array([1])), contentType: "image/png", key: "k" }),
  ]) {
    const error = await operation().catch((value) => value);
    expect(error).toBeInstanceOf(CloudflareObjectStorageError);
    expect(error.message).toBe("Object storage operation failed.");
  }
  const never = () => new Promise(() => {});
  const hanging = new CloudflareR2ObjectStorage(
    { delete: never, get: never, head: never, put: never },
    { ...settings, timeoutMs: 20 },
  );
  await expect(hanging.get("media/x")).rejects.toBeInstanceOf(CloudflareObjectStorageError);
  await expect(hanging.delete("media/x")).rejects.toBeInstanceOf(CloudflareObjectStorageError);
  const stalled = new CloudflareR2ObjectStorage(
    {
      delete: async () => {},
      get: async () => ({ body: new ReadableStream({ pull: () => never() }) }),
      head: async () => null,
      put: async () => {},
    },
    { ...settings, timeoutMs: 20 },
  );
  await expect(collect(await stalled.get("media/x"))).rejects.toBeInstanceOf(
    CloudflareObjectStorageError,
  );
});
