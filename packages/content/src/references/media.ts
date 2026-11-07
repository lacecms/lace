import type { ValidationPathSegment } from "../shared/errors.js";
import type { ModelFieldDefinitions, FieldDefinition } from "../fields/definitions.js";
import type { JsonObject, JsonValue } from "../shared/json.js";
import { isRecord } from "../shared/objects.js";

/** A declared media leaf with a typed relative path. */
export interface FieldMediaReference {
  readonly mediaId: string;
  readonly path: readonly ValidationPathSegment[];
}

/** Finds declared media leaves only; ordinary strings never become references. */
export function collectFieldMedia(
  definitions: ModelFieldDefinitions,
  values: JsonObject,
): readonly FieldMediaReference[] {
  const references: FieldMediaReference[] = [];
  function visit(
    definition: FieldDefinition,
    value: JsonValue | undefined,
    path: readonly ValidationPathSegment[],
  ): void {
    if (definition.type === "media" && typeof value === "string")
      references.push({ mediaId: value, path });
    else if (definition.type === "group" && isRecord(value))
      walk(definition.fields, value as JsonObject, path);
    else if (definition.type === "list" && Array.isArray(value))
      value.forEach((item, index) => visit(definition.item, item, [...path, index]));
  }
  function walk(
    fields: ModelFieldDefinitions,
    data: JsonObject,
    path: readonly ValidationPathSegment[],
  ): void {
    for (const [key, definition] of Object.entries(fields))
      visit(definition, data[key], [...path, key]);
  }
  walk(definitions, values, []);
  return references;
}

/**
 * Removes one media item from declared media leaves: a matching media value is
 * dropped from its object, and a matching element of a list of media is removed
 * from the list. Every other value is kept; the input is returned unchanged when
 * nothing matches.
 */
export function detachFieldMedia(
  definitions: ModelFieldDefinitions,
  values: JsonObject,
  mediaId: string,
): JsonObject {
  const matches = (definition: FieldDefinition, value: JsonValue | undefined): boolean =>
    definition.type === "media" && value === mediaId;
  function visit(definition: FieldDefinition, value: JsonValue | undefined): JsonValue | undefined {
    if (definition.type === "group" && isRecord(value))
      return walk(definition.fields, value as JsonObject);
    if (definition.type !== "list" || !Array.isArray(value)) return value;
    let changed = false;
    const items: JsonValue[] = [];
    for (const item of value) {
      if (matches(definition.item, item)) {
        changed = true;
        continue;
      }
      const next = visit(definition.item, item)!;
      changed ||= next !== item;
      items.push(next);
    }
    return changed ? items : value;
  }
  function walk(fields: ModelFieldDefinitions, data: JsonObject): JsonObject {
    let result: Record<string, JsonValue> | undefined;
    for (const [key, definition] of Object.entries(fields)) {
      const value = data[key];
      if (matches(definition, value)) {
        result ??= { ...data };
        delete result[key];
        continue;
      }
      const next = visit(definition, value);
      if (next !== value) {
        result ??= { ...data };
        result[key] = next!;
      }
    }
    return result ?? data;
  }
  return walk(definitions, values);
}

/**
 * Resolves the alt text of one media usage: a non-blank usage alt (such as the
 * `image` block's `alt`), then a non-blank media alt, then an empty string.
 */
export function effectiveAltText(
  usageAlt: string | null | undefined,
  mediaAlt: string | null | undefined,
): string {
  if (typeof usageAlt === "string" && usageAlt.trim().length > 0) return usageAlt;
  if (typeof mediaAlt === "string" && mediaAlt.trim().length > 0) return mediaAlt;
  return "";
}
