import { mediaListQuerySchema, mediaTagsInputSchema } from "@lacecms/contracts";
import * as v from "valibot";
import { expect, test } from "vitest";
import {
  canonicalTagFilter,
  MAX_MEDIA_TAG_FILTERS,
  MAX_MEDIA_TAGS_PER_ITEM,
  sortedTags,
} from "./media-tags.js";

const distinct = (count: number) => Array.from({ length: count }, (_, index) => `tag-${index}`);

test("admin tag limits match the API contracts", () => {
  expect(v.safeParse(mediaTagsInputSchema, distinct(MAX_MEDIA_TAGS_PER_ITEM)).success).toBe(true);
  expect(v.safeParse(mediaTagsInputSchema, distinct(MAX_MEDIA_TAGS_PER_ITEM + 1)).success).toBe(
    false,
  );
  expect(v.safeParse(mediaListQuerySchema, { tag: distinct(MAX_MEDIA_TAG_FILTERS) }).success).toBe(
    true,
  );
  expect(
    v.safeParse(mediaListQuerySchema, { tag: distinct(MAX_MEDIA_TAG_FILTERS + 1) }).success,
  ).toBe(false);
});

test("tag filters are normalized, deduplicated, sorted, and limited", () => {
  expect(canonicalTagFilter("Cover")).toEqual(["cover"]);
  expect(canonicalTagFilter(["travel", " Cover ", "cover"])).toEqual(["cover", "travel"]);
  expect(canonicalTagFilter(["Cover", "summer trip", "a", "b", "c", "d", "e"])).toEqual([
    "a",
    "b",
    "c",
    "cover",
    "d",
  ]);
  expect(canonicalTagFilter(["summer trip", 3, null])).toBeUndefined();
  expect(canonicalTagFilter([])).toBeUndefined();
  expect(canonicalTagFilter(undefined)).toBeUndefined();
  expect(canonicalTagFilter({ tag: "cover" })).toBeUndefined();
});

test("item tags sort without duplicates", () => {
  expect(sortedTags(["b", "a", "b"])).toEqual(["a", "b"]);
});
