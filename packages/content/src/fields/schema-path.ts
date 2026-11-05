import { FIELD_KEY_PATTERN } from "./definitions.js";
import type { FieldDefinition, ModelFieldDefinitions } from "./definitions.js";

/** Parse a root key or wildcard schema pointer, never a concrete item index. */
export function parseSchemaPath(value: string): readonly string[] {
  if (typeof value !== "string") throw new TypeError("Schema path must be a string.");
  const parts =
    typeof value === "string" && value.startsWith("/") ? value.slice(1).split("/") : [value];
  if (
    parts.length === 0 ||
    parts.some((part) => part !== "*" && !FIELD_KEY_PATTERN.test(part)) ||
    parts[0] === "*"
  )
    throw new TypeError(`Invalid schema path: ${String(value)}.`);
  return Object.freeze(parts);
}

/** Preserve scalar root addresses while using pointers for descendants. */
export function encodeSchemaPath(parts: readonly string[]): string {
  return parts.length === 1 ? parts[0]! : `/${parts.join("/")}`;
}

/** Resolve descriptor positions, rejecting known invalid container transitions. */
export function schemaFieldAt(
  fields: ModelFieldDefinitions,
  parts: readonly string[],
): FieldDefinition | undefined {
  let current: FieldDefinition | undefined = Object.hasOwn(fields, parts[0]!)
    ? fields[parts[0]!]
    : undefined;
  for (const segment of parts.slice(1)) {
    if (current === undefined) return undefined;
    if (segment === "*" && current.type === "list") current = current.item;
    else if (segment !== "*" && current.type === "group")
      current = Object.hasOwn(current.fields, segment) ? current.fields[segment] : undefined;
    else throw new TypeError(`Invalid schema traversal: ${encodeSchemaPath(parts)}.`);
  }
  return current;
}
