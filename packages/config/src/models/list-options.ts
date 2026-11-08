import { isPlainObject } from "@lacecms/content";
import { fieldTypeCapabilities } from "@lacecms/content";
import type { FieldMap, CollectionListOptions } from "./types.js";
import { fail } from "../shared/errors.js";
import { assertOnlyKeys } from "../shared/assertions.js";

export function normalizeListFields(value: unknown, fields: FieldMap): readonly string[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    fail("listFields must be an array of field keys.");
  }

  const normalized: string[] = [];
  const seen = new Set<string>();
  for (const key of value) {
    if (typeof key !== "string") {
      fail("listFields must contain field keys.");
    }
    if (seen.has(key)) {
      fail(`listFields contains duplicate field "${key}".`);
    }
    const definition = Object.hasOwn(fields, key) ? fields[key] : undefined;
    if (definition === undefined) {
      fail(`listFields references undeclared field "${key}".`);
    }
    if (!fieldTypeCapabilities[definition.type].listQueryable) {
      fail(`listFields field "${key}" must be a scalar field, not ${definition.type}.`);
    }
    seen.add(key);
    normalized.push(key);
  }
  return normalized;
}

export function normalizeListOptions(
  value: unknown,
  fields: FieldMap,
): CollectionListOptions | undefined {
  if (value === undefined) return undefined;
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !isPlainObject(value)
  ) {
    fail("listOptions must be a plain object.");
  }
  const keys = ["sortableFields", "filterableFields", "searchableFields"] as const;
  assertOnlyKeys(value, keys, "listOptions");
  const result: Record<string, readonly string[]> = {};
  for (const operation of keys) {
    const targets = value[operation];
    if (targets === undefined) continue;
    if (!Array.isArray(targets) || targets.length > 16)
      fail(`listOptions.${operation} must contain at most 16 field keys.`);
    const normalized = normalizeListFields(targets, fields);
    if (
      operation === "searchableFields" &&
      normalized.some((key) => !fieldTypeCapabilities[fields[key]!.type].searchable)
    ) {
      fail("listOptions.searchableFields requires text or textarea fields.");
    }
    if (normalized.length) result[operation] = normalized;
  }
  return Object.keys(result).length ? result : undefined;
}
