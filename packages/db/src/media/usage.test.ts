// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { mediaUsageEntries } from "./usage.js";

test("media usage maps SEO image references between fields and blocks", () => {
  const base = {
    block_type: null,
    entry_id: "e1",
    model_key: "posts",
    position: null,
    slug: "hello",
    status: "published",
    title: "Hello",
  };
  const [entry] = mediaUsageEntries([
    {
      ...base,
      field_path: "media",
      source_key: "b1",
      block_type: "image",
      position: 1000,
      state: "draft",
    },
    { ...base, field_path: "image", source_key: "$seo", state: "published" },
    { ...base, field_path: "image", source_key: "$seo", state: "draft" },
    { ...base, field_path: "cover", source_key: "$fields", state: "draft" },
  ]);
  expect(entry.locations).toEqual([
    { field: "cover", source: "field", states: ["draft"] },
    { field: "image", source: "seo", states: ["draft", "published"] },
    { blockKey: "b1", blockType: "image", field: "media", source: "block", states: ["draft"] },
  ]);
});
