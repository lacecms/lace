import { expect, test } from "vitest";
import {
  defineBlock,
  field,
  fieldTypeCapabilities,
  normalizeFieldDefinition,
  toBlockMetadata,
} from "@lacecms/content";
import * as v from "valibot";
import { blockMetadataSchema } from "../content/metadata.js";
import { contentMetadataOpenApi } from "./field-openapi.js";

type Schema = Record<string, unknown>;
const components: Record<string, Schema> = contentMetadataOpenApi;
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const keywords = new Set([
  "description",
  "type",
  "const",
  "enum",
  "required",
  "properties",
  "additionalProperties",
  "propertyNames",
  "pattern",
  "items",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minimum",
  "maximum",
  "minLength",
  "oneOf",
  "$ref",
]);

/** Deliberately limited to the descriptor vocabulary; schema growth must extend this evaluator. */
function accepts(schema: Schema, value: unknown): boolean {
  for (const key of Object.keys(schema))
    if (!keywords.has(key)) throw new Error(`Unsupported JSON Schema keyword: ${key}`);
  if (schema.$ref) return accepts(components[String(schema.$ref).split("/").at(-1)!]!, value);
  if (
    schema.oneOf &&
    (schema.oneOf as Schema[]).filter((child) => accepts(child, value)).length !== 1
  )
    return false;
  if ("const" in schema && schema.const !== value) return false;
  if (schema.enum && !(schema.enum as unknown[]).includes(value)) return false;
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (
      !types.some((type) =>
        type === "object"
          ? object(value)
          : type === "array"
            ? Array.isArray(value)
            : type === "integer"
              ? Number.isInteger(value)
              : typeof value === type,
      )
    )
      return false;
  }
  if (
    typeof value === "string" &&
    ((schema.minLength !== undefined && [...value].length < Number(schema.minLength)) ||
      (schema.pattern && !new RegExp(String(schema.pattern), "u").test(value)))
  )
    return false;
  if (
    typeof value === "number" &&
    ((schema.minimum !== undefined && value < Number(schema.minimum)) ||
      (schema.maximum !== undefined && value > Number(schema.maximum)))
  )
    return false;
  if (Array.isArray(value)) {
    if (
      (schema.minItems !== undefined && value.length < Number(schema.minItems)) ||
      (schema.maxItems !== undefined && value.length > Number(schema.maxItems))
    )
      return false;
    if (
      schema.uniqueItems &&
      new Set(value.map((item) => JSON.stringify(item))).size !== value.length
    )
      return false;
    if (schema.items && !value.every((item) => accepts(schema.items as Schema, item))) return false;
  }
  if (object(value)) {
    if (schema.required && !(schema.required as string[]).every((key) => Object.hasOwn(value, key)))
      return false;
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    for (const [key, child] of Object.entries(value)) {
      if (schema.propertyNames && !accepts(schema.propertyNames as Schema, key)) return false;
      if (properties[key]) {
        if (!accepts(properties[key], child)) return false;
      } else if (schema.additionalProperties === false) return false;
      else if (object(schema.additionalProperties) && !accepts(schema.additionalProperties, child))
        return false;
    }
  }
  return true;
}

const layout = {
  mode: "tabs",
  groups: [{ key: "main", label: "Main", description: "Fields", fields: ["title"] }],
} as const;
const valid = {
  text: field.text({ minLength: 1, maxLength: 10, defaultValue: "text", placeholder: "Title" }),
  textarea: field.textarea({
    minLength: 1,
    maxLength: 10,
    defaultValue: "text",
    placeholder: "Text",
  }),
  richText: field.richText({ defaultValue: { type: "doc", content: [] }, placeholder: "Body" }),
  number: field.number({ min: 0, max: 10, defaultValue: 1, placeholder: "Count" }),
  boolean: field.boolean({ defaultValue: false }),
  date: field.date({ defaultValue: "2026-01-01" }),
  datetime: field.datetime({ defaultValue: "2026-01-01T00:00:00Z" }),
  select: field.select({
    options: ["one"],
    defaultValue: "one",
    placeholder: "Choose",
    presentation: {
      control: "cards",
      choices: [
        {
          value: "one",
          label: "One",
          description: "First",
          diagram: { cells: [{ x: 0, y: 0, width: 1, height: 1 }] },
        },
      ],
    },
  }),
  url: field.url({
    embedProviders: ["youtube"],
    defaultValue: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    placeholder: "Video",
  }),
  media: field.media({ defaultValue: "media" }),
  group: field.group({ fields: { title: field.text() }, defaultValue: {}, layout }),
  list: field.list({
    item: field.group({ fields: { title: field.text() }, layout }),
    minItems: 0,
    maxItems: 10,
    defaultValue: [],
    itemLabel: "title",
  }),
};
const normalizes = (value: unknown) => {
  try {
    normalizeFieldDefinition(value);
    return true;
  } catch {
    return false;
  }
};

test("descriptor schemas and shared normalization agree on the capability-generated corpus", () => {
  const options = Object.fromEntries(
    Object.values(valid)
      .flatMap((definition) => Object.entries(definition))
      .filter(([key]) => !["type", "required", "defaultValue"].includes(key)),
  );
  let count = 0;
  for (const [kind, capability] of Object.entries(fieldTypeCapabilities)) {
    const definition = {
      ...valid[kind as keyof typeof valid],
      label: "Label",
      description: "Description",
    };
    const corpus: unknown[] = [definition, { ...definition, unknown: true }];
    for (const [key, value] of Object.entries(options))
      if (!Object.hasOwn(definition, key)) corpus.push({ ...definition, [key]: value });
    if (!capability.placeholder) corpus.push({ ...definition, placeholder: "Invalid" });
    corpus.push({ ...definition, defaultValue: capability.valueKind === "string" ? 1 : "wrong" });
    if (kind === "group") {
      const { layout: _, ...withoutLayout } = definition as typeof valid.group;
      corpus.push(withoutLayout);
    }
    expect(accepts(components.FieldDefinition!, definition), kind).toBe(true);
    for (const descriptor of corpus) {
      expect(accepts(components.FieldDefinition!, descriptor), JSON.stringify(descriptor)).toBe(
        normalizes(descriptor),
      );
      count++;
    }
  }
  expect(count).toBeGreaterThan(100);
});

test("layouts on block data and settings agree with shared metadata validation", () => {
  const metadata = toBlockMetadata(
    defineBlock({
      type: "layoutTest",
      version: 1,
      fields: { title: field.text() },
      layout,
      settings: { title: field.text({ defaultValue: "Title" }) },
      settingsLayout: layout,
    }),
  );
  expect(v.safeParse(blockMetadataSchema, metadata).success).toBe(true);
  expect(accepts(components.BlockMetadata!, metadata)).toBe(true);
});

test("descriptor evaluator throws when a schema adds an unsupported keyword", () => {
  expect(() => accepts({ anyOf: [] }, {})).toThrow("Unsupported JSON Schema keyword: anyOf");
});
