import { expect, test } from "vitest";
import { usageLocationLabel } from "./usage-labels.js";

test("usage locations name the field, block type, and snapshot states", () => {
  expect(usageLocationLabel({ field: "coverImage", source: "field", states: ["published"] })).toBe(
    "Cover Image field · Published",
  );
  expect(
    usageLocationLabel({
      blockKey: "01J00000000000000000000000",
      blockType: "hero",
      field: "image",
      source: "block",
      states: ["draft", "published"],
    }),
  ).toBe("Hero block · Image field · Draft and published");
  expect(
    usageLocationLabel({
      blockKey: "b",
      blockType: "gallery",
      field: "image",
      source: "block",
      states: ["draft"],
    }),
  ).toBe("Gallery block · Image field · Draft");
});

test("SEO image usages name the SEO image and their states", () => {
  expect(usageLocationLabel({ field: "image", source: "seo", states: ["published"] })).toBe(
    "SEO image · Published",
  );
  expect(
    usageLocationLabel({ field: "image", source: "seo", states: ["draft", "published"] }),
  ).toBe("SEO image · Draft and published");
});
