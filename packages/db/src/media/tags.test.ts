// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";

test("media tag SQL binds canonical sets, literal prefix ranges, and cursors", async () => {
  const { mediaTagFilters, mediaTagCatalogQuery } = await import("./tags.js");
  const { mediaCursorKind } = await import("./catalog.js");
  const { encodeSortCursor } = await import("../shared/cursors.js");
  expect(mediaCursorKind({ sort: "filename", tags: [" B ", "a", "a"] })).toBe(
    mediaCursorKind({ sort: "filename", tags: ["a", "b"] }),
  );
  expect(mediaCursorKind({ sort: "filename", tags: ["a"] })).not.toBe(
    mediaCursorKind({ sort: "filename", tags: ["b"] }),
  );
  expect(mediaTagFilters(["B", "a"]).bindings).toEqual(["a", "b"]);
  expect(mediaTagFilters(["B", "a"]).conditions).toHaveLength(2);
  const query = mediaTagCatalogQuery({ q: " Re ", limit: 2 });
  expect(query.params).toEqual(["re", "rf", 3]);
  const after = encodeSortCursor(query.kind, "red", "red");
  expect(mediaTagCatalogQuery({ q: "RE", limit: 2, after }).params).toEqual(["re", "rf", "red", 3]);
  expect(() => mediaTagCatalogQuery({ q: "other", limit: 2, after })).toThrow();
});
