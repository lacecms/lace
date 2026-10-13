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

test("nested pointers show one-based items without changing stored paths", () => {
  expect(usageLocationLabel({ field: "/team/0/photo", source: "field", states: ["draft"] })).toBe(
    "Team · Item 1 · Photo field · Draft",
  );
  expect(
    usageLocationLabel({
      blockKey: "b",
      blockType: "gallery",
      field: "/images/12",
      source: "block",
      states: ["published"],
    }),
  ).toBe("Gallery block · Images · Item 13 field · Published");
});
