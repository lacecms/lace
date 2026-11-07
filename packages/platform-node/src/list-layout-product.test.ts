// @ts-nocheck
// TODO(rf2): Type legacy SQLite/product harnesses, branded values and partial runtime adapters.
import { expect, test } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import { builtInBlocks, defineBlock, field, listLayoutSettings } from "@lacecms/content";
import * as platform from "./index.js";
import sharp from "sharp";
import { InMemoryObjectStorage, readCompleteBuildExport } from "@lacecms/test-utils";
import { openNodeTestRuntime } from "./test-support/node-runtime-harness.js";

test("LIST1 real API saves, publishes and validates Gallery layout scalars", async () => {
  const custom = defineBlock({
    type: "cards",
    version: 1,
    fields: { title: field.text() },
    settings: listLayoutSettings(),
  });
  const config = await defineConfig({
    blocks: [builtInBlocks.gallery, custom],
    content: [
      defineCollection({
        key: "posts",
        route: "/posts/:slug",
        version: 1,
        blocks: ["gallery", "cards"],
      }),
    ],
  });
  const { runtime, request } = await openNodeTestRuntime(platform, {
    config,
    actor: { id: "ce9b-admin", role: "admin" },
    storage: new InMemoryObjectStorage(),
    sync: true,
  });
  const call = async (path, body, method = "POST", status = 200) => {
    const response = await request(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(status);
    return data;
  };

  const metadata = await call("/api/v1/admin/content-models", undefined, "GET");
  expect(
    metadata.items[0].blockDefinitions.find((b) => b.type === "gallery").settings.layoutMode
      .presentation.choices,
  ).toHaveLength(3);
  const png = await sharp({ create: { background: "white", channels: 3, width: 3, height: 2 } })
    .png()
    .toBuffer();
  const form = new FormData();
  form.append("file", new Blob([png]), "layout.png");
  const upload = await runtime.app.fetch(
    new Request("https://lace.test/api/v1/admin/media", {
      method: "POST",
      headers: { origin: "https://lace.test" },
      body: form,
    }),
  );
  expect(upload.status).toBe(201);
  const media = await upload.json();
  const settings = {
    layoutMode: "flex-row",
    layoutWrap: false,
    layoutPreset: "columns-3",
    lightbox: true,
  };
  const payload = {
    title: "Layouts",
    slug: "layouts",
    fields: {},
    blocks: [
      {
        type: "gallery",
        schemaVersion: 5,
        key: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
        position: 1000,
        data: {
          images: [
            { media: media.id, alt: "One", link: "/one" },
            { media: media.id, caption: "Two" },
            {
              kind: "video",
              media: media.id,
              videoUrl: "https://vimeo.com/76979871",
              videoTitle: "Studio tour",
            },
          ],
        },
        settings,
      },
    ],
  };
  const created = await call("/api/v1/admin/models/posts/entries", payload, "POST", 201);
  const path = `/api/v1/admin/entries/${created.id}`;
  const saved = await call(
    `${path}/draft`,
    {
      ...payload,
      blocks: [{ ...payload.blocks[0], settings: { ...settings, layoutMode: "grid" } }],
      expectedRevision: created.draft.revision,
    },
    "PUT",
  );
  expect(saved.draft.blocks[0].settings).toEqual({ ...settings, layoutMode: "grid" });
  await call(`${path}/publish`, { expectedRevision: saved.draft.revision });
  for (const invalid of [
    { layoutMode: "bad" },
    { layoutWrap: "yes" },
    { layoutMode: "flex-row", layoutPreset: "bad" },
  ]) {
    await call(
      `${path}/draft`,
      {
        ...payload,
        blocks: [{ ...payload.blocks[0], settings: { ...settings, ...invalid } }],
        expectedRevision: saved.draft.revision,
      },
      "PUT",
      422,
    );
  }
  const { entry: publicEntry } = await call(
    "/api/v1/public/collections/posts/layouts",
    undefined,
    "GET",
  );
  expect(publicEntry.blocks[0].settings).toEqual({ ...settings, layoutMode: "grid" });
  expect(JSON.stringify(publicEntry)).not.toMatch(/presentation|diagram|choices/);
  // SM5D: the video item's stale media is draft-only; images are published as images.
  expect(publicEntry.blocks[0].data.images[0]).toMatchObject({ kind: "image", media: media.id });
  expect(publicEntry.blocks[0].data.images[2]).toEqual({
    kind: "video",
    videoUrl: "https://vimeo.com/76979871",
    videoTitle: "Studio tour",
    playback: "player",
    aspectRatio: "16:9",
  });
  const duplicate = await call(`${path}/duplicate`, {}, "POST", 201);
  expect(duplicate.draft.blocks[0].settings).toEqual(publicEntry.blocks[0].settings);
  const token = await call("/api/v1/admin/api-tokens", { name: "LIST1 build" }, "POST", 201);
  const exported = (
    await readCompleteBuildExport(
      (url, init) => runtime.app.fetch(new Request(url, init)),
      "https://lace.test",
      token.token,
    )
  ).export;
  expect(exported.entries[0].blocks[0].settings).toEqual(publicEntry.blocks[0].settings);
});
