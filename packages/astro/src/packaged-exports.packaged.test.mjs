import { expect, test } from "vitest";
import { readFile } from "node:fs/promises";

test("packaged entry point keeps its public exports", async () => {
  expect(Object.keys(await import("../dist/index.js")).sort()).toEqual([
    "IMAGE_PLACEHOLDER_WIDTH",
    "IMAGE_VARIANT_WIDTHS",
    "blurredPlaceholder",
    "createAstroSiteLoader",
    "createPlaceholderResolver",
    "laceImageConfig",
    "prepareLaceImage",
    "robotsResponse",
    "sitemapResponse",
    "variantWidths",
    "webpHasAlpha",
  ]);
  for (const component of [
    "LaceBlocks.astro",
    "LaceImage.astro",
    "LaceSeo.astro",
    "RichText.astro",
  ]) {
    expect(await readFile(new URL(`../dist/${component}`, import.meta.url), "utf8")).not.toBe("");
  }
});
