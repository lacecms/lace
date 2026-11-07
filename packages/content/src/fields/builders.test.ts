import { test, expect } from "vitest";
import { field } from "./builders.js";
import { toFieldMetadata } from "./metadata.js";
import type { FieldDefinition } from "./definitions.js";

// These tests intentionally pass forged descriptors and malformed options.
const unsafeField = field as unknown as Record<
  keyof typeof field,
  (value: unknown) => FieldDefinition
>;
import { FieldConfigurationError } from "../shared/errors.js";
import { validateFieldValue } from "./validation.js";
import { defineBlock } from "../blocks/definition.js";

const fieldCases: [string, () => FieldDefinition, string][] = [
  ["text", () => field.text({ defaultValue: "Lace" }), "text"],
  ["textarea", () => field.textarea({ defaultValue: "Lace" }), "textarea"],
  ["richText", () => field.richText({ defaultValue: { content: [], type: "doc" } }), "richText"],
  ["number", () => field.number({ defaultValue: 1 }), "number"],
  ["boolean", () => field.boolean({ defaultValue: true }), "boolean"],
  ["date", () => field.date({ defaultValue: "2026-09-07" }), "date"],
  ["datetime", () => field.datetime({ defaultValue: "2026-09-07T00:00:00.000Z" }), "datetime"],
  ["select", () => field.select({ defaultValue: "news", options: ["news"] }), "select"],
  ["url", () => field.url({ defaultValue: "https://lacecms.dev" }), "url"],
  ["media", () => field.media({ defaultValue: "01K4M0D3LQYH8ND26GG2DDC8N2" }), "media"],
];

test.each(fieldCases)("builds a %s descriptor", (_name, build, type) => {
  const definition = build();

  expect(definition).toMatchObject({ required: false, type });
  expect(Object.isFrozen(definition)).toBe(true);
});

test("normalizes common and type-specific options", () => {
  const text = field.text({
    defaultValue: "lace",
    description: "Visible heading",
    label: "Heading",
    maxLength: 10,
    minLength: 3,
    required: true,
  });
  const number = field.number({ defaultValue: 4, max: 5, min: 1 });
  const select = field.select({
    defaultValue: "design",
    options: ["design", "engineering"],
  });

  expect(text).toEqual({
    defaultValue: "lace",
    description: "Visible heading",
    label: "Heading",
    maxLength: 10,
    minLength: 3,
    required: true,
    type: "text",
  });
  expect(number).toEqual({ defaultValue: 4, max: 5, min: 1, required: false, type: "number" });
  expect(select).toEqual({
    defaultValue: "design",
    options: ["design", "engineering"],
    required: false,
    type: "select",
  });
});

test("detaches and freezes caller-provided options and rich-text defaults", () => {
  const selectSource = {
    options: ["design", "engineering"] as [string, ...string[]],
  };
  const richTextSource = {
    defaultValue: {
      content: [
        { content: [{ text: "before", type: "text" as const }], type: "paragraph" as const },
      ],
      type: "doc" as const,
    },
  };
  const definition = field.select(selectSource);
  const richText = field.richText(richTextSource);

  selectSource.options[0] = "changed";
  richTextSource.defaultValue.content[0]!.content[0]!.text = "after";

  expect(definition.options).toEqual(["design", "engineering"]);
  expect(richText.defaultValue).toEqual({
    content: [{ content: [{ text: "before", type: "text" }], type: "paragraph" }],
    type: "doc",
  });
  expect(Object.isFrozen(definition.options)).toBe(true);
  expect(Object.isFrozen(richText.defaultValue!.content)).toBe(true);
});

test("projects detached serializable form metadata", () => {
  const definition = field.text({ defaultValue: "Lace", label: "Title", minLength: 1 });
  const metadata = toFieldMetadata(definition);
  const roundTrip = JSON.parse(JSON.stringify(metadata));

  expect(metadata).toEqual(definition);
  expect(metadata).not.toBe(definition);
  expect(roundTrip).toEqual({
    defaultValue: "Lace",
    label: "Title",
    minLength: 1,
    required: false,
    type: "text",
  });
  expect(JSON.stringify(metadata)).not.toContain("function");
});

