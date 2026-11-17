import { expect } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3";
import { defineConfig, definePage } from "@lacecms/config";
import { draftPreviewOrigin } from "@lacecms/test-utils";
import type { BuiltAdminResponder } from "@lacecms/server";
import { migrateNodeDatabase } from "../database/connection.js";
import { createNodeRuntime, parseNodeRuntimeSettings } from "../runtime/runtime.js";

export const nodePreviewAdmin = "https://cms.lace.test";
const email = "admin@lace.test";
const password = "correct horse battery staple";

export async function localS3PreviewFixture(cleanups: Array<() => unknown>, endpoint: string) {
  if (new URL(endpoint).hostname !== "127.0.0.1")
    throw new Error("Preview verification requires a disposable S3 fixture on loopback.");
  const bucket = `lace-preview-${randomUUID()}`;
  const client = new S3Client({
    endpoint,
    forcePathStyle: true,
    region: "us-east-1",
    credentials: { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" },
  });
  cleanups.push(() => client.destroy());
  await client.send(new CreateBucketCommand({ Bucket: bucket }));
  return { client, bucket };
}

export async function nodePreviewFixture(
  cleanups: Array<() => unknown>,
  options: {
    readonly endpoint?: string;
    readonly bucket?: string;
    readonly admin?: string;
    readonly preview?: string;
    readonly assets?: BuiltAdminResponder;
    readonly runnerEnvironment?: Readonly<Record<string, string>>;
  } = {},
) {
  const admin = options.admin ?? nodePreviewAdmin;
  const directory = await mkdtemp(join(tmpdir(), "lace-preview-"));
  cleanups.push(() => rm(directory, { recursive: true, force: true }));
  const databasePath = join(directory, "lace.sqlite");
  migrateNodeDatabase(databasePath);
  const config = await defineConfig({
    content: [definePage({ key: "home", path: "/", version: 1 })],
  });
  const runtime = createNodeRuntime({
    config,
    logger: { log() {} },
    previewOrigin: new URL(options.preview ?? draftPreviewOrigin),
    ...(options.assets && { adminAssets: options.assets }),
    settings: parseNodeRuntimeSettings({
      LACE_AUTH_SECRET: "test-auth-secret-that-is-long-enough-for-better-auth",
      LACE_DATABASE_PATH: databasePath,
      LACE_PUBLIC_BASE_URL: admin,
      LACE_MINIO_ACCESS_KEY: "test-access-key",
      LACE_MINIO_BUCKET: options.bucket ?? "lace-media",
      LACE_MINIO_ENDPOINT: options.endpoint ?? "http://minio.test:9000",
      LACE_MINIO_REGION: "us-east-1",
      LACE_MINIO_SECRET_KEY: "test-secret-key",
      LACE_MINIO_TIMEOUT_MS: "1000",
      ...options.runnerEnvironment,
    }),
  });
  cleanups.push(runtime.close);
  const setup = await runtime.security.createSetupToken();
  const call = (path: string, body: Record<string, string>) =>
    runtime.app.fetch(
      new Request(admin + path, {
        body: JSON.stringify(body),
        headers: { "content-type": "application/json", origin: admin },
        method: "POST",
      }),
    );
  const created = await call("/api/v1/setup/admin", { email, password, token: setup.token });
  expect(created.status).toBe(201);
  async function signIn() {
    const signIn = await call("/api/auth/sign-in/email", { email, password });
    expect(signIn.status).toBe(200);
    return signIn.headers.getSetCookie()[0]!.split(";")[0]!;
  }
  return {
    config,
    runtime,
    signIn,
    run: async (sql: string, values: readonly unknown[]) =>
      runtime.database.connection.prepare(sql).run(...values),
  };
}
