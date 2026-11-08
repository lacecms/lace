// @ts-nocheck
// TODO(rf2): Type mutable transport fixtures and deliberately malformed metadata.
import { defineBlock, field, toBlockMetadata } from "@lacecms/content";
import * as v from "valibot";
import { describe, expect, test } from "vitest";
import { validationError } from "../errors/envelope.js";
import { blockMetadataSchema, fieldMetadataMapSchema, fieldMetadataSchema } from "./metadata.js";
import { toContentModelDto } from "./model-projection.js";
import { contentModelSchema } from "./models.js";

describe("shared REST contract DTOs", () => {
  test("accepts only normalized portable field metadata", () => {
    expect(
      v.safeParse(fieldMetadataMapSchema, {
        active: { required: false, type: "boolean" },
        body: { label: "Body", maxLength: 500, required: false, type: "textarea" },
        date: { required: false, type: "date" },
        datetime: { required: false, type: "datetime" },
        featured: { defaultValue: false, required: false, type: "boolean" },
        kind: { options: ["article", "note"], required: true, type: "select" },
        media: { required: false, type: "media" },
        richBody: {
          defaultValue: {
            content: [{ content: [{ text: "Lace", type: "text" }], type: "paragraph" }],
            type: "doc",
          },
          required: false,
          type: "richText",
        },
        score: { max: 10, min: 0, required: false, type: "number" },
        title: { required: false, type: "text" },
        url: { required: false, type: "url" },
      }).success,
    ).toBe(true);
    expect(
      v.safeParse(fieldMetadataMapSchema, {
        body: { required: false, surprise: true, type: "text" },
      }).success,
    ).toBe(false);
    expect(
      v.safeParse(fieldMetadataMapSchema, {
        body: { required: false, type: "select" },
      }).success,
    ).toBe(false);
  });
});

test("composite metadata and content round-trip with nested issue pointers", () => {
  const cards = field.list({
    item: field.group({ fields: { title: field.text({ required: true }), media: field.media() } }),
  });
  expect(v.safeParse(fieldMetadataMapSchema, { cards }).success).toBe(true);
  expect(
    v.safeParse(fieldMetadataMapSchema, {
      cards: { ...cards, item: { ...cards.item, fields: { invalid: { type: "wrong" } } } },
    }).success,
  ).toBe(false);
  let deep = field.text();
  for (let i = 0; i < 4; i++)
    deep = {
      type: "list",
      required: false,
      item: { type: "group", required: false, fields: { child: deep } },
    };
  expect(v.safeParse(fieldMetadataMapSchema, { deep }).success).toBe(false);
  const failure = validationError([
    {
      code: "invalid_field_value",
      message: "Invalid value.",
      path: "/blocks/0/data/images/2/image",
    },
  ]);
  expect(failure.status).toBe(422);
  expect(failure.body.error.details.issues[0].path).toBe("/blocks/0/data/images/2/image");
});

test("cyclic and accessor-backed forged metadata are refused without evaluation", () => {
  const cyclic = { type: "group", required: false, fields: {} };
  cyclic.fields.child = cyclic;
  expect(v.safeParse(fieldMetadataSchema, cyclic).success).toBe(false);
  expect(
    v.safeParse(blockMetadataSchema, { type: "cyclic", version: 1, fields: { child: cyclic } })
      .success,
  ).toBe(false);
  const accessor = {};
  Object.defineProperty(accessor, "child", {
    enumerable: true,
    get() {
      throw new Error("executed accessor");
    },
  });
  expect(v.safeParse(fieldMetadataMapSchema, accessor).success).toBe(false);
});

test("list label metadata survives recursive contracts and invalid targets fail", () => {
  const cards = field.list({
    itemLabel: "title",
    item: field.group({ fields: { title: field.text(), image: field.media() } }),
  });
  expect(v.parse(fieldMetadataMapSchema, { cards }).cards.itemLabel).toBe("title");
  for (const itemLabel of ["image", "absent", "title.child", 1])
    expect(v.safeParse(fieldMetadataMapSchema, { cards: { ...cards, itemLabel } }).success).toBe(
      false,
    );
});

test("CE9A recursive metadata preserves placeholders and rejects misplaced prompts", () => {
  const fields = {
    group: field.group({
      fields: { tags: field.list({ item: field.text({ placeholder: "Tag" }) }) },
    }),
  };
  expect(v.parse(fieldMetadataMapSchema, JSON.parse(JSON.stringify(fields)))).toEqual(fields);
  const block = {
    type: "card",
    version: 1,
    fields,
    settings: { tone: field.text({ defaultValue: "normal", placeholder: "Tone" }) },
  };
  expect(v.parse(blockMetadataSchema, JSON.parse(JSON.stringify(block)))).toEqual(block);
  for (const invalid of [
    { type: "media", required: false, placeholder: "Bad" },
    { type: "text", required: false, placeholder: 3 },
  ]) {
    expect(
      v.safeParse(fieldMetadataMapSchema, {
        group: { type: "group", required: false, fields: { value: invalid } },
      }).success,
    ).toBe(false);
  }
});

