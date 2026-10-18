import { expect, test } from "vitest";
import { parseMediaSearch } from "./media-search.js";

test("keeps supported media-library parameters", () => {
  expect(
    parseMediaSearch({ q: "  hero ", sort: "filename", type: "image/png", view: "list" }),
  ).toEqual({ q: "hero", sort: "filename", type: "image/png", view: "list" });
  expect(parseMediaSearch({ type: "image/gif" })).toMatchObject({ type: "image/gif" });
});

const none = { q: undefined, sort: undefined, type: undefined, view: undefined };

test("drops unsupported, blank, over-long, and default values", () => {
  expect(parseMediaSearch({ sort: "author", type: "image/svg+xml", view: "cards" })).toStrictEqual(
    none,
  );
  expect(parseMediaSearch({ q: "   ", view: "grid" })).toStrictEqual(none);
  expect(parseMediaSearch({ q: "x".repeat(201) })).toStrictEqual(none);
  expect(parseMediaSearch({ q: 42, sort: "-createdAt" })).toStrictEqual(none);
  expect(parseMediaSearch({ q: "x".repeat(200) })).toStrictEqual({ ...none, q: "x".repeat(200) });
});
