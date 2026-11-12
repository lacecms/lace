import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { importJsonSchema, schemaPath } from "../scripts/generate-import-schema.mjs";
import { parseImportPackage } from "../dist/import/import-format.js";

/** Minimal draft-07 subset used by the generated schema; returns error locations. */
function validate(schema, value, at = "") {
  if (schema.anyOf) {
    const results = schema.anyOf.map((option) => validate(option, value, at));
    return results.some((errors) => errors.length === 0) ? [] : [at];
  }
  if ("const" in schema && value !== schema.const) return [at];
  const type = Array.isArray(value) ? "array" : value === null ? "null" : typeof value;
  if (schema.type && schema.type !== type && !(schema.type === "integer" && type === "number"))
    return [at];
  const errors = [];
  if (type === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(at);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(at);
    if (schema.pattern !== undefined && !new RegExp(schema.pattern, "u").test(value))
      errors.push(at);
  }
  if (type === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(at);
    if (schema.maximum !== undefined && value > schema.maximum) errors.push(at);
  }
  if (type === "array") {
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(at);
    if (schema.items)
      for (const [index, item] of value.entries())
        errors.push(...validate(schema.items, item, `${at}/${index}`));
  }
  if (type === "object") {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${at}/${key}`);
    for (const [key, item] of Object.entries(value)) {
      const property = schema.properties?.[key];
      if (property) errors.push(...validate(property, item, `${at}/${key}`));
      else if (schema.additionalProperties === false) errors.push(`${at}/${key}`);
    }
  }
  return errors;
}

const sample = {
  $schema: "./node_modules/@lacecms/cli/schema/lace-import.schema.json",
  formatVersion: 1,
  media: [
    {
      key: "hero",
      file: "media/hero.png",
      alt: "A hero",
      caption: null,
      focalPoint: { x: 0.5, y: 0.25 },
      tags: ["project-a"],
    },
  ],
  entries: [
    {
      key: "launch",
      model: "posts",
      slug: "launch",
      title: "Launch",
      fields: { cover: { $media: "hero" }, related: { $entry: "about" } },
      blocks: [{ type: "quote", data: { quote: "Hi" }, hidden: false, anchor: "intro" }],
      seo: { image: { $media: "hero" } },
      publish: true,
    },
    { key: "about", model: "about", title: "About", fields: {}, blocks: [] },
  ],
};

describe("shipped JSON Schema", () => {
  test("the committed schema matches the format source", async () => {
    expect(JSON.parse(await readFile(schemaPath, "utf8"))).toEqual(importJsonSchema());
  });

  test("a package the CLI accepts passes the schema", () => {
    expect(parseImportPackage(sample).entries).toHaveLength(2);
    expect(validate(importJsonSchema(), sample)).toEqual([]);
  });

  test("the schema closes the levels the format closes", () => {
    const invalid = structuredClone(sample);
    invalid.extra = 1;
    invalid.media[0].unknown = 1;
    invalid.entries[0].blocks[0].unknown = 1;
    invalid.formatVersion = 2;
    expect(validate(importJsonSchema(), invalid)).toEqual([
      "/formatVersion",
      "/media/0/unknown",
      "/entries/0/blocks/0/unknown",
      "/extra",
    ]);
  });
});
