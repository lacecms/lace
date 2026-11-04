// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";
import { seoJson, storedSnapshot } from "./snapshots.js";

test("SEO groups round-trip through snapshot rows", () => {
  const row = {
    created_at: 1,
    entry_id: "e1",
    fields_json: "{}",
    id: "s1",
    revision: 1,
    role: "editor",
    schema_version: 1,
    seo_json: seoJson({ title: "Hello", noindex: true, image: "media-1" }),
    slug: null,
    title: "Hello",
    updated_at: 1,
    updated_by: "editor-1",
  };
  expect(row.seo_json).toBe('{"image":"media-1","noindex":true,"title":"Hello"}');
  expect(storedSnapshot(row).seo).toEqual({ image: "media-1", noindex: true, title: "Hello" });
  expect(storedSnapshot({ ...row, seo_json: null })).not.toHaveProperty("seo");
  expect(seoJson(undefined)).toBeNull();
  expect(() => storedSnapshot({ ...row, seo_json: '{"canonical":"/a"}' })).toThrow();
});
