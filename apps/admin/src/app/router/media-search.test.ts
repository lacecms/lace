import { expect, test } from "vitest";
import { parseMediaSearch } from "./media-search.js";

test("keeps supported media-library parameters", () => {
  expect(
    parseMediaSearch({ q: "  hero ", sort: "filename", type: "image/png", view: "list" }),
  ).toEqual({ q: "hero", sort: "filename", tag: undefined, type: "image/png", view: "list" });
  expect(parseMediaSearch({ type: "image/gif" })).toMatchObject({ type: "image/gif" });
});

const none = { q: undefined, sort: undefined, tag: undefined, type: undefined, view: undefined };

test("drops unsupported, blank, over-long, and default values", () => {
  expect(parseMediaSearch({ sort: "author", type: "image/svg+xml", view: "cards" })).toStrictEqual(
    none,
  );
  expect(parseMediaSearch({ q: "   ", view: "grid" })).toStrictEqual(none);
  expect(parseMediaSearch({ q: "x".repeat(201) })).toStrictEqual(none);
  expect(parseMediaSearch({ q: 42, sort: "-createdAt" })).toStrictEqual(none);
  expect(parseMediaSearch({ q: "x".repeat(200) })).toStrictEqual({ ...none, q: "x".repeat(200) });
});

test("keeps canonical tag filters and drops invalid or excess tags", () => {
  expect(parseMediaSearch({ tag: "Cover" })).toStrictEqual({ ...none, tag: ["cover"] });
  expect(parseMediaSearch({ tag: ["project-2026", "cover", "cover"] })).toStrictEqual({
    ...none,
    tag: ["cover", "project-2026"],
  });
  expect(
    parseMediaSearch({ tag: ["Cover", "summer trip", "a", "b", "c", "d", "e"] }),
  ).toStrictEqual({ ...none, tag: ["a", "b", "c", "cover", "d"] });
  expect(parseMediaSearch({ tag: ["summer trip"] })).toStrictEqual(none);
  expect(parseMediaSearch({ tag: [] })).toStrictEqual(none);
});
