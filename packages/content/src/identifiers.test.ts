import { expect, test } from "vitest";
import {
  SLUG_PATTERN,
  MAX_SLUG_LENGTH,
  isContentSlug,
  pagePathFailure,
  collectionRouteFailure,
  collectionPathFailure,
  MAX_ENTRY_SEARCH_LENGTH,
  MAX_MEDIA_SEARCH_LENGTH,
  MAX_MEDIA_USAGE_ENTRIES,
  MAX_BUILD_EXPORT_PAGE_SIZE,
} from "./identifiers.js";

test("route failures expose every reason with shared exact wording", () => {
  expect(pagePathFailure(42)).toEqual({ issue: "type", message: "path must be a string." });
  expect(collectionRouteFailure(null)).toEqual({
    issue: "type",
    message: "route must be a string.",
  });
  for (const path of ["/blog/", "/a//b", "/a?b", "blog", "/a b", "", "/a#b", "/a\\b"]) {
    expect(pagePathFailure(path)).toEqual({
      issue: "canonical",
      message: "path must be a canonical absolute path.",
    });
    expect(collectionRouteFailure(path)).toEqual({
      issue: "canonical",
      message: "route must be a canonical absolute path.",
    });
  }
  expect(pagePathFailure("/a/../b")).toEqual({
    issue: "dot-segment",
    message: "path must not contain dot segments.",
  });
  expect(collectionRouteFailure("/./:slug")).toEqual({
    issue: "dot-segment",
    message: "route must not contain dot segments.",
  });
  expect(pagePathFailure("/a/:id")).toEqual({
    issue: "parameter",
    message: "path must not contain parameter segments.",
  });
  for (const route of ["/blog/:slug/:id", "/", "/blog", "/:slug/:slug", "/x:slug"])
    expect(collectionRouteFailure(route)).toEqual({
      issue: "slug-segment",
      message: "route must contain exactly one :slug segment and no other parameters.",
    });
  expect(pagePathFailure(false, "home")).toEqual({
    issue: "type",
    message: "home must be a string.",
  });
  expect(collectionRouteFailure("/blog", "posts")).toEqual({
    issue: "slug-segment",
    message: "posts must contain exactly one :slug segment and no other parameters.",
  });
});

test("slug checks and collection resolution preserve grammar and length boundaries", () => {
  for (const slug of [
    "Release_Notes",
    "release--notes",
    "-release",
    "a".repeat(101),
    42,
    "",
    "release-notes\n",
  ]) {
    expect(isContentSlug(slug)).toBe(false);
    expect(collectionPathFailure("/blog/:slug", slug)).toEqual({
      issue: "slug",
      message: "slug must use lowercase ASCII letters, digits, and single hyphens.",
    });
  }
  for (const slug of ["release-notes", "123", "a".repeat(100)]) {
    expect(isContentSlug(slug)).toBe(true);
    expect(SLUG_PATTERN.test(slug)).toBe(true);
  }
  expect(collectionPathFailure("/blog/:slug", "release-notes")).toEqual({
    path: "/blog/release-notes",
  });
  expect(collectionPathFailure("/blog/", "valid")).toEqual(collectionRouteFailure("/blog/"));
  expect(collectionPathFailure("/:slug:", "valid")).toEqual(collectionRouteFailure("/:slug:"));
  expect(pagePathFailure("/")).toBeUndefined();
  expect(pagePathFailure("/a/b")).toBeUndefined();
  expect(collectionRouteFailure("/blog/:slug")).toBeUndefined();
});

test("portable transport limits retain their bounds", () => {
  expect([
    MAX_SLUG_LENGTH,
    MAX_ENTRY_SEARCH_LENGTH,
    MAX_MEDIA_SEARCH_LENGTH,
    MAX_MEDIA_USAGE_ENTRIES,
    MAX_BUILD_EXPORT_PAGE_SIZE,
  ]).toEqual([100, 200, 200, 50, 100]);
});
