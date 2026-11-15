import { expect, test } from "vitest";
import { ConfigurationError, defineConfig, definePage } from "@lacecms/config";
import { loadProjectConfig } from "./project-config.js";

test("loads the root configuration with typed page, collection and global examples", async () => {
  const config = await loadProjectConfig();
  expect(config.public.content.map(({ key, kind }) => ({ key, kind }))).toEqual([
    { key: "about", kind: "page" },
    { key: "home", kind: "page" },
    { key: "navigation", kind: "global" },
    { key: "notes", kind: "collection" },
    { key: "posts", kind: "collection" },
    { key: "settings", kind: "global" },
  ]);
  expect(config.runtime.blocks.get("hero")).toBeDefined();
  const [about, , navigation, notes, posts, settings] = config.public.content;
  if (
    about?.kind !== "page" ||
    navigation?.kind !== "global" ||
    notes?.kind !== "collection" ||
    posts?.kind !== "collection" ||
    settings?.kind !== "global"
  )
    throw new Error("Unexpected project models");
  expect(about.path).toBe("/about");
  expect(navigation).toMatchObject({ blocks: ["navigation"], fields: {} });
  expect(notes.route).toBe("/notes/:slug");
  expect(notes.fields.summary?.type).toBe("text");
  expect(posts.route).toBe("/blog/:slug");
  expect(settings).not.toHaveProperty("path");
  expect(settings.fields.siteName?.required).toBe(true);
  expect(notes.seo).toEqual({ description: "summary" });
  expect(settings.seoDefaults).toEqual({
    description: "description",
    image: "image",
    siteName: "siteName",
    titleTemplate: "titleTemplate",
  });
});

test("accepts a fresh normalized project configuration", async () => {
  const edited = await defineConfig({
    content: [definePage({ key: "about", path: "/about", version: 7 })],
  });
  const loaded = await loadProjectConfig(async () => ({ default: edited }));
  expect(loaded.public.content.map(({ key, version }) => ({ key, version }))).toEqual([
    { key: "about", version: 7 },
  ]);
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
