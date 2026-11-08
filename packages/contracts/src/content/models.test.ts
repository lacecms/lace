// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { blockMetadataSchema } from "./metadata.js";
import { toContentModelDto } from "./model-projection.js";
import { contentModelListSchema } from "./models.js";

describe("shared REST contract DTOs", () => {
  test("validates portable allowed block metadata against each model", () => {
    const hero = {
      fields: { heading: { required: true, type: "text" } },
      label: "Hero",
      type: "hero",
      version: 1,
    };
    expect(v.parse(blockMetadataSchema, hero)).toEqual(hero);
    expect(
      v.parse(contentModelListSchema, {
        items: [
          {
            blockDefinitions: [hero],
            blocks: ["hero"],
            fields: {},
            key: "home",
            kind: "page",
            path: "/",
            version: 1,
          },
        ],
      }),
    ).toMatchObject({ items: [{ blockDefinitions: [hero] }] });
    expect(
      v.safeParse(contentModelListSchema, {
        items: [
          {
            blockDefinitions: [hero],
            blocks: ["quote"],
            fields: {},
            key: "home",
            kind: "page",
            path: "/",
            version: 1,
          },
        ],
      }).success,
    ).toBe(false);
    expect(v.safeParse(blockMetadataSchema, { ...hero, validate: () => true }).success).toBe(false);
    expect(
      v.safeParse(blockMetadataSchema, {
        ...hero,
        defaultValue: { unknown: "field" },
      }).success,
    ).toBe(false);
  });
});

describe("admin entry list contracts", () => {
  test("content models carry valid collection list fields only", () => {
    const fields = { author: { required: false, type: "text" } };
    const collection = { blocks: [], fields, key: "posts", kind: "collection", route: "/b/:slug" };
    const dto = toContentModelDto({ ...collection, listFields: ["author"], version: 1 });
    expect(v.parse(contentModelListSchema, { items: [dto] }).items[0].listFields).toEqual([
      "author",
    ]);
    expect(toContentModelDto({ ...collection, version: 1 })).not.toHaveProperty("listFields");
    for (const invalid of [
      { ...collection, listFields: [], version: 1 },
      { ...collection, listFields: ["author", "author"], version: 1 },
      { ...collection, listFields: ["missing"], version: 1 },
      {
        blocks: [],
        fields,
        key: "home",
        kind: "page",
        listFields: ["author"],
        path: "/",
        version: 1,
      },
    ]) {
      expect(v.safeParse(contentModelListSchema, { items: [invalid] }).success).toBe(false);
    }
  });
});

test("block definitions match allowed blocks by type in any order", () => {
  const hero = { fields: {}, type: "hero", version: 1 };
  const quote = { fields: {}, type: "quote", version: 1 };
  const model = {
    blocks: ["hero", "quote"],
    fields: {},
    key: "home",
    kind: "page",
    path: "/",
    version: 1,
  };
  const accepts = (blocks, blockDefinitions) =>
    v.safeParse(contentModelListSchema, { items: [{ ...model, blocks, blockDefinitions }] })
      .success;
  expect(accepts(model.blocks, [quote, hero])).toBe(true);
  expect(accepts(model.blocks, [hero])).toBe(false);
  expect(accepts(model.blocks, [hero, quote, { fields: {}, type: "extra", version: 1 }])).toBe(
    false,
  );
  expect(accepts(model.blocks, [hero, hero])).toBe(false);
  expect(accepts(["hero", "hero"], [hero, hero])).toBe(false);
});