const invalidConfigurations: [string, () => FieldDefinition][] = [
  ["function", () => unsafeField.text({ label: /** @type {string} */ (() => "bad") })],
  ["symbol", () => unsafeField.text({ label: /** @type {string} */ (Symbol("bad")) })],
  ["bigint", () => unsafeField.number({ min: /** @type {number} */ (1n) })],
  ["non-finite number", () => unsafeField.number({ min: Number.NaN })],
  ["host object", () => unsafeField.date({ defaultValue: /** @type {string} */ (new Date()) })],
  ["unknown option", () => unsafeField.boolean({ unsupported: true })],
  ["malformed common option", () => unsafeField.url({ required: /** @type {boolean} */ ("yes") })],
  ["malformed numeric option", () => unsafeField.number({ min: /** @type {number} */ ("1") })],
  ["duplicate select choice", () => unsafeField.select({ options: ["news", "news"] })],
  ["empty select choices", () => unsafeField.select({ options: /** @type {[string]} */ ([]) })],
  [
    "non-string select choice",
    () => unsafeField.select({ options: /** @type {[string]} */ ([1]) }),
  ],
  ["contradictory string bounds", () => unsafeField.text({ maxLength: 1, minLength: 2 })],
  ["contradictory numeric bounds", () => unsafeField.number({ max: 1, min: 2 })],
  ["negative string bound", () => unsafeField.text({ minLength: -1 })],
  ["fractional string bound", () => unsafeField.text({ maxLength: 1.5 })],
  [
    "wrong boolean default",
    () => unsafeField.boolean({ defaultValue: /** @type {boolean} */ ("true") }),
  ],
  ["wrong date default", () => unsafeField.date({ defaultValue: /** @type {string} */ (1) })],
  [
    "wrong rich-text default",
    () => unsafeField.richText({ defaultValue: /** @type {object} */ ([]) }),
  ],
  [
    "malformed rich-text default",
    () =>
      unsafeField.richText({
        defaultValue: { content: [{ text: "Lace", type: "text" }], type: "doc" },
      }),
  ],
  [
    "disallowed rich-text default node",
    () => unsafeField.richText({ defaultValue: { content: [{ type: "html" }], type: "doc" } }),
  ],
  [
    "unsafe rich-text default link",
    () =>
      unsafeField.richText({
        defaultValue: {
          content: [
            {
              content: [
                {
                  marks: [{ attrs: { href: "javascript:alert(1)" }, type: "link" }],
                  text: "Lace",
                  type: "text",
                },
              ],
              type: "paragraph",
            },
          ],
          type: "doc",
        },
      }),
  ],
  ["too-short text default", () => unsafeField.text({ defaultValue: "x", minLength: 2 })],
  ["out-of-bounds number default", () => unsafeField.number({ defaultValue: 6, max: 5 })],
  [
    "unknown select default",
    () => unsafeField.select({ defaultValue: "other", options: ["news"] }),
  ],
];

test.each(invalidConfigurations)("rejects %s", (_name, build) => {
  expect(build).toThrow(FieldConfigurationError);
  expect(build).toThrow(/options/u);
});

test("reports cyclic and sparse values with their option path", () => {
  const cyclic: { defaultValue: { content: unknown[]; type: string; self?: unknown } } = {
    defaultValue: { content: [], type: "doc" },
  };
  cyclic.defaultValue.self = cyclic;
  const sparse = ["news"];
  sparse[2] = "design";

  expect(() => unsafeField.richText(cyclic)).toThrow(/options\.defaultValue\.self/u);
  expect(() => unsafeField.select({ options: sparse })).toThrow(/options\.options\[1\]/u);
});

test("rejects symbols and accessors without executing them", () => {
  const symbolOptions = { [Symbol("field")]: "value" };
  const accessorOptions = {};
  Object.defineProperty(accessorOptions, "label", {
    enumerable: true,
    get() {
      throw new Error("must not execute");
    },
  });

  expect(() => field.text(symbolOptions)).toThrow(/symbol/u);
  expect(() => field.text(accessorOptions)).toThrow(/accessor/u);
});

test("keeps a valid renamedFrom hint on every field kind and rejects it in blocks", () => {
  const renamed = field.text({ maxLength: 20, renamedFrom: "headline" });
  expect(renamed).toEqual({
    maxLength: 20,
    renamedFrom: "headline",
    required: false,
    type: "text",
  });
  expect(validateFieldValue(renamed, "Hello")).toBe("Hello");
  expect(field.media({ renamedFrom: "cover" })).toMatchObject({ renamedFrom: "cover" });
  expect(field.select({ options: ["a"], renamedFrom: "kind" })).toMatchObject({
    renamedFrom: "kind",
  });
  expect(field.number({ renamedFrom: "count2" })).toMatchObject({ renamedFrom: "count2" });

  for (const value of ["", "1abc", "has-hyphen", 3]) {
    expect(() => unsafeField.text({ renamedFrom: value })).toThrow(FieldConfigurationError);
  }
  expect(() =>
    defineBlock({
      fields: { title: field.text({ renamedFrom: "heading" }) },
      type: "hero",
      version: 1,
    }),
  ).toThrow(/fields\.title must not declare renamedFrom/u);
});
