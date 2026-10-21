import { expect, test } from "vitest";
import type { FieldDefinition, FieldPreviewRegistry } from "./field-types.js";
import { itemSummary, previewLeaf, rowLines } from "./item-summary.js";

const galleryItem: FieldDefinition = {
  fields: {
    media: { required: true, type: "media" },
    alt: { required: false, type: "text" },
    caption: { required: false, type: "text" },
    link: { required: false, type: "url" },
  },
  required: false,
  type: "group",
};

const link: FieldDefinition = {
  fields: {
    children: {
      item: {
        fields: {
          label: { required: true, type: "text" },
          url: { required: true, type: "url" },
        },
        required: false,
        type: "group",
      },
      required: false,
      type: "list",
    },
    label: { required: true, type: "text" },
    url: { required: false, type: "url" },
  },
  required: false,
  type: "group",
};

const previews: FieldPreviewRegistry = { media: () => null };

test("a captioned gallery item uses the caption and the preview title", () => {
  const value = { caption: "Blue  portrait\n", media: "m1" };
  const summary = itemSummary(galleryItem, value, "caption");
  expect(summary).toEqual({ media: true, primary: "Blue portrait", secondary: undefined });
  expect(rowLines(summary, { detail: "JPEG · 640 × 479", title: "(1).jpeg" })).toEqual({
    primary: "Blue portrait",
    secondary: "(1).jpeg",
  });
});

test("a media-only item takes its lines from the preview, then the generic label", () => {
  const summary = itemSummary(galleryItem, { alt: " ", media: "m1" }, "caption");
  expect(summary).toEqual({ media: true, primary: undefined });
  expect(rowLines(summary, { detail: "JPEG · 675 × 1200", title: "(3).jpeg" })).toEqual({
    primary: "(3).jpeg",
    secondary: "JPEG · 675 × 1200",
  });
  expect(rowLines(summary, { visual: null })).toEqual({ primary: "Media selected" });
  expect(rowLines(summary, undefined)).toEqual({ primary: "Media selected" });
});

test("an empty item is named Empty item", () => {
  expect(rowLines(itemSummary(galleryItem, {}, "caption"), undefined)).toEqual({
    primary: "Empty item",
  });
});

test("a navigation link uses its label and its own URL, not a submenu label", () => {
  const value = {
    children: [{ label: "Archive", url: "/blog/archive" }],
    label: "Blog",
    url: "/blog",
  };
  expect(rowLines(itemSummary(link, value, "label"), undefined)).toEqual({
    primary: "Blog",
    secondary: "/blog",
  });
});

test("without an item label the first useful text leads and another field follows", () => {
  const value = { caption: "Kitchen", link: "https://example.com/" };
  expect(itemSummary(galleryItem, value)).toMatchObject({
    primary: "Kitchen",
    secondary: "https://example.com/",
  });
});

test("rich text contributes plain text and never its JSON", () => {
  const definition: FieldDefinition = {
    fields: { body: { required: false, type: "richText" } },
    required: false,
    type: "group",
  };
  const body = {
    content: [{ content: [{ text: "Hello", type: "text" }], type: "paragraph" }],
    type: "doc",
  };
  expect(itemSummary(definition, { body }).primary).toBe("Hello");
});

test("the preview leaf is the first present direct child with a preview", () => {
  expect(previewLeaf(galleryItem, { media: "m1" }, previews)).toMatchObject({
    key: "media",
    value: "m1",
  });
  expect(previewLeaf(galleryItem, { caption: "x" }, previews)).toBeUndefined();
  expect(previewLeaf(galleryItem, { media: "m1" }, undefined)).toBeUndefined();
  expect(previewLeaf(link, { label: "Blog" }, previews)).toBeUndefined();
});
