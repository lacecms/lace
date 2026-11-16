import { PutObjectCommand } from "@aws-sdk/client-s3";
import type { S3CommandClient } from "./media/minio-storage.js";
import { expect, test } from "vitest";

import { Readable } from "node:stream";

import sharp from "sharp";
import {
  NodeMinioObjectStorage,
  NodeSharpImageInspector,
  NodeObjectStorageError,
} from "./index.js";

test("MinIO storage streams objects, distinguishes missing keys, and sanitizes failures", async () => {
  const commands: {
    command: object;
    options: { readonly abortSignal?: AbortSignal } | undefined;
  }[] = [];
  const client: S3CommandClient = {
    send: async (command, options) => {
      commands.push({ command, options });
      if (command.constructor.name === "GetObjectCommand") {
        return { Body: Readable.from([Buffer.from("media-bytes")]) };
      }
      if (command instanceof PutObjectCommand) {
        expect(command.input.Body).toEqual(Buffer.from([1, 2, 3]));
        expect(command.input.ContentLength).toBe(3);
      }
      return {};
    },
  };
  const storage = new NodeMinioObjectStorage(
    {
      accessKeyId: "test-access-key",
      bucket: "lace-media",
      endpoint: new URL("http://minio.test:9000"),
      publicBaseUrl: new URL("https://lace.test/base/"),
      region: "us-east-1",
      secretAccessKey: "test-secret-key",
      timeoutMs: 100,
    },
    client,
  );
  await storage.assertReady();
  const stored = await storage.put({
    body: {
      async *[Symbol.asyncIterator]() {
        yield new Uint8Array([1, 2]);
        yield new Uint8Array([3]);
      },
    },
    contentType: "image/png",
    key: "media/example",
  });
  expect(stored).toEqual({ contentType: "image/png", key: "media/example", size: 3 });
  expect(await storage.createReadUrl("media/example")).toBe(
    "https://lace.test/base/api/v1/public/media/example",
  );
  await expect(
    (async () => {
      const output = await storage.get("media/example");
      if (output === null) return undefined;
      const chunks: Uint8Array[] = [];
      for await (const chunk of output) chunks.push(chunk);
      return Buffer.concat(chunks);
    })(),
  ).resolves.toEqual(Buffer.from("media-bytes"));
  await storage.delete("media/example");
  expect(commands.map(({ command }) => command.constructor.name)).toEqual([
    "HeadBucketCommand",
    "PutObjectCommand",
    "GetObjectCommand",
    "DeleteObjectCommand",
  ]);
  expect(commands.every(({ options }) => options?.abortSignal instanceof AbortSignal)).toBe(true);

  const missing = new NodeMinioObjectStorage(
    {
      accessKeyId: "test-access-key",
      bucket: "lace-media",
      endpoint: new URL("http://minio.test:9000"),
      publicBaseUrl: new URL("https://lace.test/"),
      region: "us-east-1",
      secretAccessKey: "test-secret-key",
      timeoutMs: 100,
    },
    { send: async () => Promise.reject({ name: "NoSuchKey" }) },
  );
  await expect(missing.get("missing")).resolves.toBeNull();
  const unavailable = new NodeMinioObjectStorage(
    {
      accessKeyId: "test-access-key",
      bucket: "lace-media",
      endpoint: new URL("http://minio.test:9000"),
      publicBaseUrl: new URL("https://lace.test/"),
      region: "us-east-1",
      secretAccessKey: "test-secret-key",
      timeoutMs: 100,
    },
    { send: async () => Promise.reject(new Error("opaque infrastructure detail")) },
  );
  await expect(unavailable.assertReady()).rejects.toBeInstanceOf(NodeObjectStorageError);
});

test("reports orientation-applied display dimensions from the sharp inspector", async () => {
  const inspector = new NodeSharpImageInspector();
  const rotated = await sharp({
    create: { background: { b: 3, g: 2, r: 1 }, channels: 3, height: 200, width: 400 },
  })
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer();
  await expect(inspector.inspect(new Uint8Array(rotated), "image/jpeg")).resolves.toEqual({
    height: 400,
    width: 200,
  });
  const upright = await sharp({
    create: { background: { b: 3, g: 2, r: 1 }, channels: 3, height: 2, width: 3 },
  })
    .png()
    .toBuffer();
  await expect(inspector.inspect(new Uint8Array(upright), "image/png")).resolves.toEqual({
    height: 2,
    width: 3,
  });
  await expect(inspector.inspect(new Uint8Array(upright), "image/jpeg")).rejects.toMatchObject({
    code: "CONTENT_INVALID_STATE",
  });
});
