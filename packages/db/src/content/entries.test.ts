// @ts-nocheck
// TODO(rf2): Type legacy SQLite rows, branded snapshot fixtures and malformed projection inputs.
import { expect, test } from "vitest";

test("entry cursor identity binds canonical operands and effective capabilities", async () => {
  const { entryCursorKind } = await import("./entries.js");
  const query = {
    sortableFields: [{ key: "category", type: "select", options: ["b", "a"] }],
    filterableFields: [
      { key: "year", type: "number" },
      { key: "category", type: "select", options: ["a", "b"] },
    ],
    searchableFields: [{ key: "description", type: "text" }],
    filters: [
      { field: "year", op: "eq", value: 0 },
      { field: "category", op: "in", values: ["b", "a"] },
    ],
  };
  const input = { modelKey: "posts", sort: "-updatedAt", limit: 1, listFields: [], query };
  const identity = await entryCursorKind(input);
  const changed = (delta) => entryCursorKind({ ...input, query: { ...query, ...delta } });
  expect(
    await changed({
      filters: [{ ...query.filters[1], values: ["a", "b"] }, query.filters[0]],
      filterableFields: [...query.filterableFields].reverse(),
    }),
  ).toBe(identity);
  expect(await entryCursorKind({ ...input, listFields: ["year"], limit: 100 })).toBe(identity);
  expect(await changed({ filters: [{ field: "year", op: "eq", value: 1 }] })).not.toBe(identity);
  expect(await changed({ searchableFields: [] })).not.toBe(identity);
  expect(
    await changed({
      sortableFields: [{ key: "category", type: "select", options: ["a", "b", "c"] }],
    }),
  ).not.toBe(identity);
});

test("cursor fingerprints expire across matching versions and runtime policy changes", async () => {
  const { entryCursorKind, decodeEntryCursor } = await import("./entries.js");
  const { encodeSortCursor } = await import("../shared/cursors.js");
  const input = { modelKey: "posts", sort: "title", limit: 1, listFields: [] };
  const node = await entryCursorKind(input);
  const cloud = await entryCursorKind({
    ...input,
    listQueryLimits: { maxSearchLength: 48, maxLikePatternBytes: 50 },
  });
  expect(node).not.toBe(cloud);
  expect(node).toContain("sqlite-like-v1");
  const old = JSON.stringify(["entries", "posts", "title", null, null, "old-glob"]);
  for (const foreign of [old, cloud])
    expect(() => decodeEntryCursor(encodeSortCursor(foreign, "a", "a"), node, "title")).toThrow();
});
