import { actorId } from "@lacecms/domain";
import { array, object, number, string } from "./test-support/json.js";
import { expect, test } from "vitest";
import { defineCollection, defineConfig } from "@lacecms/config";
import { builtInBlocks, defineBlock, field, listLayoutSettings } from "@lacecms/content";
import * as platform from "./index.js";
import sharp from "sharp";
import { InMemoryObjectStorage, readCompleteBuildExport } from "@lacecms/test-utils";
import { openNodeTestRuntime } from "./test-support/node-runtime-harness.js";

test("real API saves, publishes and validates Gallery layout scalars", async () => {
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
    actor: { id: actorId("ce9b-admin"), role: "admin" },
    storage: new InMemoryObjectStorage(),
    sync: true,
  });
  const call = async (path: string, body: unknown, method = "POST", status = 200) => {
    const response = await request(path, {
      method,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await response.json();
    expect(response.status, JSON.stringify(data)).toBe(status);
    return object(data);
  };

  const metadata = await call("/api/v1/admin/content-models", undefined, "GET");
  const definitions = array(object(array(metadata.items)[0]).blockDefinitions);
  const gallery = object(definitions.find((b) => object(b).type === "gallery"));
  expect(object(object(object(gallery.settings).layoutMode).presentation).choices).toHaveLength(3);
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
  const media = object(await upload.json());
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
        schemaVersion: 6,
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
  const path = `/api/v1/admin/entries/${string(created.id)}`;
  const saved = await call(
    `${path}/draft`,
    {
      ...payload,
      blocks: [{ ...payload.blocks[0], settings: { ...settings, layoutMode: "grid" } }],
      expectedRevision: number(object(created.draft).revision),
    },
    "PUT",
  );
  expect(object(array(object(saved.draft).blocks)[0]).settings).toEqual({
    ...settings,
    layoutMode: "grid",
  });
  await call(`${path}/publish`, { expectedRevision: number(object(saved.draft).revision) });
  for (const invalid of [
    { layoutMode: "bad" },
    { layoutWrap: "yes" },
    { layoutMode: "flex-row", layoutPreset: "bad" },
    { layoutPreset: "featured-first" },
  ]) {
    await call(
      `${path}/draft`,
      {
        ...payload,
        blocks: [{ ...payload.blocks[0], settings: { ...settings, ...invalid } }],
        expectedRevision: number(object(saved.draft).revision),
      },
      "PUT",
      422,
    );
  }
  const publicResponse = await call("/api/v1/public/collections/posts/layouts", undefined, "GET");
  const publicEntry = object(publicResponse.entry);
  const publicBlock = object(array(publicEntry.blocks)[0]);
  expect(publicBlock.settings).toEqual({ ...settings, layoutMode: "grid" });
  expect(JSON.stringify(publicEntry)).not.toMatch(/presentation|diagram|choices/);
  // SM5D: the video item's stale media is draft-only; images are published as images.
  expect(array(object(publicBlock.data).images)[0]).toMatchObject({
    kind: "image",
    media: media.id,
  });
  expect(array(object(publicBlock.data).images)[2]).toEqual({
    kind: "video",
    videoUrl: "https://vimeo.com/76979871",
    videoTitle: "Studio tour",
    playback: "ambient",
    aspectRatio: "16:9",
    placement: "auto",
  });
  const duplicate = await call(`${path}/duplicate`, {}, "POST", 201);
  expect(object(array(object(duplicate.draft).blocks)[0]).settings).toEqual(publicBlock.settings);
  const token = await call("/api/v1/admin/api-tokens", { name: "LIST1 build" }, "POST", 201);
  const exported = (
    await readCompleteBuildExport(
      (url, init) => runtime.app.fetch(new Request(url, init)),
      "https://lace.test",
      string(token.token),
    )
  ).export;
  expect(exported.entries[0]?.blocks[0]?.settings).toEqual(publicBlock.settings);
});
