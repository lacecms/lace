// @ts-nocheck
// TODO(rf2): Type recursive descriptor fixtures, malformed runtime inputs and table tuples.
import { test, expect } from "vitest";
import { effectiveAltText, collectFieldMedia, detachFieldMedia } from "./media.js";
import { field } from "../fields/builders.js";
import { encodeFieldPath, decodeFieldPath } from "./field-paths.js";

test("effective alt text prefers a non-blank usage alt, then the media alt", () => {
  expect(effectiveAltText("Team at work", "Office")).toBe("Team at work");
  expect(effectiveAltText("   ", "Office")).toBe("Office");
  expect(effectiveAltText(undefined, "Office")).toBe("Office");
  expect(effectiveAltText(undefined, null)).toBe("");
  expect(effectiveAltText("", " ")).toBe("");
});

test("media traversal distinguishes groups, list indices and legacy paths", () => {
  const fields = {
    cover: field.media(),
    contact: field.group({ fields: { photo: field.media() } }),
    images: field.list({
      item: field.group({ fields: { image: field.media(), caption: field.text() } }),
    }),
    media: field.list({ item: field.media() }),
  };
  const data = {
    cover: "a",
    contact: { photo: "b" },
    images: [{ image: "a", caption: "not-media" }, { image: "b" }],
    media: ["c"],
  };
  expect(
    collectFieldMedia(fields, data).map(({ mediaId, path }) => [mediaId, encodeFieldPath(path)]),
  ).toEqual([
    ["a", "cover"],
    ["b", "/contact/photo"],
    ["a", "/images/0/image"],
    ["b", "/images/1/image"],
    ["c", "/media/0"],
  ]);
  expect(decodeFieldPath("cover")).toEqual(["cover"]);
  expect(decodeFieldPath("/images/0/image")).toEqual(["images", 0, "image"]);
});

test("media detaching clears leaves, drops media list items and keeps other values", () => {
  const fields = {
    cover: field.media(),
    contact: field.group({ fields: { photo: field.media(), name: field.text() } }),
    images: field.list({
      item: field.group({ fields: { image: field.media(), caption: field.text() } }),
    }),
    media: field.list({ item: field.media() }),
    title: field.text(),
  };
  const data = Object.freeze({
    cover: "a",
    contact: { name: "Ada", photo: "a" },
    images: [{ image: "a", caption: "kept" }, { image: "b" }],
    media: ["a", "c", "a"],
    title: "a",
  });
  expect(detachFieldMedia(fields, data, "a")).toEqual({
    contact: { name: "Ada" },
    images: [{ caption: "kept" }, { image: "b" }],
    media: ["c"],
    title: "a",
  });
  expect(data.cover).toBe("a");
  expect(detachFieldMedia(fields, data, "missing")).toBe(data);
  const untouched = { contact: { photo: "b" }, images: [{ image: "b" }] };
  const result = detachFieldMedia(fields, { ...untouched, cover: "a" }, "a");
  expect(result).toEqual(untouched);
  expect(result.contact).toBe(untouched.contact);
  expect(result.images).toBe(untouched.images);
  expect(collectFieldMedia(fields, detachFieldMedia(fields, data, "a"))).not.toContainEqual(
    expect.objectContaining({ mediaId: "a" }),
  );
});
