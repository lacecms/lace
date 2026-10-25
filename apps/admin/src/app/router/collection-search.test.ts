import { expect, test } from "vitest";
import { parseCollectionSearch } from "./collection-search.js";

test("keeps supported collection-list parameters", () => {
  expect(parseCollectionSearch({ q: "  launch ", sort: "title", status: "changed" })).toEqual({
    filters: undefined,
    q: "launch",
    sort: "title",
    status: "changed",
  });
});

const none = { filters: undefined, q: undefined, sort: undefined, status: undefined };

test("drops unsupported, blank, over-long, and default values", () => {
  expect(parseCollectionSearch({ sort: "author", status: "archived" })).toStrictEqual(none);
  expect(parseCollectionSearch({ q: "   " })).toStrictEqual(none);
  expect(parseCollectionSearch({ q: "x".repeat(201) })).toStrictEqual(none);
  expect(parseCollectionSearch({ q: 42, sort: "-updatedAt" })).toStrictEqual(none);
  expect(parseCollectionSearch({ q: "x".repeat(200) })).toStrictEqual({
    ...none,
    q: "x".repeat(200),
  });
});

test("shape parsing retains configured sorts until metadata and recovers valid filter peers", () => {
  const parsed = parseCollectionSearch({
    sort: "-field:hidden",
    filters: JSON.stringify([
      { field: "z", op: "eq", value: false },
      { field: "broken", op: "range", min: 10, max: 0 },
      { field: "a", op: "in", values: ["b", "a"] },
      { field: "z", op: "isSet" },
    ]),
    after: "never-in-url",
  });
  expect(parsed.sort).toBe("-field:hidden");
  expect(parsed.filters).toEqual([
    { field: "a", op: "in", values: ["a", "b"] },
    { field: "z", op: "eq", value: false },
  ]);
  expect(parsed).not.toHaveProperty("after");
  expect(parseCollectionSearch({ filters: "{" }).filters).toBeUndefined();
});
