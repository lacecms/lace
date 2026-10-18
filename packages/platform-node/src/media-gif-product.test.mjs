import { expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { defineConfig, definePage } from "@lacecms/config";
import { animatedGifFixture, InMemoryObjectStorage } from "@lacecms/test-utils";
import { createNodeRuntime, migrateNodeDatabase, parseNodeRuntimeSettings } from "../dist/index.js";
import { createTestActorResolver } from "./test-actors.ts";

test("real Node API accepts an animated GIF through sharp and filters the library by GIF", async () => {
  const directory = await mkdtemp(join(tmpdir(), "lace-gif-"));
  let runtime;
  try {
    const databasePath = join(directory, "lace.sqlite");
    migrateNodeDatabase(databasePath);
    runtime = createNodeRuntime({
      config: await defineConfig({ content: [definePage({ key: "home", path: "/", version: 1 })] }),
      actors: createTestActorResolver({ id: "gif-admin", role: "admin" }),
      logger: { log() {} },
      rateLimiter: { check: async () => true },
      storage: new InMemoryObjectStorage(),
      settings: parseNodeRuntimeSettings({
        LACE_AUTH_SECRET: "gif-test-secret-at-least-32-characters",
        LACE_DATABASE_PATH: databasePath,
        LACE_PUBLIC_BASE_URL: "https://lace.test/",
        LACE_MINIO_ACCESS_KEY: "test",
        LACE_MINIO_SECRET_KEY: "test",
        LACE_MINIO_TIMEOUT_MS: "1000",
        LACE_MINIO_BUCKET: "test",
        LACE_MINIO_ENDPOINT: "http://localhost:9000",
        LACE_MINIO_REGION: "test",
      }),
    });
    const upload = async (bytes, name) => {
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: "application/octet-stream" }), name);
      const response = await runtime.app.fetch(
        new Request("https://lace.test/api/v1/admin/media", {
          body: form,
          headers: { origin: "https://lace.test" },
          method: "POST",
        }),
      );
      return { body: await response.json(), status: response.status };
    };
    const png = await sharp({
      create: { background: { b: 3, g: 2, r: 1 }, channels: 3, height: 2, width: 3 },
    })
      .png()
      .toBuffer();
    expect((await upload(png, "cover.png")).status).toBe(201);
    const gif = await upload(animatedGifFixture(), "loop.gif");
    expect(gif).toMatchObject({
      body: { height: 240, mimeType: "image/gif", width: 320 },
      status: 201,
    });
    const truncated = await upload(animatedGifFixture().slice(0, -1), "broken.gif");
    expect(truncated.status).toBe(422);
    const list = await runtime.app.fetch(
      new Request("https://lace.test/api/v1/admin/media?type=image%2Fgif"),
    );
    expect(list.status).toBe(200);
    expect((await list.json()).items.map((item) => item.id)).toEqual([gif.body.id]);
  } finally {
    runtime?.close();
    await rm(directory, { force: true, recursive: true });
  }
});
