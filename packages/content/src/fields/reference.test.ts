import { expect, test } from "vitest";
import * as v from "valibot";
import { field } from "./builders.js";
import type { ReferenceFieldOptions } from "./definitions.js";
import { normalizeFieldDefinition } from "./normalization.js";
import { compileFieldSchema, validateModelFields } from "./validation.js";

test("a reference detaches and canonicalizes model keys while preserving the ID", () => {
  const models = ["reviews", "authors"];
  const reference = field.reference({ models, defaultValue: "A/b%2F" });
  models.push("posts");
  expect(reference.models).toEqual(["authors", "reviews"]);
  expect(Object.isFrozen(reference.models)).toBe(true);
  expect(normalizeFieldDefinition(JSON.parse(JSON.stringify(reference)))).toEqual(reference);
  expect(v.parse(compileFieldSchema(reference), "A/b%2F")).toBe("A/b%2F");
  const fields = {
    card: field.group({
      fields: { other: field.list({ item: reference, maxItems: 3 }) },
      defaultValue: { other: ["R/2", "r1", "R/2"] },
    }),
  };
  expect(validateModelFields(fields, {}, "draft")).toEqual({
    card: { other: ["R/2", "r1", "R/2"] },
  });
  expect(() =>
    validateModelFields(fields, { card: { other: ["a", "b", "c", "d"] } }, "draft"),
  ).toThrow(/at most 3/);
});

test.each([{}, { models: [] }, { models: ["a", "a"] }, { models: ["Bad"] }, { models: [1] }])(
  "rejects malformed model declarations at both boundaries: %j",
  (options) => {
    expect(() => field.reference(options as ReferenceFieldOptions)).toThrow(/options\.models/);
    expect(() =>
      normalizeFieldDefinition({ type: "reference", required: false, ...options }),
    ).toThrow(/options\.models/);
  },
);

test.each([
  { multiple: true },
  { placeholder: "Select" },
  { minLength: 1 },
  { defaultValue: "" },
  { defaultValue: { id: "a" } },
  { defaultValue: "a\nb" },
  { defaultValue: "x".repeat(256) },
  { defaultValue: "\ud800" },
])("rejects invalid reference options and defaults: %j", (invalid) => {
  const options = { models: ["reviews"], ...invalid };
  expect(() => field.reference(options as ReferenceFieldOptions)).toThrow();
  expect(() =>
    normalizeFieldDefinition({ ...options, type: "reference", required: false }),
  ).toThrow();
  if ("defaultValue" in invalid) {
    const item = field.reference({ models: ["reviews"] });
    expect(v.safeParse(compileFieldSchema(item), invalid.defaultValue).success).toBe(false);
    expect(() =>
      field.group({
        fields: { review: item },
        defaultValue: { review: invalid.defaultValue as string },
      }),
    ).toThrow();
  }
});
