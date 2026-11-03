import type { FormLayout } from "./definitions.js";
import { FIELD_KEY_PATTERN } from "./definitions.js";
import { normalizeJsonValue } from "../shared/json.js";
import { isRecord, deepFreeze } from "../shared/objects.js";
import { fail } from "../shared/errors.js";

/** Validates, detaches and freezes optional sibling layout metadata. */
export function normalizeFormLayout<Key extends string>(
  value: unknown,
  fields: Readonly<Record<Key, unknown>>,
  path = "layout",
): FormLayout<Key> | undefined {
  if (value === undefined) return undefined;
  const raw = normalizeJsonValue(value, path, new WeakSet<object>());
  if (
    !isRecord(raw) ||
    Object.keys(raw).some((key) => !["mode", "groups"].includes(key)) ||
    (raw.mode !== "sections" && raw.mode !== "tabs") ||
    !Array.isArray(raw.groups) ||
    raw.groups.length === 0
  )
    fail(path, "must declare mode sections/tabs and nonempty groups.");
  const keys = new Set<string>();
  const placed = new Set<string>();
  for (const [index, group] of raw.groups.entries()) {
    const at = `${path}.groups.${index}`;
    if (
      !isRecord(group) ||
      Object.keys(group).some((key) => !["key", "label", "description", "fields"].includes(key)) ||
      typeof group.key !== "string" ||
      !FIELD_KEY_PATTERN.test(group.key) ||
      keys.has(group.key) ||
      typeof group.label !== "string" ||
      !group.label.trim() ||
      (group.description !== undefined && typeof group.description !== "string") ||
      !Array.isArray(group.fields) ||
      group.fields.length === 0
    )
      fail(at, "must declare a unique key, nonempty label and fields.");
    keys.add(group.key);
    for (const key of group.fields) {
      if (typeof key !== "string" || !Object.hasOwn(fields, key) || placed.has(key))
        fail(at, `contains unknown or repeated field ${String(key)}.`);
      placed.add(key);
    }
  }
  return deepFreeze(raw) as unknown as FormLayout<Key>;
}

/** Sibling field order used by rendering and validation summaries. */
export function formFieldKeys(
  fields: Readonly<Record<string, unknown>>,
  layout?: FormLayout,
): readonly string[] {
  const placed = layout?.groups.flatMap((group) => group.fields) ?? [];
  return [...placed, ...Object.keys(fields).filter((key) => !placed.includes(key))];
}
