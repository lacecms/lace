import { CONTENT_ENTRY_SYSTEM_SORTS, isPlainObject } from "@lacecms/content";
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
  assertOnlyKeys(value, [...keys, "defaultSort"], "listOptions");
  const result: Record<string, readonly string[] | string> = {};
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
  const defaultSort = normalizeDefaultSort(
    value.defaultSort,
    (result.sortableFields as readonly string[] | undefined) ?? [],
  );
  if (defaultSort !== undefined) result.defaultSort = defaultSort;
  return Object.keys(result).length ? (result as CollectionListOptions) : undefined;
}

// The documented default needs no declaration, so writing it keeps hashes unchanged.
const IMPLICIT_DEFAULT_SORT = "-updatedAt";

function normalizeDefaultSort(value: unknown, sortable: readonly string[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") fail("listOptions.defaultSort must be a sort string.");
  if ((CONTENT_ENTRY_SYSTEM_SORTS as readonly string[]).includes(value)) {
    return value === IMPLICIT_DEFAULT_SORT ? undefined : value;
  }
  const field = /^-?field:(.+)$/u.exec(value)?.[1];
  if (field === undefined) {
    fail(
      `listOptions.defaultSort must be a system sort (${CONTENT_ENTRY_SYSTEM_SORTS.join(", ")}) or field:<key>.`,
    );
  }
  if (!sortable.includes(field)) {
    fail(`listOptions.defaultSort field "${field}" must be listed in listOptions.sortableFields.`);
  }
  return value;
}
