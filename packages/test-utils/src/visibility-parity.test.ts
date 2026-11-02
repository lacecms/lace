import { expect, test } from "vitest";
import { transformConfigurationSyncFields } from "@lacecms/application";
import {
  ContentValidationError,
  effectiveVisibilityValues,
  isFieldVisible,
  publishedFieldValues,
  validateModelFields,
} from "@lacecms/content";
import type { JsonObject, JsonValue } from "@lacecms/content";
import { visibilityParityCases } from "./visibility-parity.js";

function occurrenceAt(root: JsonObject, path: readonly (string | number)[]): JsonObject {
  let value: JsonValue = root;
  for (const key of path) value = (value as Record<string | number, JsonValue>)[key]!;
  return value as JsonObject;
}

// A cleared form controller is unset on write; null itself is not a valid stored controller.
function unsetCleared(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(unsetCleared);
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, child]) => child !== null)
        .map(([key, child]) => [key, unsetCleared(child)]),
    );
  return value;
}

test.each(visibilityParityCases)("shared visibility parity: $name", (entry) => {
  const { fields, visibility, values, published, occurrences } = entry;
  expect(publishedFieldValues(fields, values, visibility)).toEqual(published);
  expect(
    transformConfigurationSyncFields(fields, [], values, "published", visibility).fields,
  ).toEqual(published);
  expect(transformConfigurationSyncFields(fields, [], values, "draft", visibility).fields).toEqual(
    values,
  );
  const writable = unsetCleared(values) as JsonObject;
  expect(() =>
    validateModelFields(fields, writable, "publish", ["fields"], visibility),
  ).not.toThrow();
  for (const occurrence of occurrences) {
    const present = occurrenceAt(values, occurrence.path);
    const effective = effectiveVisibilityValues(occurrence.fields, occurrence.visibility, present);
    expect(
      Object.keys(occurrence.fields).filter((key) =>
        isFieldVisible(occurrence.visibility, key, effective),
      ),
    ).toEqual(occurrence.visibleKeys);
    // Probe every required target independently, including exact nested paths.
    const reportedVisible: string[] = [];
    for (const key of Object.keys(occurrence.visibility)) {
      expect(occurrence.fields[key]!.required).toBe(true);
      const missing = structuredClone(writable);
      Reflect.deleteProperty(occurrenceAt(missing, occurrence.path), key);
      try {
        validateModelFields(fields, missing, "publish", ["fields"], visibility);
      } catch (error) {
        expect(error).toBeInstanceOf(ContentValidationError);
        expect((error as ContentValidationError).issues).toEqual([
          expect.objectContaining({
            code: "missing_required_field",
            path: ["fields", ...occurrence.path, key],
          }),
        ]);
        reportedVisible.push(key);
      }
    }
    expect(reportedVisible).toEqual(
      occurrence.visibleKeys.filter((key) => Object.hasOwn(occurrence.visibility, key)),
    );
  }
  // A hidden container also suppresses otherwise required descendants.
  if (entry.name === "hidden group hides its subtree") {
    expect(() =>
      validateModelFields(fields, { on: false, details: {} }, "publish", ["fields"], visibility),
    ).not.toThrow();
  }
});