test("CE9B layout metadata round trips and rejects ambiguous references", () => {
  const layout = { mode: "tabs", groups: [{ key: "main", label: "Main", fields: ["body"] }] };
  const fields = {
    body: field.text(),
    nested: field.list({ item: field.group({ fields: { body: field.text() }, layout }) }),
  };
  const block = toBlockMetadata(
    defineBlock({
      type: "layout",
      version: 1,
      fields,
      layout,
      settings: { body: field.text({ defaultValue: "" }) },
      settingsLayout: layout,
    }),
  );
  const model = toContentModelDto({
    key: "layout",
    kind: "global",
    version: 1,
    fields,
    layout,
    blocks: ["layout"],
    blockDefinitions: [block],
  });
  const json = JSON.parse(JSON.stringify(model));
  expect(v.parse(contentModelSchema, json)).toEqual(json);
  expect(
    v.safeParse(contentModelSchema, {
      ...json,
      layout: { ...layout, groups: [{ ...layout.groups[0], fields: ["missing"] }] },
    }).success,
  ).toBe(false);
  expect(
    v.safeParse(contentModelSchema, {
      ...json,
      layout: { ...layout, groups: [...layout.groups, ...layout.groups] },
    }).success,
  ).toBe(false);
  expect(
    v.safeParse(blockMetadataSchema, { ...block, settingsLayout: { ...layout, mode: "unknown" } })
      .success,
  ).toBe(false);
});

test("recursive select card metadata is validated through shared descriptors", () => {
  const select = field.select({
    options: ["a"],
    presentation: {
      control: "cards",
      choices: [
        { value: "a", label: "A", diagram: { cells: [{ x: 0, y: 0, width: 12, height: 12 }] } },
      ],
    },
  });
  const nested = field.list({ item: field.group({ fields: { select } }) });
  expect(v.safeParse(fieldMetadataSchema, nested).success).toBe(true);
  const forged = JSON.parse(JSON.stringify(nested));
  forged.item.fields.select.presentation.choices[0].diagram.cells[0].width = 13;
  expect(v.safeParse(fieldMetadataSchema, forged).success).toBe(false);
  forged.item.fields.select = {
    type: "boolean",
    required: false,
    presentation: select.presentation,
  };
  expect(v.safeParse(fieldMetadataSchema, forged).success).toBe(false);
  const block = toBlockMetadata(
    defineBlock({
      type: "custom",
      version: 1,
      fields: { nested },
      settings: {
        select: field.select({
          options: ["a"],
          presentation: select.presentation,
          defaultValue: "a",
        }),
      },
    }),
  );
  expect(v.safeParse(blockMetadataSchema, block).success).toBe(true);
});

test("block visibility metadata uses shared validation for forged REST input", () => {
  const block = toBlockMetadata(
    defineBlock({
      type: "conditional",
      version: 1,
      fields: {},
      settings: {
        mode: field.select({ options: ["a", "b"], required: true, defaultValue: "a" }),
        wrap: field.boolean({ defaultValue: true }),
      },
      settingsVisibility: { wrap: { setting: "mode", values: ["a"] } },
    }),
  );
  expect(v.safeParse(blockMetadataSchema, JSON.parse(JSON.stringify(block))).success).toBe(true);
  for (const settingsVisibility of [
    { missing: { setting: "mode", values: ["a"] } },
    { wrap: { setting: "missing", values: ["a"] } },
    { wrap: { setting: "mode", values: ["unknown"] } },
    { wrap: { setting: "mode", values: ["a", "a"] } },
    { wrap: { setting: "mode", values: ["a"], css: "bad" } },
  ]) {
    expect(v.safeParse(blockMetadataSchema, { ...block, settingsVisibility }).success).toBe(false);
  }
  expect(
    v.safeParse(blockMetadataSchema, {
      ...block,
      settings: { ...block.settings, mode: { ...block.settings.mode, required: false } },
    }).success,
  ).toBe(false);
});

test("SM5A visibility metadata round trips at every owner and rejects forged rules", () => {
  const kinds = {
    kind: field.select({ options: ["image", "video"], required: true, defaultValue: "image" }),
  };
  const rules = {
    media: { field: "kind", values: ["image"] },
    videoUrl: { field: "kind", values: ["video"] },
  };
  const fields = {
    ...kinds,
    media: field.media({ required: true }),
    videoUrl: field.url({ required: true }),
    gallery: field.list({
      item: field.group({
        fields: { ...kinds, media: field.media(), videoUrl: field.url() },
        visibility: rules,
      }),
    }),
  };
  const block = toBlockMetadata(
    defineBlock({
      type: "conditional",
      version: 1,
      fields: { hasCta: field.boolean(), ctaUrl: field.url() },
      visibility: { ctaUrl: { field: "hasCta", values: [true] } },
    }),
  );
  const model = toContentModelDto({
    key: "works",
    kind: "global",
    version: 1,
    fields,
    visibility: rules,
    blocks: ["conditional"],
    blockDefinitions: [block],
  });
  const json = JSON.parse(JSON.stringify(model));
  expect(v.parse(contentModelSchema, json)).toEqual(json);
  expect(json.visibility).toEqual(rules);
  expect(json.fields.gallery.item.visibility).toEqual(rules);
  expect(json.blockDefinitions[0].visibility).toEqual({
    ctaUrl: { field: "hasCta", values: [true] },
  });
  const forged = [
    { media: { field: "missing", values: ["image"] } },
    { media: { field: "kind", values: ["audio"] } },
    { media: { field: "kind", values: ["image"], equals: "image" } },
    { media: { field: "kind", values: ["image"] }, kind: { field: "media", values: ["x"] } },
  ];
  for (const visibility of forged) {
    expect(v.safeParse(contentModelSchema, { ...json, visibility }).success).toBe(false);
    expect(
      v.safeParse(contentModelSchema, {
        ...json,
        fields: {
          ...json.fields,
          gallery: { ...json.fields.gallery, item: { ...json.fields.gallery.item, visibility } },
        },
      }).success,
    ).toBe(false);
  }
  expect(
    v.safeParse(blockMetadataSchema, {
      ...block,
      visibility: { ctaUrl: { field: "hasCta", values: ["yes"] } },
    }).success,
  ).toBe(false);
  const plain = toContentModelDto({
    key: "plain",
    kind: "global",
    version: 1,
    fields: kinds,
    blocks: [],
  });
  expect(plain).not.toHaveProperty("visibility");
});
