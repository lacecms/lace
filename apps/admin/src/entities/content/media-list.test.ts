import { expect, test } from "vitest";
import { builtInBlocks, field } from "@lacecms/content";
import type { ContentModelDto } from "@lacecms/contracts";
import { snapshotBudget } from "./composite-values.js";
import {
  mediaIdsInList,
  mediaListCapacity,
  mediaListItems,
  mediaListTarget,
} from "./media-list.js";

const gallery = builtInBlocks.gallery.fields.images;

test("eligible items are media or a group with one required media field", () => {
  expect(mediaListTarget(field.media())).toEqual({});
  expect(gallery.type === "list" && mediaListTarget(gallery.item)).toEqual({ key: "media" });
  expect(
    mediaListTarget(field.group({ fields: { photo: field.media(), name: field.text() } })),
  ).toBeUndefined();
  expect(
    mediaListTarget(
      field.group({
        fields: { front: field.media({ required: true }), back: field.media({ required: true }) },
      }),
    ),
  ).toBeUndefined();
  expect(mediaListTarget(field.group({ fields: { name: field.text() } }))).toBeUndefined();
  expect(mediaListTarget(field.text())).toBeUndefined();
});

test("scalar media items are the identifiers in order", () => {
  expect(mediaListItems(field.media(), {}, ["b", "a"])).toEqual(["b", "a"]);
});

test("group items keep child defaults and get their own media", () => {
  const item = field.group({
    fields: {
      cover: field.media({ required: true }),
      label: field.text({ defaultValue: "Untitled" }),
      tags: field.list({ item: field.text(), defaultValue: ["a"] }),
    },
  });
  const items = mediaListItems(item, { key: "cover" }, ["one", "two"]);
  expect(items).toEqual([
    { cover: "one", label: "Untitled", tags: ["a"] },
    { cover: "two", label: "Untitled", tags: ["a"] },
  ]);
  (items[0] as { tags: string[] }).tags.push("b");
  expect((items[1] as { tags: string[] }).tags).toEqual(["a"]);
});

test("a declared item default is copied with its media replaced", () => {
  const item = field.group({
    defaultValue: { cover: "default-media", label: "Project" },
    fields: { cover: field.media({ required: true }), label: field.text() },
  });
  expect(mediaListItems(item, { key: "cover" }, ["chosen"])).toEqual([
    { cover: "chosen", label: "Project" },
  ]);
});

test("the built-in gallery item holds only its media", () => {
  if (gallery.type !== "list") throw new Error("gallery images is a list");
  expect(mediaListItems(gallery.item, { key: "media" }, ["m1"])).toEqual([{ media: "m1" }]);
});

test("media already in a list is collected from string values only", () => {
  expect([...mediaIdsInList({ key: "media" }, [{ media: "a" }, {}, { media: 3 }, null])]).toEqual([
    "a",
  ]);
  expect([...mediaIdsInList({}, ["a", "b", "a", undefined])]).toEqual(["a", "b"]);
});

const media = field.media();
const fitsWithin = (limit: number) => (next: readonly unknown[]) => next.length <= limit;

test("the list maximum caps capacity", () => {
  const list = Array.from({ length: 47 }, (_, index) => `m${index}`);
  expect(
    mediaListCapacity({ fits: () => true, item: media, list, maximum: 50, target: {} }),
  ).toEqual({ capacity: 3, cause: "list" });
  expect(
    mediaListCapacity({
      fits: () => true,
      item: media,
      list: [...list, "x", "y", "z"],
      maximum: 50,
      target: {},
    }),
  ).toEqual({ capacity: 0, cause: "list" });
});

test("the entry budget caps capacity", () => {
  const list = Array.from({ length: 10 }, (_, index) => `m${index}`);
  expect(
    mediaListCapacity({ fits: fitsWithin(15), item: media, list, maximum: 100, target: {} }),
  ).toEqual({ capacity: 5, cause: "budget" });
});

test("nested list defaults count against the snapshot budget", () => {
  const item = field.group({
    fields: {
      cover: field.media({ required: true }),
      tags: field.list({ item: field.text(), defaultValue: ["a", "b"] }),
    },
  });
  const projects = field.list({ item, maxItems: 100 });
  const filler = field.list({ item: field.text() });
  const model = {
    fields: Object.fromEntries([...Array(5).keys()].map((index) => [`filler${index}`, filler])),
    blockDefinitions: [{ type: "projects", fields: { projects } }],
  } as unknown as ContentModelDto;
  // 491 elements: five filler lists of 98 and one of 1.
  const fields = Object.fromEntries(
    [...Array(5).keys()].map((index) => [
      `filler${index}`,
      Array.from({ length: index === 4 ? 99 : 98 }, () => "x"),
    ]),
  );
  const values = (next: readonly unknown[]) => ({
    title: "Title",
    fields,
    blocks: [{ type: "projects", data: { projects: next } }],
  });
  expect(snapshotBudget(model, values([]) as never).count).toBe(491);
  expect(
    mediaListCapacity({
      fits: (next) => snapshotBudget(model, values(next) as never).problem === undefined,
      item,
      list: [],
      maximum: 100,
      target: { key: "cover" },
    }),
  ).toEqual({ capacity: 3, cause: "budget" });
});

test("an exact budget boundary is allowed", () => {
  expect(
    mediaListCapacity({ fits: fitsWithin(500), item: media, list: [], maximum: 100, target: {} }),
  ).toEqual({ capacity: 100, cause: "list" });
  const list = Array.from({ length: 98 }, () => "m");
  expect(
    mediaListCapacity({ fits: fitsWithin(100), item: media, list, maximum: 100, target: {} }),
  ).toEqual({ capacity: 2, cause: "list" });
});
