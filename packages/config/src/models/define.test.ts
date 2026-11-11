import { present } from "../test-support/assertions.js";

import { expect, test } from "vitest";
import { field } from "@lacecms/content";

import {
  ConfigurationError,
  defineCollection,
  defineConfig,
  defineGlobal,
  definePage,
  normalizeCollectionRoute,
  normalizePagePath,
  resolveCollectionRoute,
} from "../index.js";
import { blocks, postModel, homeModel } from "../test-support/model-fixtures.js";

test("defines deeply readonly page and collection models", () => {
  const fields: { heading: ReturnType<typeof field.text> } = {
    heading: field.text({ label: "Original", required: true }),
  };
  const blocks = ["hero"];
  const page = definePage({
    blocks,
    fields,
    key: "home",
    path: "/",
    renamedFrom: "landing",
    version: 1,
  });
  const collection = postModel();

  fields.heading = field.text({ label: "Changed" });
  blocks[0] = "cta";

  expect(page).toMatchObject({
    blocks: ["hero"],
    key: "home",
    kind: "page",
    path: "/",
    renamedFrom: "landing",
    version: 1,
  });
  expect(page.fields.heading).toMatchObject({ label: "Original", required: true, type: "text" });
  expect(collection).toMatchObject({ key: "posts", kind: "collection", route: "/blog/:slug" });
  expect(Object.isFrozen(page)).toBe(true);
  expect(Object.isFrozen(page.fields)).toBe(true);
  expect(Object.isFrozen(page.blocks)).toBe(true);
});

test.each([
  ["invalid key", { key: "Posts" }],
  ["empty key", { key: "" }],
  ["zero version", { version: 0 }],
  ["fractional version", { version: 1.5 }],
  ["same former key", { renamedFrom: "home" }],
  ["invalid field key", { fields: { "bad-key": field.text() } }],
  ["duplicate blocks", { blocks: ["hero", "hero"] }],
])("rejects %s model metadata", (_name, overrides) => {
  expect(() => homeModel(overrides)).toThrow(ConfigurationError);
});

test("rejects duplicate identity and configuration-detectable routes", async () => {
  await expect(defineConfig({ blocks, content: [homeModel(), homeModel()] })).rejects.toThrow(
    /share key/u,
  );
  await expect(
    defineConfig({
      blocks,
      content: [postModel(), postModel({ key: "articles", route: "/blog/:slug" })],
    }),
  ).rejects.toThrow(/share route/u);
  await expect(
    defineConfig({ blocks, content: [homeModel({ path: "/blog/releases" }), postModel()] }),
  ).rejects.toThrow(/collides/u);
  await expect(
    defineConfig({
      blocks,
      content: [postModel(), postModel({ key: "articles", renamedFrom: "posts" })],
    }),
  ).rejects.toThrow(/renamedFrom/u);
  await expect(
    defineConfig({
      blocks,
      content: [homeModel({ renamedFrom: "landing" }), postModel({ renamedFrom: "landing" })],
    }),
  ).rejects.toThrow(/share renamedFrom/u);
});

test("defines a route-less global model", async () => {
  const settings = defineGlobal({
    fields: { siteName: field.text({ required: true }) },
    key: "settings",
    label: "Site settings",
    version: 1,
  });
  expect(settings).toMatchObject({ blocks: [], key: "settings", kind: "global", version: 1 });
  expect(settings).not.toHaveProperty("path");
  expect(settings).not.toHaveProperty("route");
  expect(Object.isFrozen(settings)).toBe(true);

  const config = await defineConfig({ blocks, content: [homeModel(), postModel(), settings] });
  const projected = config.public.content.find((model) => model.key === "settings");
  expect(projected).toMatchObject({ key: "settings", kind: "global" });
  expect(projected).not.toHaveProperty("path");
  expect(projected).not.toHaveProperty("route");
  expect(projected).not.toHaveProperty("listFields");
});

