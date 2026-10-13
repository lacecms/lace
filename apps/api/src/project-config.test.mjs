import { expect, test } from "vitest";
import { ConfigurationError, defineConfig, definePage } from "@lacecms/config";
import { loadProjectConfig } from "../dist/project-config.js";

test("loads the root configuration with typed page, collection and global examples", async () => {
  const config = await loadProjectConfig();
  expect(config.public.content.map(({ key, kind, version }) => ({ key, kind, version }))).toEqual([
    { key: "about", kind: "page", version: 4 },
    { key: "home", kind: "page", version: 5 },
    { key: "navigation", kind: "global", version: 1 },
    { key: "notes", kind: "collection", version: 4 },
    { key: "posts", kind: "collection", version: 5 },
    { key: "settings", kind: "global", version: 2 },
  ]);
  expect(config.runtime.blocks.get("hero")).toBeDefined();
  expect(config.public.content[0].path).toBe("/about");
  expect(config.public.content[2]).toMatchObject({ blocks: ["navigation"], fields: {} });
  expect(config.public.content[3].route).toBe("/notes/:slug");
  expect(config.public.content[3].fields.summary.type).toBe("text");
  expect(config.public.content[4].route).toBe("/blog/:slug");
  expect(config.public.content[5].path).toBeUndefined();
  expect(config.public.content[5].fields.siteName.required).toBe(true);
  expect(config.public.content[3].seo).toEqual({ description: "summary" });
  expect(config.public.content[5].seoDefaults).toEqual({
    description: "description",
    image: "image",
    siteName: "siteName",
    titleTemplate: "titleTemplate",
  });
});

test("accepts a fresh normalized project configuration", async () => {
  const edited = await defineConfig({
    content: [definePage({ key: "about", path: "/about", version: 1 })],
  });
  const loaded = await loadProjectConfig(async () => ({ default: edited }));
  expect(loaded.public.content.map((model) => model.key)).toEqual(["about"]);
});

test("rejects a missing, invalid or failed project module without exposing raw failures", async () => {
  await expect(
    loadProjectConfig(async () => {
      throw new Error("secret-file-path");
    }),
  ).rejects.toThrow("Could not load lace.config.ts");
  await expect(
    loadProjectConfig(async () => {
      throw new ConfigurationError("model key is invalid");
    }),
  ).rejects.toThrow("Invalid lace.config.ts: model key is invalid");
  await expect(loadProjectConfig(async () => ({ default: {} }))).rejects.toThrow(
    "default export must be a normalized configuration",
  );
});
