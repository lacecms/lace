import { expect, test } from "vitest";
import { fieldTypeCapabilities, fieldTypesWith, FIELD_FILTER_OPERATIONS } from "./capabilities.js";
import type { FieldTypeCapability } from "./capabilities.js";

test("field capabilities match every accepted specification row", () => {
  expect(
    Object.entries(fieldTypeCapabilities).map(([type, entry]) => {
      const capability: FieldTypeCapability = entry;
      return [
        type,
        capability.listQueryable,
        capability.sortableAs ?? null,
        capability.filterKind ?? null,
        capability.searchable,
        capability.seoText,
        capability.itemLabel,
        capability.placeholder,
        capability.valueKind,
      ];
    }),
  ).toEqual([
    ["text", true, "string", "text", true, true, true, true, "string"],
    ["textarea", true, "string", "text", true, true, true, true, "string"],
    ["richText", false, null, null, false, false, false, true, "object"],
    ["number", true, "number", "number", false, false, false, true, "number"],
    ["boolean", true, "boolean", "boolean", false, false, false, false, "boolean"],
    ["date", true, "date", "date", false, false, false, false, "string"],
    ["datetime", true, "datetime", "datetime", false, false, false, false, "string"],
    ["select", true, "string", "select", false, false, true, true, "string"],
    ["url", true, "string", "text", false, false, true, true, "string"],
    ["media", false, null, null, false, false, false, false, "string"],
    ["group", false, null, null, false, false, false, false, "object"],
    ["list", false, null, null, false, false, false, false, "array"],
  ]);
});

test("capability and operator declarations are deeply frozen", () => {
  for (const table of [fieldTypeCapabilities, FIELD_FILTER_OPERATIONS]) {
    expect(Object.isFrozen(table)).toBe(true);
    for (const entry of Object.values(table)) expect(Object.isFrozen(entry)).toBe(true);
  }
});

test("only queryable kinds have sorting and filter metadata", () => {
  for (const entry of Object.values(fieldTypeCapabilities)) {
    expect(Object.hasOwn(entry, "sortableAs")).toBe(entry.listQueryable);
    expect(Object.hasOwn(entry, "filterKind")).toBe(entry.listQueryable);
  }
  expect(fieldTypesWith("searchable")).toEqual(["text", "textarea"]);
  expect(Object.isFrozen(fieldTypesWith("listQueryable"))).toBe(true);
});

test("filter operations match the collection query specification", () => {
  expect(FIELD_FILTER_OPERATIONS).toEqual({
    text: ["contains", "eq"],
    select: ["in"],
    number: ["eq", "range"],
    boolean: ["eq"],
    date: ["range"],
    datetime: ["range"],
  });
});