test.each([
  ["path", "/settings"],
  ["route", "/settings/:slug"],
  ["listFields", []],
])("rejects %s on a global", (option, value) => {
  expect(() => defineGlobal({ key: "settings", version: 1, [option]: value })).toThrow(
    new RegExp(`must not declare ${option}`, "u"),
  );
});

test("defines a route-less collection without routes, slugs or SEO", async () => {
  const testimonials = defineCollection({
    fields: { quote: field.textarea({ required: true }) },
    key: "testimonials",
    listFields: ["quote"],
    version: 1,
  });
  expect(testimonials).toMatchObject({
    key: "testimonials",
    kind: "collection",
    listFields: ["quote"],
  });
  expect(testimonials).not.toHaveProperty("route");
  expect(testimonials).not.toHaveProperty("seo");
  const cv = defineCollection({ key: "cv", version: 1 });

  const config = await defineConfig({
    blocks,
    content: [homeModel({ path: "/" }), postModel(), testimonials, cv],
  });
  const projected = config.public.content.find((model) => model.key === "testimonials");
  expect(projected).toMatchObject({ key: "testimonials", kind: "collection" });
  expect(projected).not.toHaveProperty("route");

  const routed = await defineConfig({
    blocks,
    content: [defineCollection({ key: "cv", route: "/cv/:slug", version: 1 })],
  });
  const routeLess = await defineConfig({ blocks, content: [cv] });
  expect(present(routeLess.content[0]).structureHash).not.toBe(
    present(routed.content[0]).structureHash,
  );
});

test.each([true, {}, false])("rejects seo %j on a route-less collection", (seo) => {
  expect(() => defineCollection({ key: "testimonials", seo, version: 1 })).toThrow(
    /testimonials" must not declare seo without a route/u,
  );
});

test("still validates a supplied collection route", () => {
  expect(() => defineCollection({ key: "cv", route: "", version: 1 })).toThrow(ConfigurationError);
});

test("keeps keys unique across kinds and hashes the kind", async () => {
  await expect(
    defineConfig({
      blocks,
      content: [
        homeModel({ key: "settings", path: "/settings" }),
        defineGlobal({ key: "settings", version: 1 }),
      ],
    }),
  ).rejects.toThrow(/share key/u);
  await expect(
    defineConfig({
      blocks,
      content: [
        defineGlobal({ key: "settings", version: 1 }),
        defineGlobal({ key: "footer", renamedFrom: "settings", version: 1 }),
      ],
    }),
  ).rejects.toThrow(/renamedFrom "settings" duplicates a model key/u);
  const page = await defineConfig({
    blocks,
    content: [definePage({ key: "settings", path: "/settings", version: 1 })],
  });
  const global = await defineConfig({
    blocks,
    content: [defineGlobal({ key: "settings", version: 1 })],
  });
  expect(present(global.content[0]).structureHash).not.toBe(present(page.content[0]).structureHash);
});

test("normalizes only canonical page and collection routes", () => {
  expect(normalizePagePath("/")).toBe("/");
  expect(normalizePagePath("/about")).toBe("/about");
  expect(normalizeCollectionRoute("/blog/:slug")).toBe("/blog/:slug");
  expect(resolveCollectionRoute("/blog/:slug", "release-notes")).toBe("/blog/release-notes");

  for (const value of [
    "about",
    "/about/",
    "/about//team",
    "/about/./team",
    "/about/../team",
    "/about?tab=1",
    "/about#team",
    "/:slug",
  ]) {
    expect(() => normalizePagePath(value)).toThrow(ConfigurationError);
  }
  for (const value of [
    "/blog",
    "/blog/:slug/:slug",
    "/blog/:id",
    "/blog/:slug/",
    "/blog//:slug",
    "/blog/:slug?draft=1",
  ]) {
    expect(() => normalizeCollectionRoute(value)).toThrow(ConfigurationError);
  }
  for (const slug of [
    "Release",
    "release/notes",
    "release--notes",
    "",
    "release?draft=1",
    "release#notes",
    ".",
  ]) {
    expect(() => resolveCollectionRoute("/blog/:slug", slug)).toThrow(ConfigurationError);
  }
});
