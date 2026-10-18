import { expect, test } from "vitest";
import { mediaTypeOptions, normalizedMediaQuery } from "./library-query.js";

test("library queries drop blank and default values", () => {
  expect(
    normalizedMediaQuery({ q: "  ", sort: "-createdAt", type: undefined, view: undefined }),
  ).toStrictEqual({});
  expect(
    normalizedMediaQuery({ q: " hero ", sort: "size", type: "image/png", view: "list" }),
  ).toStrictEqual({ q: "hero", sort: "size", type: "image/png", view: "list" });
});

test("the type filter offers every uploadable format", () => {
  expect(mediaTypeOptions.map((option) => option.label)).toEqual([
    "All",
    "JPEG",
    "PNG",
    "GIF",
    "WebP",
    "AVIF",
  ]);
  expect(normalizedMediaQuery({ type: "image/gif" })).toStrictEqual({ type: "image/gif" });
});
