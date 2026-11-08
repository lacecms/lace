// @ts-nocheck
// TODO(rf2): Type legacy SQLite/product harnesses, branded values and partial runtime adapters.
import { expect, test } from "vitest";
import sharp from "sharp";
import { defineConfig, definePage } from "@lacecms/config";
import { animatedGifFixture, InMemoryObjectStorage } from "@lacecms/test-utils";
import * as platform from "./index.js";
import { openNodeTestRuntime } from "./test-support/node-runtime-harness.js";

test("real Node API accepts an animated GIF through sharp and filters the library by GIF", async () => {
  const { runtime } = await openNodeTestRuntime(platform, {
    config: await defineConfig({ content: [definePage({ key: "home", path: "/", version: 1 })] }),
    actor: { id: "gif-admin", role: "admin" },
    storage: new InMemoryObjectStorage(),
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
});
