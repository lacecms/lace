import { present } from "../test-support/assertions.js";

import { expect, test } from "vitest";
import { field } from "@lacecms/content";

import { defineCollection, defineConfig, defineGlobal, definePage } from "../index.js";
import { seoCollection, settingsGlobal } from "../test-support/model-fixtures.js";

test("normalizes the SEO option of routable models", async () => {
  expect(seoCollection({ seo: { description: "excerpt", image: "cover" } }).seo).toEqual({
    description: "excerpt",
    image: "cover",
  });
  expect(definePage({ key: "home", path: "/", seo: true, version: 1 }).seo).toEqual({});
  expect(seoCollection({ seo: false })).not.toHaveProperty("seo");
  expect(seoCollection()).not.toHaveProperty("seo");
  const config = await defineConfig({
    content: [seoCollection({ seo: { description: "heading" } })],
  });
  const model = present(config.public.content[0]);
  expect(model.kind).not.toBe("global");
  if (model.kind === "global") throw new Error("Expected a routable model");
  expect(model.seo).toEqual({ description: "heading" });
});

test.each([
  [{ seo: { image: "heading" } }, /seo\.image field "heading" must be a media field/u],
  [{ seo: { description: "cover" } }, /seo\.description field "cover" must be a text/u],
  [{ seo: { description: "body" } }, /must be a text or textarea field, not richText/u],
  [{ seo: { description: "missing" } }, /references undeclared field "missing"/u],
  [{ seo: { keywords: "heading" } }, /seo must not declare "keywords"/u],
  [{ seo: "yes" }, /seo must be a boolean or an object/u],
  [{ seoDefaults: { siteName: "heading" } }, /must not declare seoDefaults/u],
  [{ removedSeo: true, seo: true }, /must not declare removedSeo while seo is enabled/u],
  [{ removedSeo: false }, /removedSeo must be true/u],
])("rejects invalid SEO options %#", (overrides, message) => {
  expect(() => seoCollection(overrides)).toThrow(message);
});

test("rejects SEO options on a global", () => {
  expect(() => settingsGlobal({ seo: true })).toThrow(/must not declare seo/u);
  expect(() => settingsGlobal({ removedSeo: true })).toThrow(/must not declare removedSeo/u);
});

test("normalizes site SEO defaults on one global", async () => {
  const settings = settingsGlobal({
    seoDefaults: {
      description: "metaDescription",
      image: "shareImage",
      siteName: "siteName",
      titleTemplate: "titleTemplate",
    },
  });
  expect(settings.seoDefaults).toEqual({
    description: "metaDescription",
    image: "shareImage",
    siteName: "siteName",
    titleTemplate: "titleTemplate",
  });
  expect(() => settingsGlobal({ seoDefaults: {} })).toThrow(/must name a siteName field/u);
  expect(() => settingsGlobal({ seoDefaults: { siteName: "shareImage" } })).toThrow(
    /seoDefaults\.siteName field "shareImage" must be a text or textarea field/u,
  );
  expect(() =>
    settingsGlobal({ seoDefaults: { image: "siteName", siteName: "siteName" } }),
  ).toThrow(/seoDefaults\.image field "siteName" must be a media field/u);
  expect(() => settingsGlobal({ seoDefaults: { siteName: "siteName", url: "x" } })).toThrow(
    /seoDefaults must not declare "url"/u,
  );
  await expect(
    defineConfig({
      content: [settings, settingsGlobal({ key: "footer", seoDefaults: { siteName: "siteName" } })],
    }),
  ).rejects.toThrow(/globals "settings" and "footer" both declare seoDefaults/u);
});

test("site SEO defaults cannot reference conditional fields", () => {
  const global = (seoDefaults: { siteName: "siteName" | "brandName"; image?: "shareImage" }) =>
    defineGlobal({
      fields: {
        branded: field.boolean(),
        brandName: field.text({ required: true }),
        siteName: field.text({ required: true }),
        shareImage: field.media(),
      },
      key: "settings",
      version: 1,
      visibility: {
        brandName: { field: "branded", values: [true] },
        shareImage: { field: "branded", values: [true] },
      },
      seoDefaults,
    });
  expect(global({ siteName: "siteName" }).seoDefaults).toEqual({ siteName: "siteName" });
  expect(() => global({ siteName: "brandName" })).toThrow(
    /seoDefaults\.siteName must not reference conditional field "brandName"/u,
  );
  expect(() => global({ siteName: "siteName", image: "shareImage" })).toThrow(
    /seoDefaults\.image must not reference conditional field/u,
  );
});

test("routable SEO fallbacks and list fields may name conditional fields", () => {
  const model = defineCollection({
    fields: {
      kind: field.select({ options: ["short", "long"], required: true, defaultValue: "short" }),
      excerpt: field.textarea(),
      cover: field.media(),
    },
    key: "notes",
    listFields: ["excerpt"],
    route: "/notes/:slug",
    seo: { description: "excerpt", image: "cover" },
    version: 1,
    visibility: {
      excerpt: { field: "kind", values: ["long"] },
      cover: { field: "kind", values: ["long"] },
    },
  });
  expect(model.seo).toEqual({ description: "excerpt", image: "cover" });
  expect(model.listFields).toEqual(["excerpt"]);
});
