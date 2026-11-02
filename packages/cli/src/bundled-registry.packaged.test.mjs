import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "vitest";
import { bundledRegistryPath, frameworkItems, loadRegistry } from "../dist/blocks-registry.js";

test("the bundled registry matches the repository registry and lists the built-in astro items", async () => {
  const loaded = await loadRegistry();
  expect(frameworkItems(loaded, "astro").map((item) => item.name)).toEqual([
    "cta",
    "gallery",
    "hero",
    "image",
    "link",
    "navigation",
    "quote",
    "richText",
    "videoEmbed",
  ]);
  const hero = loaded.items.get("astro/hero");
  expect(
    hero.files[0].bytes.equals(
      await readFile(join(bundledRegistryPath(), "astro/hero/HeroBlock.astro")),
    ),
  ).toBe(true);
  expect(
    (
      await readFile(new URL("../../../registry/astro/hero/HeroBlock.astro", import.meta.url))
    ).equals(hero.files[0].bytes),
  ).toBe(true);
  expect(frameworkItems(loaded, "react")).toEqual([]);
});
